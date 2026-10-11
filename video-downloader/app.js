(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const terminal = new Set(['completed', 'failed', 'cancelled']);
  const state = { connected: false, token: '', mode: '', media: null, kind: 'mp4', height: 'best', bitrate: 192, jobs: [], view: 'active', busy: false, jobsKey: '' };
  const defaultBase = /^https?:$/.test(location.protocol) ? location.origin : 'http://127.0.0.1:8910';
  let apiBase = defaultBase;
  try { apiBase = localStorage.getItem('toolhub-media-api') || defaultBase; } catch (_) { /* Storage may be disabled in embedded pages. */ }
  function loadToken() {
    state.token = '';
    try { state.token = sessionStorage.getItem('toolhub-media-token:' + apiBase) || ''; } catch (_) { /* Login remains available without storage. */ }
  }
  loadToken();
  let toastTimer;
  let currentRequest = 0;
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  function textElement(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function timeLabel(value) {
    if (!Number.isFinite(value)) return '—';
    const seconds = Math.max(0, Math.floor(value));
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
  }
  function parseTime(value) {
    if (!/^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?){0,2}$/.test(value.trim())) return NaN;
    return value.trim().split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }
  function sizeLabel(bytes) {
    if (!Number.isFinite(bytes)) return '—';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
    return (bytes / 1024 ** 3).toFixed(2) + ' GB';
  }
  function notice(message, info = false) {
    $('notice').textContent = message;
    $('notice').classList.toggle('info', info);
    $('notice').hidden = !message;
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
  }
  function safeImage(url) {
    try { const parsed = new URL(url); return parsed.protocol === 'https:' ? parsed.href : ''; } catch (_) { return ''; }
  }
  async function request(path, body, timeout = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(apiBase + path, {
        method: body ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
        headers: { 'X-ToolHub-Token': state.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '下載服務無法處理這個請求。');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('連線或處理時間較長。免費雲端服務首次啟動約需一分鐘，請稍後重試。');
      if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('無法連接下載服務。請確認服務網址；若雲端正在啟動，請稍後重新連線。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function connect(showMessage = false) {
    $('connection-label').textContent = '正在連線';
    try {
      const health = await request('/api/health', null, showMessage ? 75000 : 10000);
      if (health.service !== 'toolhub-media') throw new Error('這個網址不是影音下載服務。');
      state.token = health.token || '';
      state.mode = health.mode;
      state.connected = health.ready && !health.requires_login;
      $('connection-button').classList.toggle('online', state.connected);
      $('connection-label').textContent = health.requires_login ? '等待登入' : health.ready ? '下載服務已連線' : '缺少下載元件';
      $('setup-panel').hidden = health.ready;
      $('login-panel').hidden = !health.requires_login;
      $('logout-button').hidden = state.mode !== 'cloud' || !state.connected;
      $('service-footer').textContent = state.mode === 'cloud' ? 'ToolHub Media · 雲端處理' : 'ToolHub Media · 在你的電腦上處理';
      document.querySelector('.brand').href = state.mode === 'cloud' ? 'https://gaia22222.github.io/ComfyuiTools/' : 'index.html';
      $('cloud-limits').hidden = state.mode !== 'cloud';
      if (state.mode === 'cloud') $('cloud-limits').textContent = `雲端模式：最高 ${health.limits.height}p · 影片最長 ${Math.floor(health.limits.duration / 60)} 分鐘 · 暫存上限 ${health.limits.download_mb} MB · 完成後請在 ${Math.floor(health.limits.retention / 60)} 分鐘內儲存，服務重啟會清除暫存。`;
      const missing = [!health.yt_dlp && 'yt-dlp', !health.ffmpeg && 'FFmpeg', !health.node && 'Node.js'].filter(Boolean);
      $('dependency-note').hidden = !missing.length;
      $('dependency-note').textContent = '缺少：' + missing.join('、') + '。請安裝後重新啟動下載服務。';
      $('health-details').textContent = `yt-dlp ${health.yt_dlp || '未安裝'} · FFmpeg ${health.ffmpeg ? '就緒' : '未安裝'} · Node.js ${health.node ? '就緒' : '未安裝'}`;
      if (state.connected) {
        await refreshJobs();
        if (showMessage) { notice(''); toast('下載服務已連線'); }
      } else if (health.requires_login) {
        state.jobs = []; state.jobsKey = ''; renderJobs();
      }
    } catch (error) {
      state.connected = false;
      $('connection-button').classList.remove('online');
      $('connection-label').textContent = '下載服務未連線';
      $('setup-panel').hidden = false;
      $('login-panel').hidden = true;
      const local = /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(apiBase);
      $('setup-title').textContent = local ? '啟動本地服務，即可開始下載' : '連接雲端下載服務，即可開始使用';
      $('setup-description').textContent = local ? '雙擊工具資料夾的 Start-VideoDownloader.cmd，再按重新連線。' : '在服務設定填入你的雲端網址。免費雲端服務休眠後，首次啟動可能需要約一分鐘。';
      $('health-details').textContent = '服務未連線';
      if (showMessage) notice(error.message);
    }
    updateSummary();
  }
  function setBusy(busy, isSearch = false) {
    state.busy = busy;
    $('analyze-button').disabled = busy;
    document.querySelector('.source-field').classList.toggle('busy', busy);
    $('analyze-button').querySelector('span').textContent = busy ? (isSearch ? '搜尋中…' : '解析中…') : '解析連結';
  }
  async function inspect(url) {
    const number = ++currentRequest;
    setBusy(true);
    notice('');
    state.media = null;
    $('media-content').hidden = true;
    $('empty-media').hidden = false;
    $('media-state').textContent = '正在解析…';
    updateSummary();
    try {
      if (!state.connected) { await connect(); if (!state.connected) throw new Error('請先連接下載服務並登入，再解析影片。'); }
      const media = await request('/api/inspect', { url }, 120000);
      if (number !== currentRequest) return;
      state.media = media;
      state.height = 'best';
      $('source-input').value = media.url;
      $('search-results').hidden = true;
      showMedia();
    } catch (error) { if (number === currentRequest) { $('media-state').textContent = '等待影片連結'; notice(error.message); } }
    finally { if (number === currentRequest) setBusy(false); }
  }
  async function search(query) {
    setBusy(true, true);
    notice('');
    try {
      if (!state.connected) { await connect(); if (!state.connected) throw new Error('請先連接下載服務並登入，再搜尋影片。'); }
      const result = await request('/api/search', { query }, 120000);
      const container = $('search-results');
      container.replaceChildren(textElement('h2', 'YouTube 搜尋結果'));
      if (!result.results.length) container.append(textElement('p', '找不到影片，請更換關鍵字。', 'option-note'));
      result.results.forEach(media => {
        const button = document.createElement('button');
        button.className = 'search-result';
        const thumbnail = safeImage(media.thumbnail);
        if (thumbnail) {
          const img = document.createElement('img'); img.src = thumbnail; img.alt = ''; img.loading = 'lazy';
          img.addEventListener('error', () => { img.hidden = true; }); button.append(img);
        }
        const info = document.createElement('div');
        info.append(textElement('strong', media.title || '未命名影片'), textElement('p', [media.author, timeLabel(media.duration)].filter(Boolean).join(' · ')));
        button.append(info); button.insertAdjacentHTML('beforeend', icon('arrow'));
        button.addEventListener('click', () => inspect(media.url));
        container.append(button);
      });
      container.hidden = false;
    } catch (error) { notice(error.message); }
    finally { setBusy(false); }
  }
  function showMedia() {
    const media = state.media;
    $('empty-media').hidden = true;
    $('media-content').hidden = false;
    $('media-state').textContent = '已解析 · ' + media.platform;
    $('media-platform').textContent = media.platform;
    $('media-title').textContent = media.title;
    $('media-author').textContent = media.author;
    $('media-duration').textContent = timeLabel(media.duration);
    $('media-original').href = media.url;
    const thumbnail = safeImage(media.thumbnail);
    $('media-thumbnail').hidden = !thumbnail;
    $('no-thumbnail').hidden = !!thumbnail;
    if (thumbnail) $('media-thumbnail').src = thumbnail;
    $('quality-options').replaceChildren();
    for (const height of ['best', ...media.heights]) {
      const button = document.createElement('button');
      button.className = 'choice' + (height === state.height ? ' selected' : '');
      button.append(textElement('span', height === 'best' ? '最佳畫質' : height + 'p'));
      button.append(textElement('small', height === 'best' ? '自動選擇' : height >= 2160 ? '超高畫質' : height >= 1080 ? '高畫質' : '標準畫質'));
      button.setAttribute('aria-pressed', String(height === state.height));
      button.addEventListener('click', () => { state.height = height; $('quality-options').querySelectorAll('.choice').forEach(node => { node.classList.toggle('selected', node === button); node.setAttribute('aria-pressed', String(node === button)); }); updateSummary(); });
      $('quality-options').append(button);
    }
    $('subtitle-language').replaceChildren();
    media.subtitles.forEach((subtitle, index) => {
      const option = document.createElement('option'); option.value = index;
      option.textContent = `${subtitle.name} (${subtitle.language}) · ${subtitle.source === 'auto' ? '自動' : '人工'}`;
      $('subtitle-language').append(option);
    });
    const preferred = media.subtitles.findIndex(s => /^(zh-Hant|zh-TW|zh-HK|zh|en)$/.test(s.language) && s.source === 'manual');
    if (preferred >= 0) $('subtitle-language').value = preferred;
    $('subtitle-fields').hidden = !media.subtitles.length;
    $('subtitle-note').textContent = media.subtitles.length ? '字幕來自原影片；TXT 會移除時間軸。自動字幕可能有辨識錯誤。' : '這段影片沒有可下載的字幕。';
    $('clip-toggle').checked = false;
    $('clip-fields').hidden = true;
    $('clip-start').value = '00:00';
    $('clip-end').value = timeLabel(media.duration || 30);
    for (const name of ['start', 'end']) $('clip-' + name + '-range').max = media.duration || 3600;
    syncRanges();
    document.querySelectorAll('.format-tab').forEach(tab => { tab.disabled = (tab.dataset.kind === 'mp4' && !media.heights.length) || (tab.dataset.kind === 'mp3' && !media.has_audio) || (tab.dataset.kind === 'thumbnail' && !media.has_thumbnail); });
    const requested = document.querySelector(`[data-kind="${state.kind}"]`);
    if (requested.disabled) state.kind = media.heights.length ? 'mp4' : media.has_audio ? 'mp3' : 'subtitle';
    setKind(state.kind);
    updateClip();
  }
  function setKind(kind) {
    state.kind = kind;
    document.querySelectorAll('.format-tab').forEach(tab => { const active = tab.dataset.kind === kind; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
    $('format-panel').setAttribute('aria-labelledby', 'tab-' + kind);
    for (const [type, id] of Object.entries({ mp4: 'video-options', mp3: 'audio-options', thumbnail: 'thumbnail-options', subtitle: 'subtitle-options' })) $(id).hidden = kind !== type;
    $('clip-section').hidden = !['mp4', 'mp3'].includes(kind);
    updateSummary();
  }
  function syncRanges() {
    for (const name of ['start', 'end']) { const value = parseTime($('clip-' + name).value); if (Number.isFinite(value)) $('clip-' + name + '-range').value = value; }
  }
  function updateClip() {
    const start = parseTime($('clip-start').value), end = parseTime($('clip-end').value);
    $('clip-duration').textContent = Number.isFinite(start + end) && end > start ? '片段長度 ' + timeLabel(end - start) : '請設定有效的片段時間';
    updateSummary();
  }
  function updateSummary() {
    let summary = { mp4: 'MP4 · ' + (state.height === 'best' ? '最佳畫質' : state.height + 'p'), mp3: 'MP3 · ' + state.bitrate + ' kbps', thumbnail: 'JPG · 原始封面', subtitle: $('subtitle-format').value.toUpperCase() + ' · 字幕' }[state.kind];
    if (['mp4', 'mp3'].includes(state.kind) && $('clip-toggle').checked) summary += ' · 片段';
    $('selection-summary').textContent = summary;
    $('download-button').disabled = !state.connected || !state.media || (state.kind === 'subtitle' && !state.media.subtitles.length);
  }
  async function addDownload() {
    const media = state.media;
    if (!media) return;
    const body = { token: media.token, kind: state.kind, height: state.height, bitrate: state.bitrate, subtitle_format: $('subtitle-format').value };
    if (state.kind === 'subtitle') { const subtitle = media.subtitles[Number($('subtitle-language').value)]; if (!subtitle) return; body.language = subtitle.language; body.subtitle_source = subtitle.source; }
    if (['mp4', 'mp3'].includes(state.kind) && $('clip-toggle').checked) {
      body.start = $('clip-start').value.trim(); body.end = $('clip-end').value.trim();
      const start = parseTime(body.start), end = parseTime(body.end);
      if (!Number.isFinite(start + end) || end <= start || (media.duration && end > media.duration)) { notice('請填寫有效的開始與結束時間，且結束時間不能超過影片長度。'); return; }
    }
    $('download-button').disabled = true;
    notice('');
    try { const job = await request('/api/jobs', body); state.jobs.unshift(job); setJobView('active'); await refreshJobs(); toast('已加入下載佇列'); }
    catch (error) { notice(error.message); }
    finally { updateSummary(); }
  }
  function setJobView(view) {
    state.view = view; state.jobsKey = '';
    $('active-jobs-tab').classList.toggle('active', view === 'active'); $('history-tab').classList.toggle('active', view === 'history');
    $('active-jobs-tab').setAttribute('aria-pressed', String(view === 'active')); $('history-tab').setAttribute('aria-pressed', String(view === 'history'));
    renderJobs();
  }
  async function refreshJobs() {
    if (!state.token) return;
    const result = await request('/api/jobs');
    const wasActive = state.jobs.some(job => !terminal.has(job.status));
    state.jobs = result.jobs;
    if (wasActive && !state.jobs.some(job => !terminal.has(job.status))) setJobView('history');
    renderJobs();
  }
  function renderJobs() {
    const active = state.jobs.filter(job => !terminal.has(job.status));
    $('active-count').textContent = active.length;
    $('history-count').textContent = state.jobs.length - active.length;
    $('queue-count').textContent = state.jobs.length;
    const jobs = state.view === 'active' ? active : state.jobs.filter(job => terminal.has(job.status));
    const key = JSON.stringify([state.view, jobs, state.token]);
    if (state.jobsKey === key) return;
    state.jobsKey = key;
    const focused = document.activeElement?.dataset.focusKey;
    const list = $('jobs-list'); list.replaceChildren();
    if (!jobs.length) {
      const empty = document.createElement('div'); empty.className = 'queue-empty'; empty.innerHTML = icon(state.view === 'active' ? 'download' : 'clock');
      empty.append(textElement('strong', state.view === 'active' ? '還沒有下載工作' : '尚無歷史紀錄'), textElement('p', state.view === 'active' ? '解析影片後加入下載，\n進度會在這裡顯示。' : '已完成、失敗與取消的工作\n會保留在這裡。'));
      list.append(empty); return;
    }
    jobs.forEach(job => {
      const card = document.createElement('article'); card.className = 'job-card';
      const top = document.createElement('div'); top.className = 'job-top'; top.append(textElement('h3', job.title));
      if (!terminal.has(job.status)) {
        const cancel = document.createElement('button'); cancel.className = 'cancel-job'; cancel.innerHTML = icon('close'); cancel.setAttribute('aria-label', '取消下載 ' + job.title); cancel.dataset.focusKey = 'cancel-' + job.id;
        cancel.addEventListener('click', async () => { cancel.disabled = true; try { await request('/api/jobs/' + job.id + '/cancel', {}); await refreshJobs(); } catch (error) { notice(error.message); cancel.disabled = false; } }); top.append(cancel);
      }
      card.append(top);
      const meta = document.createElement('div'); meta.className = 'job-meta';
      let format = { mp4: 'MP4 · ' + (job.height === 'best' ? '最佳' : job.height + 'p'), mp3: 'MP3 · ' + job.bitrate + 'k', thumbnail: 'JPG 封面', subtitle: job.subtitle_format.toUpperCase() + ' · ' + job.language }[job.kind];
      if (job.start !== null) format += ' · 片段';
      const statuses = { queued: '等候中', downloading: '下載中', processing: '合併／轉檔中', completed: '已完成', failed: '失敗', cancelled: '已取消' };
      meta.append(textElement('span', format), textElement('span', statuses[job.status], 'job-status ' + job.status)); card.append(meta);
      if (!terminal.has(job.status)) {
        const track = document.createElement('div'); track.className = 'progress-track'; track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', '下載進度'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
        const fill = document.createElement('div'); fill.className = 'progress-fill';
        if (job.progress === null || job.status === 'processing') fill.classList.add('indeterminate'); else { fill.style.width = job.progress + '%'; track.setAttribute('aria-valuenow', job.progress); }
        track.append(fill); card.append(track);
        const detail = document.createElement('div'); detail.className = 'job-detail';
        detail.append(textElement('span', job.status === 'processing' ? '檔案處理中，請稍候' : (job.speed ? sizeLabel(job.speed) + '/s' : '準備檔案…')), textElement('span', job.status === 'downloading' && Number.isFinite(job.progress) ? job.progress + '%' : job.eta ? timeLabel(job.eta) : ''));
        card.append(detail);
      }
      if (job.error) card.append(textElement('p', job.error, 'job-error'));
      for (const file of job.files) {
        const row = document.createElement('div'); row.className = 'job-file';
        const link = document.createElement('a'); link.href = apiBase + '/api/files/' + job.id + '/' + encodeURIComponent(file.name) + '?token=' + encodeURIComponent(state.token); link.download = file.name; link.title = file.name; link.dataset.focusKey = 'file-' + job.id + '-' + file.name; link.innerHTML = icon('download'); link.append(document.createTextNode('儲存到裝置'));
        row.append(link, textElement('span', sizeLabel(file.size))); card.append(row);
      }
      if (['failed', 'cancelled'].includes(job.status)) {
        const retry = textElement('button', '重新下載', 'retry-job'); retry.dataset.focusKey = 'retry-' + job.id;
        retry.addEventListener('click', async () => {
          retry.disabled = true;
          try { const media = await request('/api/inspect', { url: job.url }, 120000); const nextJob = await request('/api/jobs', { ...job, token: media.token }); state.jobs.unshift(nextJob); setJobView('active'); await refreshJobs(); toast('已重新加入下載'); }
          catch (error) { notice(error.message); retry.disabled = false; }
        }); card.append(retry);
      }
      list.append(card);
    });
    if (focused) Array.from(list.querySelectorAll('[data-focus-key]')).find(node => node.dataset.focusKey === focused)?.focus({ preventScroll: true });
  }
  $('source-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = $('source-input').value.trim();
    if (!value || state.busy) return;
    const looksLikeUrl = /^https?:\/\//i.test(value) || /^(?:www\.|m\.|music\.|vm\.|vt\.)?(?:youtube\.com|youtu\.be|tiktok\.com|facebook\.com|fb\.watch|instagram\.com|twitter\.com|x\.com)(?:\/|$)/i.test(value);
    if (looksLikeUrl) inspect(value); else search(value);
  });
  $('paste-button').addEventListener('click', async () => { try { $('source-input').value = await navigator.clipboard.readText(); $('source-input').focus(); } catch (_) { toast('請使用 Ctrl+V，或在輸入框長按貼上'); $('source-input').focus(); } });
  document.querySelectorAll('.format-tab').forEach(tab => {
    tab.addEventListener('click', () => setKind(tab.dataset.kind));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = Array.from(document.querySelectorAll('.format-tab')).filter(node => !node.disabled);
      const index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus(); setKind(tabs[next].dataset.kind);
    });
  });
  document.querySelectorAll('[data-bitrate]').forEach(button => { button.setAttribute('aria-pressed', String(Number(button.dataset.bitrate) === state.bitrate)); button.addEventListener('click', () => { state.bitrate = Number(button.dataset.bitrate); document.querySelectorAll('[data-bitrate]').forEach(node => { node.classList.toggle('selected', node === button); node.setAttribute('aria-pressed', String(node === button)); }); updateSummary(); }); });
  $('subtitle-format').addEventListener('change', updateSummary);
  $('clip-toggle').addEventListener('change', () => { $('clip-fields').hidden = !$('clip-toggle').checked; updateClip(); });
  for (const name of ['start', 'end']) {
    $('clip-' + name).addEventListener('input', () => { syncRanges(); updateClip(); });
    $('clip-' + name + '-range').addEventListener('input', () => { $('clip-' + name).value = timeLabel(Number($('clip-' + name + '-range').value)); updateClip(); });
  }
  $('preview-clip').addEventListener('click', () => {
    const start = parseTime($('clip-start').value);
    if (!state.media || !Number.isFinite(start)) return;
    const url = new URL(state.media.url);
    if (state.media.platform === 'YouTube') url.searchParams.set('t', Math.floor(start) + 's');
    window.open(url.href, '_blank', 'noopener,noreferrer');
  });
  $('media-thumbnail').addEventListener('error', () => { $('media-thumbnail').hidden = true; $('no-thumbnail').hidden = false; });
  $('download-button').addEventListener('click', addDownload);
  $('active-jobs-tab').addEventListener('click', () => setJobView('active'));
  $('history-tab').addEventListener('click', () => setJobView('history'));
  function openSettings() { $('api-address').value = apiBase; $('settings-dialog').showModal(); }
  $('settings-button').addEventListener('click', openSettings);
  $('setup-settings').addEventListener('click', openSettings);
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); $('login-button').disabled = true; notice('');
    try {
      const result = await request('/api/login', { password: $('login-password').value });
      state.token = result.token;
      try { sessionStorage.setItem('toolhub-media-token:' + apiBase, state.token); } catch (_) { /* The current page can still use this token. */ }
      $('login-password').value = ''; await connect(true);
    } catch (error) { notice(error.message); }
    finally { $('login-button').disabled = false; }
  });
  $('logout-button').addEventListener('click', () => {
    try { sessionStorage.removeItem('toolhub-media-token:' + apiBase); } catch (_) { /* No stored session to clear. */ }
    state.token = ''; state.connected = false; state.jobs = []; state.media = null; state.jobsKey = '';
    $('media-content').hidden = true; $('empty-media').hidden = false; renderJobs(); $('settings-dialog').close(); connect();
  });
  $('connection-button').addEventListener('click', () => connect(true));
  $('reconnect-button').addEventListener('click', () => connect(true));
  $('save-settings').addEventListener('click', () => {
    try {
      const url = new URL($('api-address').value.trim());
      const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
      if ((!local && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
      apiBase = url.origin;
      state.connected = false; state.media = null; state.jobs = []; loadToken(); renderJobs();
      $('media-content').hidden = true; $('empty-media').hidden = false;
      try { localStorage.setItem('toolhub-media-api', apiBase); } catch (_) { /* Session-only settings still work. */ }
      state.jobsKey = ''; $('settings-dialog').close(); connect(true);
    } catch (_) { $('api-address').setCustomValidity('請使用雲端 HTTPS 網址，或 http://127.0.0.1:8910。'); $('api-address').reportValidity(); }
  });
  $('api-address').addEventListener('input', () => $('api-address').setCustomValidity(''));
  setInterval(async () => { if (!state.connected || document.hidden) return; try { await refreshJobs(); } catch (_) { state.connected = false; $('connection-button').classList.remove('online'); $('connection-label').textContent = '下載服務已中斷'; updateSummary(); connect(); } }, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) connect(); });
  renderJobs();
  connect();
})();
