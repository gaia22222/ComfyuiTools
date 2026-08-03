(() => {
  "use strict";

  const APP_VERSION = 3;
  const PROJECT_KIND = "glyph-atelier-project";
  const HISTORY_LIMIT = 80;
  const MIN_SIZE = 24;
  const LIBRARY_DB_NAME = "glyph-atelier-library";
  const LIBRARY_DB_VERSION = 1;
  const BUBBLE_PRESET_STORE = "bubble-presets";
  const FONT_CHOICES = [
    ["Yu Mincho", "游明朝"],
    ["Yu Gothic", "游ゴシック"],
    ["MS PMincho", "ＭＳ Ｐ明朝"],
    ["MS PGothic", "ＭＳ Ｐゴシック"],
    ["Noto Serif CJK JP", "Noto Serif CJK JP"],
    ["Noto Sans CJK JP", "Noto Sans CJK JP"],
    ["serif", "系統明體"],
    ["sans-serif", "系統黑體"]
  ];

  const PRESETS = [
    { id: "ellipse", name: "標準橢圓", category: "對話", shape: "ellipse", w: 330, h: 470, tail: true },
    { id: "circle", name: "圓形對話", category: "對話", shape: "ellipse", w: 340, h: 340, tail: true },
    { id: "tall", name: "細長橢圓", category: "對話", shape: "ellipse", w: 250, h: 540, tail: true },
    { id: "capsule", name: "圓角長框", category: "對話", shape: "capsule", w: 290, h: 500, tail: true },
    { id: "rounded", name: "柔角方框", category: "對話", shape: "rounded", w: 340, h: 390, tail: true },
    { id: "cutcorner", name: "切角對話", category: "對話", shape: "cutcorner", w: 320, h: 470, tail: true },
    { id: "thought", name: "思考雲", category: "思想", shape: "thought", w: 360, h: 390, tail: true },
    { id: "cloud", name: "雲形氣泡", category: "思想", shape: "cloud", w: 410, h: 360, tail: true },
    { id: "softcloud", name: "柔軟雲形", category: "思想", shape: "softcloud", w: 350, h: 450, tail: true },
    { id: "double", name: "連體雙氣泡", category: "複合", shape: "double", w: 390, h: 600, tail: false, text: "早速、引っかかって\nくれるね…\n\nお嬢さん、\nどうかしましたか？" },
    { id: "triple", name: "連體三氣泡", category: "複合", shape: "triple", w: 430, h: 680, tail: false },
    { id: "duo", name: "橫向雙氣泡", category: "複合", shape: "duo", w: 600, h: 320, tail: true },
    { id: "blackoval", name: "黑色獨白", category: "效果", shape: "ellipse", w: 330, h: 460, tail: false, fill: "#211d24", stroke: "#211d24", textColor: "#ffffff", effect: "none", text: "これは…頭が、\nおかしくなりそう、" },
    { id: "rayoval", name: "集中線橢圓", category: "效果", shape: "ellipse", w: 350, h: 480, tail: false, fill: "#211d24", stroke: "#211d24", textColor: "#ffffff", effect: "rays", text: "これは…頭が、\nおかしくなりそう、", emphasis: "頭" },
    { id: "blackburst", name: "黑底爆發", category: "喊叫", shape: "burst", w: 380, h: 420, tail: false, fill: "#080808", stroke: "#080808", textColor: "#ffffff" },
    { id: "whiteburst", name: "白底爆發", category: "喊叫", shape: "burst", w: 390, h: 430, tail: false },
    { id: "jagged", name: "閃電喊叫", category: "喊叫", shape: "jagged", w: 340, h: 520, tail: false },
    { id: "shoutbox", name: "鋸齒方框", category: "喊叫", shape: "shoutbox", w: 380, h: 430, tail: false },
    { id: "whisper", name: "低語虛線", category: "對話", shape: "ellipse", w: 300, h: 430, tail: true, dashed: true, opacity: 82 },
    { id: "narration", name: "旁白框", category: "旁白", shape: "narration", w: 360, h: 300, tail: false, fill: "#f4edcf" },
    { id: "blackcaption", name: "黑底旁白", category: "旁白", shape: "narration", w: 390, h: 270, tail: false, fill: "#141414", stroke: "#141414", textColor: "#ffffff" },
    { id: "radio", name: "廣播框", category: "旁白", shape: "radio", w: 360, h: 380, tail: true },
    { id: "silent", name: "無尾橢圓", category: "對話", shape: "ellipse", w: 300, h: 410, tail: false },
    { id: "focus", name: "全幅集中線", category: "效果", shape: "focus", w: 720, h: 720, tail: false, fill: "#ffffff", stroke: "#171717", noText: true }
  ];

  const state = {
    documentName: "未命名作品",
    width: 1344,
    height: 1728,
    background: null,
    backgroundData: null,
    backgroundName: null,
    backgroundColor: "#f4f2ec",
    objects: [],
    bubbleAssets: [],
    bubblePresets: [],
    fonts: [],
    selected: new Set(),
    tool: "select",
    temporaryHand: false,
    zoom: 0.45,
    panX: 0,
    panY: 0,
    history: [],
    historyIndex: -1,
    clipboard: [],
    dirty: false,
    guides: [],
    interaction: null,
    activeCategory: "全部",
    inspectorSyncing: false,
    historyTimer: null,
    renderQueued: false,
    pointerInsideCanvas: false,
    editingTextId: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const canvas = $("#editorCanvas");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const shell = $("#canvasShell");
  const viewport = $("#stageViewport");
  const canvasTextEditor = $("#canvasTextEditor");
  const bubbleAssetImages = new Map();

  function uid(prefix = "obj") {
    if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function selectedObjects() {
    return state.objects.filter(object => state.selected.has(object.id));
  }

  function selectedComponentObjects() {
    const ids = new Set(state.selected);
    for (const object of selectedObjects()) {
      if (object.kind === "bubble") linkedTextIdsForBubble(object).forEach(id => ids.add(id));
    }
    return state.objects.filter(object => ids.has(object.id));
  }

  function objectById(id) {
    return state.objects.find(object => object.id === id) || null;
  }

  function topSelectedObject() {
    for (let index = state.objects.length - 1; index >= 0; index -= 1) {
      if (state.selected.has(state.objects[index].id)) return state.objects[index];
    }
    return null;
  }

  function linkedTextIdsForBubble(bubble) {
    if (!bubble || bubble.kind !== "bubble") return [];
    return [...new Set([...(bubble.linkedTextIds || []), bubble.linkedTextId].filter(id => id && objectById(id)?.kind === "text"))];
  }

  function defaultText(overrides = {}) {
    return {
      id: uid("text"),
      kind: "text",
      name: "直排文字",
      x: state.width * 0.5 - 105,
      y: state.height * 0.5 - 210,
      w: 210,
      h: 420,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 100,
      groupId: null,
      linkedBubbleId: null,
      text: "ここに台詞を入力",
      direction: "vertical",
      fontFamily: "Yu Mincho",
      fontSize: 56,
      fontWeight: 500,
      color: "#171717",
      stroke: "#ffffff",
      strokeWidth: 0,
      shadowBlur: 0,
      shadowColor: "#000000",
      letterSpacing: 4,
      lineGap: 12,
      align: "start",
      autoFit: false,
      autoFitMinSize: 12,
      autoFitMaxSize: 72,
      styleRuns: [],
      ...overrides
    };
  }

  function defaultBubble(preset, overrides = {}) {
    const x = state.width * 0.5 - preset.w * 0.5;
    const y = state.height * 0.5 - preset.h * 0.5;
    return {
      id: uid("bubble"),
      kind: "bubble",
      name: preset.name,
      presetId: preset.id,
      shape: preset.shape,
      x,
      y,
      w: preset.w,
      h: preset.h,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: preset.opacity ?? 96,
      groupId: null,
      fill: preset.fill || "#ffffff",
      stroke: preset.stroke || "#171717",
      strokeWidth: preset.strokeWidth ?? 5,
      dashed: Boolean(preset.dashed),
      effect: preset.effect || "none",
      tailEnabled: Boolean(preset.tail),
      tailX: x + preset.w * 0.62,
      tailY: y + preset.h + Math.min(130, preset.h * 0.28),
      tailWidth: Math.max(34, preset.w * 0.15),
      linkedTextId: null,
      linkedTextIds: [],
      ...overrides
    };
  }

  function init() {
    renderPresetCategories();
    renderPresets();
    renderBubblePresetLibrary();
    populateFontSelect();
    bindUI();
    resizeCanvasBackingStore();
    setDocumentStatus(false, "idle");
    setTool("select");
    updateUndoRedo();
    syncSelectionUI();
    requestRender();
    loadBubblePresetLibrary().catch(error => {
      console.error(error);
      showToast("素材預設未能載入", "本機素材庫暫時不可用；仍可跟專案保存素材。", "error", 6000);
    });
    window.addEventListener("beforeunload", event => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function bindUI() {
    $("#openImageButton").addEventListener("click", () => $("#imageFileInput").click());
    $("#emptyOpenButton").addEventListener("click", () => $("#imageFileInput").click());
    $("#assetImageButton").addEventListener("click", () => $("#imageFileInput").click());
    $("#assetBubbleButton").addEventListener("click", () => $("#bubbleAssetFileInput").click());
    $("#openProjectButton").addEventListener("click", () => $("#projectFileInput").click());
    $("#fontUploadButton").addEventListener("click", () => $("#fontFileInput").click());
    $("#imageFileInput").addEventListener("change", event => handleImageFile(event.target.files[0]));
    $("#bubbleAssetFileInput").addEventListener("change", event => handleBubbleAssetFiles([...event.target.files]));
    $("#projectFileInput").addEventListener("change", event => handleProjectFile(event.target.files[0]));
    $("#fontFileInput").addEventListener("change", event => handleFontFiles([...event.target.files]));
    $("#createTestCanvasButton").addEventListener("click", createReferenceFixture);

    $("#addTextButton").addEventListener("click", () => addText("vertical"));
    $("#addHorizontalTextButton").addEventListener("click", () => addText("horizontal"));
    $("#newTextLayerButton").addEventListener("click", () => addText("vertical"));
    $("#duplicateButton").addEventListener("click", duplicateSelection);
    $("#deleteButton").addEventListener("click", deleteSelection);
    $("#groupButton").addEventListener("click", groupSelection);
    $("#ungroupButton").addEventListener("click", ungroupSelection);
    $("#undoButton").addEventListener("click", undo);
    $("#redoButton").addEventListener("click", redo);
    $("#moveLayerUpButton").addEventListener("click", () => reorderSelection(1));
    $("#moveLayerDownButton").addEventListener("click", () => reorderSelection(-1));

    $$('[data-tool]').forEach(button => button.addEventListener("click", () => setTool(button.dataset.tool)));
    $$('[data-left-tab]').forEach(button => button.addEventListener("click", () => switchPanelTab("left", button.dataset.leftTab)));
    $$('[data-right-tab]').forEach(button => button.addEventListener("click", () => switchPanelTab("right", button.dataset.rightTab)));

    $("#presetSearch").addEventListener("input", renderPresets);
    $("#exportMenuButton").addEventListener("click", toggleExportMenu);
    $("#exportMenu").addEventListener("click", event => {
      const button = event.target.closest("[data-export]");
      if (button) exportByMode(button.dataset.export);
    });
    document.addEventListener("pointerdown", event => {
      if (!event.target.closest(".document-actions")) closeExportMenu();
    });

    $("#zoomSlider").addEventListener("input", event => setZoom(Number(event.target.value) / 100));
    $("#zoomInButton").addEventListener("click", () => setZoom(state.zoom + 0.05));
    $("#zoomOutButton").addEventListener("click", () => setZoom(state.zoom - 0.05));
    $("#fitButton").addEventListener("click", fitCanvas);

    viewport.addEventListener("wheel", onViewportWheel, { passive: false });
    viewport.addEventListener("dragenter", onDragEnter);
    viewport.addEventListener("dragover", onDragOver);
    viewport.addEventListener("dragleave", onDragLeave);
    viewport.addEventListener("drop", onDrop);
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("pointermove", onCanvasPointerMove);
    canvas.addEventListener("pointerup", onCanvasPointerUp);
    canvas.addEventListener("pointercancel", onCanvasPointerUp);
    canvas.addEventListener("dblclick", onCanvasDoubleClick);
    canvasTextEditor.addEventListener("input", onCanvasTextEditorInput);
    canvasTextEditor.addEventListener("keydown", onCanvasTextEditorKeyDown);
    canvasTextEditor.addEventListener("blur", finishCanvasTextEdit);
    viewport.addEventListener("pointerdown", onViewportPointerDown);
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", () => {
      if (state.background || state.objects.length) fitCanvas(false);
    });

    bindInspector();
  }

  function switchPanelTab(side, name) {
    $$(`[data-${side}-tab]`).forEach(button => {
      const active = button.dataset[`${side}Tab`] === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$(`[data-${side}-panel]`).forEach(panel => {
      panel.hidden = panel.dataset[`${side}Panel`] !== name;
    });
  }

  function renderPresetCategories() {
    const categories = ["全部", ...new Set(PRESETS.map(preset => preset.category))];
    const host = $("#categoryChips");
    host.replaceChildren(...categories.map(category => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = category;
      button.classList.toggle("active", category === state.activeCategory);
      button.addEventListener("click", () => {
        state.activeCategory = category;
        renderPresetCategories();
        renderPresets();
      });
      return button;
    }));
  }

  function renderPresets() {
    const search = $("#presetSearch").value.trim().toLowerCase();
    const filtered = PRESETS.filter(preset => {
      const categoryMatches = state.activeCategory === "全部" || preset.category === state.activeCategory;
      const searchMatches = !search || `${preset.name}${preset.category}`.toLowerCase().includes(search);
      return categoryMatches && searchMatches;
    });
    const cards = filtered.map(preset => {
      const button = document.createElement("button");
      button.className = "preset-card";
      button.type = "button";
      button.title = `新增「${preset.name}」`;
      const preview = document.createElement("canvas");
      preview.width = 150;
      preview.height = 90;
      const label = document.createElement("span");
      label.textContent = preset.name;
      button.append(preview, label);
      if (["double", "triple", "duo"].includes(preset.id)) {
        const mark = document.createElement("mark");
        mark.textContent = "組件";
        button.append(mark);
      }
      button.addEventListener("click", () => addPreset(preset.id));
      requestAnimationFrame(() => drawPresetPreview(preview, preset));
      return button;
    });
    const host = $("#presetGrid");
    host.replaceChildren(...cards);
    if (!cards.length) {
      const empty = document.createElement("div");
      empty.className = "empty-list";
      empty.style.gridColumn = "1 / -1";
      empty.textContent = "沒有符合的氣泡預設";
      host.append(empty);
    }
  }

  function drawPresetPreview(preview, preset) {
    const pctx = preview.getContext("2d");
    pctx.clearRect(0, 0, preview.width, preview.height);
    const mock = defaultBubble(preset, {
      id: "preview",
      x: 25,
      y: 14,
      w: preset.shape === "duo" ? 105 : preset.shape === "focus" ? 94 : 82,
      h: preset.shape === "duo" ? 56 : preset.shape === "focus" ? 65 : 62,
      tailX: 92,
      tailY: 82,
      tailWidth: 14,
      strokeWidth: 2,
      opacity: 100
    });
    if (preset.shape === "double" || preset.shape === "triple") {
      mock.w = 63;
      mock.h = 70;
      mock.x = 44;
      mock.y = 9;
    }
    pctx.save();
    drawBubble(pctx, mock, { preview: true });
    pctx.restore();
  }

  function addText(direction = "vertical", overrides = {}) {
    ensureCanvasVisible();
    const object = defaultText({
      direction,
      name: direction === "vertical" ? "直排文字" : "橫排文字",
      w: direction === "vertical" ? 210 : 460,
      h: direction === "vertical" ? 420 : 140,
      ...overrides
    });
    state.objects.push(object);
    selectOnly(object.id);
    commitMutation("新增文字");
    switchPanelTab("right", "properties");
  }

  function addPreset(id, placement = {}) {
    ensureCanvasVisible();
    const preset = PRESETS.find(item => item.id === id);
    if (!preset) return;
    const bubble = defaultBubble(preset, placement);
    const created = [bubble];
    state.objects.push(bubble);
    if (!preset.noText) {
      const compound = ["double", "triple", "duo"].includes(preset.shape);
      if (compound) {
        const geometry = compoundParts(bubble);
        const groups = (preset.text || "").split(/\n\s*\n/).filter(Boolean);
        geometry.centers.forEach((center, index) => {
          const textWidth = geometry.partW * 0.58;
          const textHeight = geometry.partH * 0.68;
          const text = defaultText({
            name: `${preset.name}・文字 ${index + 1}`,
            x: bubble.x + bubble.w / 2 + center.x - textWidth / 2,
            y: bubble.y + bubble.h / 2 + center.y - textHeight / 2,
            w: textWidth,
            h: textHeight,
            text: groups[index] || `台詞 ${index + 1}`,
            color: preset.textColor || "#171717",
            fontSize: Math.round(clamp(Math.min(geometry.partW, geometry.partH) * 0.12, 28, 48)),
            autoFit: true,
            autoFitMaxSize: Math.round(clamp(Math.min(geometry.partW, geometry.partH) * 0.12, 28, 48)),
            fontWeight: preset.textColor === "#ffffff" ? 500 : 600,
            linkedBubbleId: bubble.id
          });
          state.objects.push(text);
          created.push(text);
          bubble.linkedTextIds.push(text.id);
        });
        bubble.linkedTextId = bubble.linkedTextIds[0] || null;
      } else {
        const textWidth = bubble.w * 0.56;
        const textHeight = bubble.h * 0.7;
        const text = defaultText({
          name: `${preset.name}・文字`,
          x: bubble.x + (bubble.w - textWidth) / 2,
          y: bubble.y + (bubble.h - textHeight) / 2,
          w: textWidth,
          h: textHeight,
          text: preset.text || "ここに台詞を入力",
          color: preset.textColor || "#171717",
          fontSize: Math.round(clamp(Math.min(bubble.w, bubble.h) * 0.145, 34, 64)),
          autoFit: true,
          autoFitMaxSize: Math.round(clamp(Math.min(bubble.w, bubble.h) * 0.145, 34, 64)),
          fontWeight: preset.textColor === "#ffffff" ? 500 : 600,
          linkedBubbleId: bubble.id
        });
        if (preset.emphasis && text.text.includes(preset.emphasis)) {
          const start = text.text.indexOf(preset.emphasis);
          text.styleRuns.push({ start, end: start + preset.emphasis.length, size: Math.round(text.fontSize * 1.5), weight: 900 });
        }
        bubble.linkedTextId = text.id;
        bubble.linkedTextIds = [text.id];
        state.objects.push(text);
        created.push(text);
      }
    }
    created.filter(object => object.kind === "text").forEach(applyAutoFit);
    state.selected = new Set(created.map(object => object.id));
    commitMutation(`新增${preset.name}`);
    switchPanelTab("right", "properties");
    syncSelectionUI();
  }

  function ensureCanvasVisible() {
    if (!state.background && !state.objects.length) {
      state.backgroundColor = "#f4f2ec";
      state.width = 1344;
      state.height = 1728;
      resizeCanvasBackingStore();
      $("#stageEmpty").hidden = true;
      shell.hidden = false;
      fitCanvas(false);
      resetHistory();
    }
  }

  function createReferenceFixture() {
    if (!canReplaceDocument()) return;
    state.documentName = "出版級直排測試";
    state.width = 1344;
    state.height = 1728;
    state.background = null;
    state.backgroundData = null;
    state.backgroundName = null;
    state.backgroundColor = "#e8e5dd";
    state.objects = [];
    state.bubbleAssets = [];
    bubbleAssetImages.clear();
    state.selected.clear();
    resizeCanvasBackingStore();
    ensureCanvasVisible();

    addPreset("rayoval", { x: 80, y: 170, w: 360, h: 500, tailEnabled: false });
    addPreset("blackoval", { x: 1000, y: 50, w: 250, h: 350, tailEnabled: false });
    const topText = topSelectedObject();
    if (topText?.kind === "text") topText.text = "あぁ…あ、";
    addPreset("double", { x: 820, y: 980, w: 390, h: 620, tailEnabled: false });
    state.selected.clear();
    resetHistory();
    setDocumentStatus(true);
    fitCanvas(false);
    syncSelectionUI();
    showToast("測試畫布已建立", "包含混合字級、黑底白字、集中線及連體雙氣泡。", "success");
  }

  function canReplaceDocument() {
    if (!state.dirty || (!state.objects.length && !state.background)) return true;
    return window.confirm("目前作品有未輸出的變更。仍要開啟另一個檔案嗎？");
  }

  async function handleImageFile(file) {
    if (!file) return;
    $("#imageFileInput").value = "";
    if (!file.type.startsWith("image/")) {
      showToast("無法開啟", "請選擇 PNG、JPG 或 WebP 圖片。", "error");
      return;
    }
    if (!canReplaceDocument()) return;
    showProgress("正在開啟來源圖片", "讀取像素與畫布尺寸…");
    try {
      const dataURL = await readFileAsDataURL(file);
      const image = await loadImage(dataURL);
      state.documentName = file.name.replace(/\.[^.]+$/, "") || "未命名作品";
      state.width = image.naturalWidth || image.width;
      state.height = image.naturalHeight || image.height;
      state.background = image;
      state.backgroundData = dataURL;
      state.backgroundName = file.name;
      state.backgroundColor = "#ffffff";
      state.objects = [];
      state.bubbleAssets = [];
      bubbleAssetImages.clear();
      state.selected.clear();
      resizeCanvasBackingStore();
      shell.hidden = false;
      $("#stageEmpty").hidden = true;
      resetHistory();
      setDocumentStatus(true);
      syncSelectionUI();
      fitCanvas(false);
      requestRender();
      showToast("來源圖片已開啟", `${state.width} × ${state.height}；原始像素已鎖定。`, "success");
    } catch (error) {
      console.error(error);
      showToast("圖片讀取失敗", "檔案可能已損毀或格式不受瀏覽器支援。", "error");
    } finally {
      hideProgress();
    }
  }

  async function handleBubbleAssetFiles(files) {
    const imageFiles = files.filter(file => file?.type.startsWith("image/"));
    $("#bubbleAssetFileInput").value = "";
    if (!imageFiles.length) {
      showToast("無法加入氣泡素材", "請選擇 PNG、JPG 或 WebP 圖片。", "error");
      return;
    }
    ensureCanvasVisible();
    showProgress("正在儲存氣泡素材", "加入「我的氣泡」並建立自動文字框…");
    const created = [];
    let failed = 0;
    for (const [index, file] of imageFiles.entries()) {
      try {
        const dataURL = await readFileAsDataURL(file);
        const image = await loadImage(dataURL);
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const asset = {
          id: uid("asset"),
          name: file.name.replace(/\.[^.]+$/, "").trim() || `氣泡素材 ${state.bubblePresets.length + 1}`,
          dataURL,
          width: sourceWidth,
          height: sourceHeight,
          createdAt: Date.now() + index
        };
        await saveBubblePresetRecord(asset);
        state.bubblePresets.unshift(asset);
        bubbleAssetImages.set(asset.id, image);
        created.push(...await createBubbleAssetObjects(asset, index));
      } catch (error) {
        console.error(error);
        failed += 1;
      }
    }
    try {
      renderBubblePresetLibrary();
      if (!created.length) {
        showToast("氣泡素材未能儲存", "請確認瀏覽器允許本機儲存，並檢查圖片格式。", "error");
        return;
      }
      state.selected = new Set(created.map(object => object.id));
      commitMutation(`儲存並加入 ${created.length / 2} 個氣泡素材`);
      switchPanelTab("right", "properties");
      showToast("已儲存到我的氣泡", failed ? `${created.length / 2} 個成功，${failed} 個失敗。` : "之後開任何新專案都可以直接點選覆用。", failed ? "error" : "success");
    } finally {
      hideProgress();
    }
  }

  async function createBubbleAssetObjects(asset, offsetIndex = 0) {
    ensureCanvasVisible();
    let image = bubbleAssetImages.get(asset.id);
    if (!image) {
      image = await loadImage(asset.dataURL);
      bubbleAssetImages.set(asset.id, image);
    }
    const sourceWidth = Number(asset.width) || image.naturalWidth || image.width;
    const sourceHeight = Number(asset.height) || image.naturalHeight || image.height;
    const projectAsset = { ...asset, width: sourceWidth, height: sourceHeight };
    const assetIndex = state.bubbleAssets.findIndex(item => item.id === asset.id);
    if (assetIndex === -1) state.bubbleAssets.push(projectAsset);
    else state.bubbleAssets[assetIndex] = projectAsset;

    const maxDisplay = Math.min(state.width * 0.46, state.height * 0.46, 620);
    const scale = Math.min(1, maxDisplay / Math.max(sourceWidth, sourceHeight));
    const w = Math.max(MIN_SIZE, Math.round(sourceWidth * scale));
    const h = Math.max(MIN_SIZE, Math.round(sourceHeight * scale));
    const offset = offsetIndex * 26;
    const preset = { id: "asset", name: asset.name, shape: "asset", w, h, tail: false, opacity: 100, strokeWidth: 0 };
    const bubble = defaultBubble(preset, {
      x: state.width / 2 - w / 2 + offset,
      y: state.height / 2 - h / 2 + offset,
      assetId: asset.id,
      fill: "#ffffff",
      stroke: "#171717",
      strokeWidth: 0,
      tailEnabled: false,
      opacity: 100
    });
    const textWidth = w * 0.62;
    const textHeight = h * 0.66;
    const initialSize = Math.round(clamp(Math.min(w, h) * 0.14, 24, 64));
    const text = defaultText({
      name: `${asset.name}・文字`,
      x: bubble.x + (w - textWidth) / 2,
      y: bubble.y + (h - textHeight) / 2,
      w: textWidth,
      h: textHeight,
      text: "在這裡輸入文字",
      fontSize: initialSize,
      autoFit: true,
      autoFitMinSize: 12,
      autoFitMaxSize: initialSize,
      align: "center",
      linkedBubbleId: bubble.id
    });
    bubble.linkedTextId = text.id;
    bubble.linkedTextIds = [text.id];
    state.objects.push(bubble, text);
    applyAutoFit(text);
    return [bubble, text];
  }

  function openLibraryDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const request = indexedDB.open(LIBRARY_DB_NAME, LIBRARY_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(BUBBLE_PRESET_STORE)) {
          database.createObjectStore(BUBBLE_PRESET_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to open local asset library"));
      request.onblocked = () => reject(new Error("Local asset library upgrade is blocked"));
    });
  }

  async function runLibraryRequest(mode, operation) {
    const database = await openLibraryDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(BUBBLE_PRESET_STORE, mode);
      const request = operation(transaction.objectStore(BUBBLE_PRESET_STORE));
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onerror = () => { database.close(); reject(transaction.error || request.error); };
      transaction.onabort = () => { database.close(); reject(transaction.error || new Error("Local asset library transaction was aborted")); };
    });
  }

  function saveBubblePresetRecord(asset) {
    return runLibraryRequest("readwrite", store => store.put(asset));
  }

  function deleteBubblePresetRecord(id) {
    return runLibraryRequest("readwrite", store => store.delete(id));
  }

  async function loadBubblePresetLibrary() {
    const records = await runLibraryRequest("readonly", store => store.getAll());
    state.bubblePresets = (records || []).filter(asset => asset?.id && asset?.dataURL)
      .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    renderBubblePresetLibrary();
  }

  function renderBubblePresetLibrary() {
    const presets = state.bubblePresets || [];
    $("#bubblePresetCount").textContent = String(presets.length);
    $("#bubblePresetEmpty").hidden = presets.length > 0;
    const rows = presets.map(asset => {
      const row = document.createElement("div");
      row.className = "bubble-preset-item";
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.title = `加入 ${asset.name}`;
      const image = document.createElement("img");
      image.src = asset.dataURL;
      image.alt = asset.name;
      const name = document.createElement("b");
      name.textContent = asset.name;
      addButton.append(image, name);
      addButton.addEventListener("click", () => addSavedBubblePreset(asset.id));
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "bubble-preset-delete";
      deleteButton.title = "刪除氣泡預設";
      deleteButton.setAttribute("aria-label", `刪除 ${asset.name}`);
      deleteButton.textContent = "×";
      deleteButton.addEventListener("click", () => removeSavedBubblePreset(asset));
      row.append(addButton, deleteButton);
      return row;
    });
    $("#bubblePresetGrid").replaceChildren(...rows);
  }

  async function addSavedBubblePreset(id) {
    const asset = state.bubblePresets.find(item => item.id === id);
    if (!asset) return;
    showProgress("正在加入氣泡預設", "建立氣泡與自動文字框…");
    try {
      const created = await createBubbleAssetObjects(asset);
      state.selected = new Set(created.map(object => object.id));
      commitMutation(`加入${asset.name}`);
      switchPanelTab("right", "properties");
      showToast("氣泡預設已加入", "雙擊文字框即可直接輸入內容。", "success");
    } catch (error) {
      console.error(error);
      showToast("氣泡預設無法加入", "素材資料可能已損毀。", "error");
    } finally {
      hideProgress();
    }
  }

  async function removeSavedBubblePreset(asset) {
    if (!window.confirm(`從「我的氣泡」刪除「${asset.name}」？\n目前專案中已使用的氣泡不會被刪除。`)) return;
    try {
      await deleteBubblePresetRecord(asset.id);
      state.bubblePresets = state.bubblePresets.filter(item => item.id !== asset.id);
      if (!state.bubbleAssets.some(item => item.id === asset.id)) bubbleAssetImages.delete(asset.id);
      renderBubblePresetLibrary();
      showToast("氣泡預設已刪除", "目前專案內已使用的氣泡仍會保留。", "success");
    } catch (error) {
      console.error(error);
      showToast("未能刪除氣泡預設", "本機素材庫暫時不可用。", "error");
    }
  }

  async function handleProjectFile(file) {
    if (!file) return;
    $("#projectFileInput").value = "";
    if (!canReplaceDocument()) return;
    showProgress("正在開啟專案", "還原字體、圖層與幾何資料…");
    try {
      const raw = await file.text();
      const project = JSON.parse(raw);
      validateProject(project);
      await restoreProject(project);
      state.documentName = project.document?.name || file.name.replace(/\.glyph\.json$|\.json$/i, "");
      setDocumentStatus(false, "saved");
      resetHistory();
      fitCanvas(false);
      syncSelectionUI();
      requestRender();
      const missing = await findMissingFonts();
      if (missing.length) {
        showToast("專案已開啟，但有缺失字體", missing.join("、"), "error", 7000);
      } else {
        showToast("專案已無損重開", `${state.objects.length} 個可編輯物件已還原。`, "success");
      }
    } catch (error) {
      console.error(error);
      showToast("專案無法開啟", error.message || "檔案格式不正確。", "error", 6500);
    } finally {
      hideProgress();
    }
  }

  function validateProject(project) {
    if (!project || project.kind !== PROJECT_KIND) throw new Error("這不是 Glyph Atelier 可編輯專案。");
    if (!Number.isInteger(project.version)) throw new Error("專案缺少格式版本標記。");
    if (project.version > APP_VERSION) throw new Error(`此專案需要較新版本（v${project.version}）。`);
    if (!project.canvas || !Array.isArray(project.objects)) throw new Error("專案內容不完整。");
  }

  async function restoreProject(project) {
    state.width = clamp(Number(project.canvas.width) || 1344, 64, 16384);
    state.height = clamp(Number(project.canvas.height) || 1728, 64, 16384);
    state.backgroundColor = project.canvas.backgroundColor || "#ffffff";
    state.backgroundData = project.source?.dataURL || null;
    state.backgroundName = project.source?.name || null;
    state.background = state.backgroundData ? await loadImage(state.backgroundData) : null;
    state.objects = project.objects.map(sanitizeObject).filter(Boolean);
    state.bubbleAssets = Array.isArray(project.assets) ? project.assets.filter(asset => asset?.id && asset?.dataURL) : [];
    bubbleAssetImages.clear();
    await Promise.all(state.bubbleAssets.map(async asset => {
      try {
        bubbleAssetImages.set(asset.id, await loadImage(asset.dataURL));
      } catch (error) {
        console.error(`Unable to restore bubble asset ${asset.name || asset.id}`, error);
      }
    }));
    state.fonts = Array.isArray(project.fonts) ? project.fonts.filter(font => font?.name && font?.dataURL) : [];
    for (const font of state.fonts) await installFont(font.name, font.dataURL, false);
    state.objects.filter(object => object.kind === "text" && object.autoFit).forEach(applyAutoFit);
    state.selected.clear();
    resizeCanvasBackingStore();
    shell.hidden = false;
    $("#stageEmpty").hidden = true;
    populateFontSelect();
    renderFontLibrary();
  }

  function sanitizeObject(object) {
    if (!object || !["text", "bubble"].includes(object.kind)) return null;
    if (object.kind === "text") return defaultText({ ...object, id: object.id || uid("text") });
    const fallbackPreset = PRESETS.find(item => item.id === object.presetId) || PRESETS[0];
    return defaultBubble(fallbackPreset, { ...object, id: object.id || uid("bubble") });
  }

  async function handleFontFiles(files) {
    if (!files.length) return;
    $("#fontFileInput").value = "";
    let installed = 0;
    for (const file of files) {
      try {
        const dataURL = await readFileAsDataURL(file);
        const name = file.name.replace(/\.[^.]+$/, "").trim() || `自訂字體 ${state.fonts.length + 1}`;
        await installFont(name, dataURL, true);
        installed += 1;
      } catch (error) {
        console.error(error);
        showToast(`無法載入 ${file.name}`, "字體格式不受支援或檔案已損毀。", "error");
      }
    }
    if (installed) {
      populateFontSelect();
      renderFontLibrary();
      setDocumentStatus(true);
      showToast("自訂字體已加入", `${installed} 個字體會嵌入可編輯專案。`, "success");
      requestRender();
    }
  }

  async function installFont(name, dataURL, addToState) {
    if (state.fonts.some(font => font.name === name) && addToState) {
      name = `${name} ${state.fonts.length + 1}`;
    }
    const face = new FontFace(name, `url(${dataURL})`);
    await face.load();
    document.fonts.add(face);
    if (addToState) state.fonts.push({ name, dataURL });
    return name;
  }

  function removeFont(name) {
    const inUse = state.objects.some(object => object.kind === "text" && object.fontFamily === name);
    if (inUse && !window.confirm(`字體「${name}」正在作品中使用。移除後輸出會被阻止，仍要移除嗎？`)) return;
    state.fonts = state.fonts.filter(font => font.name !== name);
    populateFontSelect();
    renderFontLibrary();
    setDocumentStatus(true);
    requestRender();
  }

  function populateFontSelect() {
    const select = $("#fontFamilyInput");
    const current = select.value;
    const groups = [];
    const systemGroup = document.createElement("optgroup");
    systemGroup.label = "系統字體";
    FONT_CHOICES.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      systemGroup.append(option);
    });
    groups.push(systemGroup);
    if (state.fonts.length) {
      const customGroup = document.createElement("optgroup");
      customGroup.label = "專案嵌入字體";
      state.fonts.forEach(font => {
        const option = document.createElement("option");
        option.value = font.name;
        option.textContent = font.name;
        customGroup.append(option);
      });
      groups.push(customGroup);
    }
    select.replaceChildren(...groups);
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }

  function renderFontLibrary() {
    $("#fontCount").textContent = String(state.fonts.length);
    $("#fontLibraryEmpty").hidden = state.fonts.length > 0;
    const host = $("#fontLibrary");
    host.replaceChildren(...state.fonts.map(font => {
      const row = document.createElement("div");
      row.className = "font-item";
      const name = document.createElement("b");
      name.textContent = font.name;
      name.style.fontFamily = JSON.stringify(font.name);
      const status = document.createElement("small");
      status.textContent = "已嵌入專案";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = `移除 ${font.name}`;
      remove.addEventListener("click", () => removeFont(font.name));
      row.append(name, status, remove);
      return row;
    }));
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("檔案讀取失敗"));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("圖片解碼失敗"));
      image.src = source;
    });
  }

  function resizeCanvasBackingStore() {
    canvas.width = state.width;
    canvas.height = state.height;
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    shell.style.width = `${state.width}px`;
    shell.style.height = `${state.height}px`;
    $("#canvasDimensions").textContent = `${state.width} × ${state.height}`;
    requestRender();
  }

  function requestRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      drawScene(ctx, { selection: true });
    });
  }

  function drawScene(target, options = {}) {
    const { selection = false, exportMode = false } = options;
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalAlpha = 1;
    target.globalCompositeOperation = "source-over";
    target.fillStyle = state.backgroundColor;
    target.fillRect(0, 0, state.width, state.height);
    if (state.background) {
      target.imageSmoothingEnabled = true;
      target.imageSmoothingQuality = "high";
      target.drawImage(state.background, 0, 0, state.width, state.height);
    }
    for (const object of state.objects) {
      if (!object.visible) continue;
      target.save();
      target.globalAlpha = clamp((object.opacity ?? 100) / 100, 0, 1);
      if (object.kind === "bubble") drawBubble(target, object, { exportMode });
      if (object.kind === "text" && (exportMode || object.id !== state.editingTextId)) drawText(target, object);
      target.restore();
    }
    if (selection && !exportMode) drawSelection(target);
    target.restore();
  }

  function applyObjectTransform(target, object) {
    const centerX = object.x + object.w / 2;
    const centerY = object.y + object.h / 2;
    target.translate(centerX, centerY);
    target.rotate((object.rotation || 0) * Math.PI / 180);
  }

  function drawBubble(target, object, options = {}) {
    applyObjectTransform(target, object);
    const w = object.w;
    const h = object.h;
    const lineWidth = Math.max(0, object.strokeWidth || 0);
    target.lineWidth = lineWidth;
    target.lineJoin = "round";
    target.lineCap = "round";
    target.strokeStyle = object.stroke || "#171717";
    target.fillStyle = object.fill || "#ffffff";
    target.setLineDash(object.dashed ? [Math.max(8, lineWidth * 2), Math.max(7, lineWidth * 1.6)] : []);

    if (object.shape === "asset") {
      const image = bubbleAssetImages.get(object.assetId);
      if (image) {
        target.imageSmoothingEnabled = true;
        target.imageSmoothingQuality = "high";
        target.drawImage(image, -w / 2, -h / 2, w, h);
      }
      return;
    }

    if (object.effect === "rays") drawRadialEffect(target, object, 88, 0.08);
    if (object.shape === "focus") {
      drawRadialEffect(target, object, 110, 0.48);
      return;
    }

    if (object.tailEnabled && object.shape !== "thought") drawTail(target, object);
    if (object.shape === "thought") drawThoughtTail(target, object);

    const path = bubblePath(object.shape, w, h);
    if (object.shape === "double" || object.shape === "triple" || object.shape === "duo") {
      drawCompoundBubble(target, object);
      return;
    }
    if (path) {
      target.fill(path);
      if (lineWidth > 0) target.stroke(path);
    }
  }

  function bubblePath(shape, w, h) {
    const path = new Path2D();
    const x = -w / 2;
    const y = -h / 2;
    if (shape === "ellipse" || shape === "thought") {
      path.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      return path;
    }
    if (shape === "rounded" || shape === "capsule" || shape === "narration" || shape === "radio") {
      const radius = shape === "capsule" ? Math.min(w, h) * 0.38 : shape === "narration" ? 5 : shape === "radio" ? 22 : Math.min(w, h) * 0.13;
      roundedRectPath(path, x, y, w, h, radius);
      if (shape === "radio") {
        const inset = Math.min(w, h) * 0.06;
        roundedRectPath(path, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(5, radius - inset));
      }
      return path;
    }
    if (shape === "cutcorner") {
      const cut = Math.min(w, h) * 0.15;
      path.moveTo(x + cut, y);
      path.lineTo(x + w - cut, y);
      path.lineTo(x + w, y + cut);
      path.lineTo(x + w, y + h - cut);
      path.lineTo(x + w - cut, y + h);
      path.lineTo(x + cut, y + h);
      path.lineTo(x, y + h - cut);
      path.lineTo(x, y + cut);
      path.closePath();
      return path;
    }
    if (shape === "cloud" || shape === "softcloud") {
      return cloudPath(w, h, shape === "softcloud" ? 14 : 18, shape === "softcloud" ? 0.10 : 0.14);
    }
    if (shape === "burst" || shape === "jagged" || shape === "shoutbox") {
      const points = shape === "burst" ? 42 : shape === "jagged" ? 26 : 20;
      const depth = shape === "burst" ? 0.22 : shape === "jagged" ? 0.13 : 0.09;
      return starPath(w, h, points, depth, shape === "shoutbox");
    }
    return bubblePath("ellipse", w, h);
  }

  function roundedRectPath(path, x, y, w, h, radius) {
    const r = clamp(radius, 0, Math.min(w, h) / 2);
    path.moveTo(x + r, y);
    path.lineTo(x + w - r, y);
    path.quadraticCurveTo(x + w, y, x + w, y + r);
    path.lineTo(x + w, y + h - r);
    path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    path.lineTo(x + r, y + h);
    path.quadraticCurveTo(x, y + h, x, y + h - r);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
    path.closePath();
  }

  function cloudPath(w, h, lobes, depth) {
    const path = new Path2D();
    for (let index = 0; index <= lobes; index += 1) {
      const angle = index / lobes * Math.PI * 2 - Math.PI / 2;
      const wave = 1 + Math.sin(index * 2.37) * depth;
      const x = Math.cos(angle) * w / 2 * wave;
      const y = Math.sin(angle) * h / 2 * wave;
      if (index === 0) path.moveTo(x, y);
      else {
        const previousAngle = (index - 0.5) / lobes * Math.PI * 2 - Math.PI / 2;
        const controlX = Math.cos(previousAngle) * w / 2 * (1 + depth * 1.8);
        const controlY = Math.sin(previousAngle) * h / 2 * (1 + depth * 1.8);
        path.quadraticCurveTo(controlX, controlY, x, y);
      }
    }
    path.closePath();
    return path;
  }

  function starPath(w, h, points, depth, boxy = false) {
    const path = new Path2D();
    const count = points * 2;
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2 - Math.PI / 2;
      const outer = index % 2 === 0;
      const radius = outer ? 1 : 1 - depth * (0.75 + ((index * 17) % 7) / 20);
      let x = Math.cos(angle) * w / 2 * radius;
      let y = Math.sin(angle) * h / 2 * radius;
      if (boxy) {
        const max = Math.max(Math.abs(x) / (w / 2), Math.abs(y) / (h / 2));
        x /= max || 1;
        y /= max || 1;
      }
      if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    path.closePath();
    return path;
  }

  function drawTail(target, object) {
    const local = worldToLocal(object, { x: object.tailX, y: object.tailY });
    const angle = Math.atan2(local.y, local.x);
    const radiusX = object.w / 2;
    const radiusY = object.h / 2;
    const edgeScale = 1 / Math.sqrt((Math.cos(angle) ** 2) / (radiusX ** 2) + (Math.sin(angle) ** 2) / (radiusY ** 2));
    const baseX = Math.cos(angle) * edgeScale;
    const baseY = Math.sin(angle) * edgeScale;
    const tangentX = -Math.sin(angle) * object.tailWidth / 2;
    const tangentY = Math.cos(angle) * object.tailWidth / 2;
    target.beginPath();
    target.moveTo(baseX + tangentX, baseY + tangentY);
    target.quadraticCurveTo(local.x * 0.74, local.y * 0.74, local.x, local.y);
    target.quadraticCurveTo(baseX - tangentX * 0.2, baseY - tangentY * 0.2, baseX - tangentX, baseY - tangentY);
    target.closePath();
    target.fill();
    if ((object.strokeWidth || 0) > 0) target.stroke();
  }

  function drawThoughtTail(target, object) {
    const local = worldToLocal(object, { x: object.tailX, y: object.tailY });
    for (let index = 0; index < 3; index += 1) {
      const t = 0.62 + index * 0.17;
      const x = local.x * t;
      const y = local.y * t;
      const radius = Math.max(7, object.tailWidth * (0.21 - index * 0.045));
      target.beginPath();
      target.arc(x, y, radius, 0, Math.PI * 2);
      target.fill();
      if ((object.strokeWidth || 0) > 0) target.stroke();
    }
  }

  function drawCompoundBubble(target, object) {
    const { centers, partW, partH } = compoundParts(object);
    // Render the union as a mask. Expanding that union with offset fills gives
    // one clean outside contour instead of drawing an unwanted seam through
    // the overlap between connected bubbles.
    const lineWidth = Math.max(0, object.strokeWidth || 0);
    const padding = Math.ceil(lineWidth + 4);
    const surface = document.createElement("canvas");
    surface.width = Math.ceil(object.w + padding * 2);
    surface.height = Math.ceil(object.h + padding * 2);
    const surfaceContext = surface.getContext("2d");
    const drawUnion = (offsetX, offsetY, color) => {
      surfaceContext.fillStyle = color;
      surfaceContext.beginPath();
      for (const center of centers) {
        surfaceContext.moveTo(padding + object.w / 2 + center.x + partW / 2 + offsetX, padding + object.h / 2 + center.y + offsetY);
        surfaceContext.ellipse(padding + object.w / 2 + center.x + offsetX, padding + object.h / 2 + center.y + offsetY, partW / 2, partH / 2, 0, 0, Math.PI * 2);
      }
      surfaceContext.fill();
    };
    if (lineWidth > 0) {
      const steps = 24;
      for (let index = 0; index < steps; index += 1) {
        const angle = index / steps * Math.PI * 2;
        drawUnion(Math.cos(angle) * lineWidth, Math.sin(angle) * lineWidth, object.stroke || "#171717");
      }
    }
    drawUnion(0, 0, object.fill || "#ffffff");
    target.drawImage(surface, -object.w / 2 - padding, -object.h / 2 - padding);
  }

  function compoundParts(object) {
    const parts = object.shape === "triple" ? 3 : 2;
    const horizontal = object.shape === "duo";
    const partW = horizontal ? object.w * 0.58 : object.w * 0.9;
    const partH = horizontal ? object.h * 0.9 : object.h * (parts === 3 ? 0.38 : 0.55);
    const span = horizontal ? object.w - partW : object.h - partH;
    const centers = [];
    for (let index = 0; index < parts; index += 1) {
      const t = parts === 1 ? 0.5 : index / (parts - 1);
      centers.push(horizontal
        ? { x: (t - 0.5) * span, y: (index % 2 ? 1 : -1) * object.h * 0.025 }
        : { x: (index % 2 ? 1 : -1) * object.w * 0.03, y: (t - 0.5) * span });
    }
    return { centers, partW, partH };
  }

  function drawRadialEffect(target, object, count, lengthFactor) {
    const radiusX = object.w / 2;
    const radiusY = object.h / 2;
    target.save();
    target.setLineDash([]);
    target.strokeStyle = object.stroke || "#171717";
    target.lineCap = "butt";
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2;
      const wobble = 0.76 + ((Math.sin(index * 12.9898) + 1) / 2) * 0.34;
      const inner = object.shape === "focus" ? 0.28 + (index % 5) * 0.018 : 1.02;
      const outer = object.shape === "focus" ? 1 : 1 + lengthFactor * wobble;
      target.lineWidth = Math.max(1.2, (object.strokeWidth || 3) * (0.42 + (index % 4) * 0.08));
      target.beginPath();
      target.moveTo(Math.cos(angle) * radiusX * inner, Math.sin(angle) * radiusY * inner);
      target.lineTo(Math.cos(angle) * radiusX * outer, Math.sin(angle) * radiusY * outer);
      target.stroke();
    }
    target.restore();
  }

  function drawText(target, object) {
    applyObjectTransform(target, object);
    target.textBaseline = "middle";
    target.textAlign = "center";
    target.lineJoin = "round";
    if (object.shadowBlur > 0) {
      target.shadowColor = object.shadowColor || "#000000";
      target.shadowBlur = object.shadowBlur;
      target.shadowOffsetX = Math.max(1, object.shadowBlur * 0.18);
      target.shadowOffsetY = Math.max(1, object.shadowBlur * 0.18);
    }
    if (object.direction === "vertical") drawVerticalText(target, object);
    else drawHorizontalText(target, object);
  }

  function graphemes(text) {
    if (typeof Intl?.Segmenter === "function") {
      const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
      return [...segmenter.segment(text)].map(segment => ({ text: segment.segment, index: segment.index }));
    }
    const result = [];
    let index = 0;
    for (const char of Array.from(text)) {
      result.push({ text: char, index });
      index += char.length;
    }
    return result;
  }

  function styleAt(object, index) {
    const style = {
      size: object.fontSize,
      weight: object.fontWeight,
      color: object.color,
      stroke: object.stroke,
      strokeWidth: object.strokeWidth,
      family: object.fontFamily
    };
    for (const run of object.styleRuns || []) {
      if (index >= run.start && index < run.end) {
        if (run.size != null) style.size = run.size;
        if (run.weight != null) style.weight = run.weight;
        if (run.color) style.color = run.color;
        if (run.stroke) style.stroke = run.stroke;
        if (run.strokeWidth != null) style.strokeWidth = run.strokeWidth;
        if (run.family) style.family = run.family;
      }
    }
    return style;
  }

  function applyTextStyle(target, style) {
    target.font = `${style.weight || 400} ${Math.max(1, style.size)}px ${fontStack(style.family)}`;
    target.fillStyle = style.color || "#171717";
    target.strokeStyle = style.stroke || "#ffffff";
    target.lineWidth = Math.max(0, style.strokeWidth || 0) * 2;
  }

  function fontStack(family) {
    if (!family) return '"Yu Mincho", serif';
    if (["serif", "sans-serif", "monospace"].includes(family)) return family;
    return `${JSON.stringify(family)}, "Yu Mincho", "MS PMincho", serif`;
  }

  function drawGlyph(target, glyph, x, y, style, rotate = 0, scale = 1) {
    applyTextStyle(target, style);
    target.save();
    target.translate(x, y);
    if (rotate) target.rotate(rotate);
    if (scale !== 1) target.scale(scale, scale);
    if (style.strokeWidth > 0) target.strokeText(glyph, 0, 0);
    target.fillText(glyph, 0, 0);
    target.restore();
  }

  const VERTICAL_MAP = new Map([
    ["（", "︵"], ["）", "︶"], ["(", "︵"], [")", "︶"],
    ["［", "﹇"], ["］", "﹈"], ["【", "︻"], ["】", "︼"],
    ["〈", "︿"], ["〉", "﹀"], ["《", "︽"], ["》", "︾"],
    ["「", "﹁"], ["」", "﹂"], ["『", "﹃"], ["』", "﹄"],
    ["、", "︑"], ["。", "︒"], ["…", "⋮"], ["‥", "︰"],
    ["：", "︓"], ["；", "︔"], ["！", "！"], ["？", "？"]
  ]);
  const ROTATE_VERTICAL = new Set(["ー", "―", "—", "ｰ", "～", "〜", "=", "＝", "-", "–"]);
  const PROHIBIT_COLUMN_START = new Set(Array.from("、。，．）〕］｝〉》」』】〙〗〟’”｠»ー〜…‥!?！？：；％‰℃°′″々ヽヾゝゞァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖ"));
  const PROHIBIT_COLUMN_END = new Set(Array.from("（〔［｛〈《「『【〘〖〝‘“｟«"));

  function tokenizeVertical(object) {
    const chars = graphemes(object.text || "");
    const tokens = [];
    for (let i = 0; i < chars.length; i += 1) {
      const entry = chars[i];
      if (entry.text === "\n") {
        tokens.push({ type: "break", text: "\n", index: entry.index, advance: 0, style: styleAt(object, entry.index) });
        continue;
      }
      if (/^[0-9０-９]$/.test(entry.text)) {
        let value = entry.text;
        let end = i + 1;
        while (end < chars.length && value.length < 4 && /^[0-9０-９]$/.test(chars[end].text)) {
          value += chars[end].text;
          end += 1;
        }
        if (value.length >= 2) {
          const style = styleAt(object, entry.index);
          tokens.push({ type: "tcy", text: value, index: entry.index, style, advance: style.size + object.letterSpacing });
          i = end - 1;
          continue;
        }
      }
      const style = styleAt(object, entry.index);
      tokens.push({ type: "glyph", text: entry.text, index: entry.index, style, advance: style.size + object.letterSpacing });
    }
    return tokens;
  }

  function layoutVertical(object) {
    const tokens = tokenizeVertical(object);
    const columns = [[]];
    let used = 0;
    const maxHeight = Math.max(20, object.h);
    for (const token of tokens) {
      if (token.type === "break") {
        if (columns[columns.length - 1].length) columns.push([]);
        used = 0;
        continue;
      }
      const current = columns[columns.length - 1];
      const overflow = used + token.advance > maxHeight && current.length > 0;
      if (overflow) {
        if (PROHIBIT_COLUMN_END.has(current[current.length - 1]?.text)) {
          const moved = current.pop();
          columns.push([moved]);
          used = moved.advance;
        } else {
          columns.push([]);
          used = 0;
        }
      }
      columns[columns.length - 1].push(token);
      used += token.advance;
      if (PROHIBIT_COLUMN_START.has(token.text) && columns[columns.length - 1].length === 1 && columns.length > 1) {
        const prior = columns[columns.length - 2];
        prior.push(columns[columns.length - 1].pop());
        if (!columns[columns.length - 1].length) columns.pop();
        used = 0;
      }
    }
    return columns.filter(column => column.length);
  }

  function drawVerticalText(target, object) {
    const columns = layoutVertical(object);
    const basePitch = object.fontSize + object.lineGap;
    const boxLeft = -object.w / 2;
    const boxTop = -object.h / 2;
    const startX = object.w / 2 - object.fontSize / 2;
    columns.forEach((column, columnIndex) => {
      const total = column.reduce((sum, token) => sum + token.advance, 0);
      let offset = 0;
      if (object.align === "center") offset = (object.h - total) / 2;
      if (object.align === "end") offset = object.h - total;
      let cursor = boxTop + Math.max(0, offset);
      const maxSize = Math.max(object.fontSize, ...column.map(token => token.style.size));
      const x = startX - columnIndex * Math.max(basePitch, maxSize + object.lineGap);
      for (const token of column) {
        const y = cursor + token.advance / 2;
        if (token.type === "tcy") {
          const tcyStyle = { ...token.style, size: token.style.size * (token.text.length >= 3 ? 0.55 : 0.7) };
          drawGlyph(target, token.text, x, y, tcyStyle, 0, 1);
        } else {
          const mapped = VERTICAL_MAP.get(token.text) || token.text;
          const rotate = ROTATE_VERTICAL.has(token.text) ? Math.PI / 2 : 0;
          drawGlyph(target, mapped, x, y, token.style, rotate);
        }
        cursor += token.advance;
      }
    });
  }

  function layoutHorizontal(object, target) {
    const paragraphs = (object.text || "").split("\n");
    const lines = [];
    let globalIndex = 0;
    for (const paragraph of paragraphs) {
      const entries = graphemes(paragraph);
      let line = [];
      let width = 0;
      for (const entry of entries) {
        const style = styleAt(object, globalIndex + entry.index);
        applyTextStyle(target, style);
        const advance = target.measureText(entry.text).width + object.letterSpacing;
        if (width + advance > object.w && line.length) {
          lines.push(line);
          line = [];
          width = 0;
        }
        line.push({ text: entry.text, style, advance, index: globalIndex + entry.index });
        width += advance;
      }
      lines.push(line);
      globalIndex += paragraph.length + 1;
    }
    return lines;
  }

  function drawHorizontalText(target, object) {
    const lines = layoutHorizontal(object, target);
    const lineHeight = object.fontSize + object.lineGap;
    const totalHeight = lines.length * lineHeight;
    let y = -object.h / 2 + lineHeight / 2;
    if (object.align === "center") y = -totalHeight / 2 + lineHeight / 2;
    if (object.align === "end") y = object.h / 2 - totalHeight + lineHeight / 2;
    for (const line of lines) {
      const width = line.reduce((sum, token) => sum + token.advance, 0);
      let x = -object.w / 2 + (line[0]?.advance || object.fontSize) / 2;
      if (object.align === "center") x = -width / 2 + (line[0]?.advance || object.fontSize) / 2;
      if (object.align === "end") x = object.w / 2 - width + (line[0]?.advance || object.fontSize) / 2;
      for (const token of line) {
        drawGlyph(target, token.text, x, y, token.style);
        x += token.advance;
      }
      y += lineHeight;
    }
  }

  function textAtFontSize(object, size) {
    const currentSize = Math.max(1, Number(object.fontSize) || size);
    const ratio = size / currentSize;
    return {
      ...object,
      fontSize: size,
      styleRuns: (object.styleRuns || []).map(run => run.size == null ? run : { ...run, size: run.size * ratio })
    };
  }

  function textLayoutFits(object, target = ctx) {
    if (!(object.text || "").replace(/\s/g, "")) return true;
    const visualPadding = Math.max(0, Number(object.strokeWidth) || 0) * 2 + Math.max(0, Number(object.shadowBlur) || 0) * 0.75;
    const probe = {
      ...object,
      w: Math.max(1, object.w - visualPadding * 2),
      h: Math.max(1, object.h - visualPadding * 2)
    };
    target.save();
    try {
      if (probe.direction === "vertical") {
        const columns = layoutVertical(probe);
        if (!columns.length) return true;
        const basePitch = Math.max(1, probe.fontSize + probe.lineGap);
        let usedWidth = 0;
        for (const [index, column] of columns.entries()) {
          const usedHeight = column.reduce((sum, token) => sum + token.advance, 0);
          if (usedHeight > probe.h + 0.5) return false;
          const columnSize = Math.max(probe.fontSize, ...column.map(token => token.style.size));
          usedWidth += index === 0 ? columnSize : Math.max(basePitch, columnSize + probe.lineGap);
        }
        return usedWidth <= probe.w + 0.5;
      }

      const lines = layoutHorizontal(probe, target);
      let usedHeight = 0;
      for (const [index, line] of lines.entries()) {
        const usedWidth = line.reduce((sum, token) => sum + token.advance, 0);
        if (usedWidth > probe.w + 0.5) return false;
        const lineSize = Math.max(probe.fontSize, ...line.map(token => token.style.size));
        usedHeight += lineSize;
        if (index < lines.length - 1) usedHeight += probe.lineGap;
      }
      return usedHeight <= probe.h + 0.5;
    } finally {
      target.restore();
    }
  }

  function applyAutoFit(object) {
    if (!object || object.kind !== "text" || !object.autoFit) return false;
    const previousSize = Math.max(1, Number(object.fontSize) || 16);
    const maximum = clamp(Number(object.autoFitMaxSize) || previousSize, 8, 300);
    const minimum = clamp(Number(object.autoFitMinSize) || 8, 8, maximum);
    object.autoFitMaxSize = maximum;
    object.autoFitMinSize = minimum;

    let best = minimum;
    if (!(object.text || "").replace(/\s/g, "")) {
      best = maximum;
    } else if (textLayoutFits(textAtFontSize(object, maximum))) {
      best = maximum;
    } else if (textLayoutFits(textAtFontSize(object, minimum))) {
      let low = minimum;
      let high = maximum;
      for (let iteration = 0; iteration < 14; iteration += 1) {
        const middle = (low + high) / 2;
        if (textLayoutFits(textAtFontSize(object, middle))) {
          best = middle;
          low = middle;
        } else {
          high = middle;
        }
      }
    }

    best = clamp(Math.floor(best * 2) / 2, minimum, maximum);
    const ratio = best / previousSize;
    if (Math.abs(ratio - 1) > 0.0001) {
      object.styleRuns = (object.styleRuns || []).map(run => run.size == null ? run : { ...run, size: run.size * ratio });
      object.fontSize = best;
      return true;
    }
    object.fontSize = best;
    return false;
  }

  function drawSelection(target) {
    const objects = selectedObjects().filter(object => object.visible);
    if (!objects.length) return;
    target.save();
    target.globalAlpha = 1;
    target.setLineDash([]);
    target.lineWidth = 1.4 / Math.max(state.zoom, 0.1);
    target.strokeStyle = "#ead36c";
    target.fillStyle = "#171917";
    if (objects.length === 1) drawSingleSelection(target, objects[0]);
    else drawMultiSelection(target, objects);
    if (state.guides.length) drawGuides(target);
    target.restore();
  }

  function drawSingleSelection(target, object) {
    const corners = objectCorners(object);
    target.beginPath();
    target.moveTo(corners.tl.x, corners.tl.y);
    target.lineTo(corners.tr.x, corners.tr.y);
    target.lineTo(corners.br.x, corners.br.y);
    target.lineTo(corners.bl.x, corners.bl.y);
    target.closePath();
    target.stroke();
    const radius = 6 / Math.max(state.zoom, 0.1);
    for (const point of Object.values(corners)) drawHandle(target, point.x, point.y, radius);
    const rotate = rotationHandle(object);
    const topMid = midpoint(corners.tl, corners.tr);
    target.beginPath();
    target.moveTo(topMid.x, topMid.y);
    target.lineTo(rotate.x, rotate.y);
    target.stroke();
    target.beginPath();
    target.arc(rotate.x, rotate.y, radius * 1.05, 0, Math.PI * 2);
    target.fillStyle = "#ead36c";
    target.fill();
    target.strokeStyle = "#171917";
    target.stroke();
    if (object.kind === "bubble" && object.tailEnabled) {
      target.beginPath();
      target.setLineDash([6 / state.zoom, 5 / state.zoom]);
      target.strokeStyle = "#ead36c";
      target.moveTo(object.x + object.w / 2, object.y + object.h / 2);
      target.lineTo(object.tailX, object.tailY);
      target.stroke();
      target.setLineDash([]);
      target.fillStyle = "#ead36c";
      target.beginPath();
      target.arc(object.tailX, object.tailY, radius * 1.15, 0, Math.PI * 2);
      target.fill();
    }
  }

  function drawMultiSelection(target, objects) {
    const bounds = collectiveBounds(objects);
    target.setLineDash([8 / state.zoom, 5 / state.zoom]);
    target.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    target.setLineDash([]);
  }

  function drawHandle(target, x, y, radius) {
    target.beginPath();
    target.rect(x - radius, y - radius, radius * 2, radius * 2);
    target.fillStyle = "#171917";
    target.fill();
    target.strokeStyle = "#ead36c";
    target.stroke();
  }

  function drawGuides(target) {
    target.save();
    target.setLineDash([8 / state.zoom, 5 / state.zoom]);
    target.strokeStyle = "#74a7e8";
    target.lineWidth = 1 / state.zoom;
    for (const guide of state.guides) {
      target.beginPath();
      if (guide.axis === "x") {
        target.moveTo(guide.value, 0);
        target.lineTo(guide.value, state.height);
      } else {
        target.moveTo(0, guide.value);
        target.lineTo(state.width, guide.value);
      }
      target.stroke();
    }
    target.restore();
  }

  function objectCorners(object) {
    const center = { x: object.x + object.w / 2, y: object.y + object.h / 2 };
    const angle = (object.rotation || 0) * Math.PI / 180;
    return {
      tl: rotatePoint({ x: object.x, y: object.y }, center, angle),
      tr: rotatePoint({ x: object.x + object.w, y: object.y }, center, angle),
      br: rotatePoint({ x: object.x + object.w, y: object.y + object.h }, center, angle),
      bl: rotatePoint({ x: object.x, y: object.y + object.h }, center, angle)
    };
  }

  function rotationHandle(object) {
    const corners = objectCorners(object);
    const top = midpoint(corners.tl, corners.tr);
    const center = { x: object.x + object.w / 2, y: object.y + object.h / 2 };
    const vector = normalize({ x: top.x - center.x, y: top.y - center.y });
    const distance = 34 / Math.max(state.zoom, 0.1);
    return { x: top.x + vector.x * distance, y: top.y + vector.y * distance };
  }

  function rotatePoint(point, center, angle) {
    const x = point.x - center.x;
    const y = point.y - center.y;
    return {
      x: center.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: center.y + x * Math.sin(angle) + y * Math.cos(angle)
    };
  }

  function worldToLocal(object, point) {
    const center = { x: object.x + object.w / 2, y: object.y + object.h / 2 };
    const rotated = rotatePoint(point, center, -(object.rotation || 0) * Math.PI / 180);
    return { x: rotated.x - center.x, y: rotated.y - center.y };
  }

  function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function normalize(vector) {
    const length = Math.hypot(vector.x, vector.y) || 1;
    return { x: vector.x / length, y: vector.y / length };
  }

  function collectiveBounds(objects) {
    const points = objects.flatMap(object => Object.values(objectCorners(object)));
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * state.width / rect.width,
      y: (event.clientY - rect.top) * state.height / rect.height
    };
  }

  function hitTest(point) {
    for (let index = state.objects.length - 1; index >= 0; index -= 1) {
      const object = state.objects[index];
      if (!object.visible || object.locked) continue;
      const local = worldToLocal(object, point);
      const padding = 5 / Math.max(state.zoom, 0.1);
      if (Math.abs(local.x) <= object.w / 2 + padding && Math.abs(local.y) <= object.h / 2 + padding) return object;
    }
    return null;
  }

  function selectionHandleAt(point, object) {
    const tolerance = 13 / Math.max(state.zoom, 0.1);
    if (object.kind === "bubble" && object.tailEnabled && distance(point, { x: object.tailX, y: object.tailY }) <= tolerance) return "tail";
    if (distance(point, rotationHandle(object)) <= tolerance) return "rotate";
    const corners = objectCorners(object);
    for (const name of ["tl", "tr", "br", "bl"]) if (distance(point, corners[name]) <= tolerance) return name;
    return null;
  }

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function onCanvasPointerDown(event) {
    if (event.button !== 0 && event.button !== 1) return;
    state.pointerInsideCanvas = true;
    const point = canvasPoint(event);
    if (effectiveTool() === "hand" || event.button === 1) {
      beginPan(event);
      return;
    }
    const single = selectedObjects().length === 1 ? topSelectedObject() : null;
    const handle = single && !single.locked ? selectionHandleAt(point, single) : null;
    if (handle) {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      if (handle === "tail") beginTailDrag(event, point, single);
      else if (handle === "rotate") beginRotate(event, point, single);
      else beginResize(event, point, single, handle);
      return;
    }

    const hit = hitTest(point);
    if (!hit) {
      if (!event.shiftKey) clearSelection();
      return;
    }
    const groupMembers = hit.groupId && !event.altKey
      ? state.objects.filter(object => object.groupId === hit.groupId).map(object => object.id)
      : [hit.id];
    if (event.shiftKey) {
      for (const id of groupMembers) {
        if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
      }
    } else if (!state.selected.has(hit.id)) {
      state.selected = new Set(groupMembers);
    }
    syncSelectionUI();
    requestRender();
    if (state.selected.has(hit.id) && !hit.locked) beginMove(event, point, hit, event.altKey);
  }

  function onCanvasPointerMove(event) {
    const point = canvasPoint(event);
    state.pointerInsideCanvas = true;
    if (!state.interaction) {
      updateCanvasCursor(point);
      return;
    }
    if (state.interaction.type === "move") updateMove(point, event);
    if (state.interaction.type === "resize") updateResize(point, event);
    if (state.interaction.type === "rotate") updateRotate(point, event);
    if (state.interaction.type === "tail") updateTail(point);
  }

  function onCanvasPointerUp(event) {
    if (!state.interaction) return;
    const type = state.interaction.type;
    state.interaction = null;
    state.guides = [];
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (["move", "resize", "rotate", "tail"].includes(type)) commitMutation(type === "move" ? "移動物件" : "調整物件");
    requestRender();
  }

  function onCanvasDoubleClick(event) {
    const point = canvasPoint(event);
    const hit = hitTest(point);
    if (!hit) return;
    const text = hit.kind === "text" ? hit : linkedTextForPoint(hit, point);
    if (!text) return;
    event.preventDefault();
    beginCanvasTextEdit(text);
  }

  function linkedTextForPoint(bubble, point) {
    if (!bubble || bubble.kind !== "bubble") return null;
    const texts = linkedTextIdsForBubble(bubble).map(objectById).filter(object => object?.kind === "text");
    if (!texts.length) return null;
    const containing = texts.find(text => {
      const local = worldToLocal(text, point);
      return Math.abs(local.x) <= text.w / 2 && Math.abs(local.y) <= text.h / 2;
    });
    if (containing) return containing;
    return texts.reduce((nearest, text) => {
      const center = { x: text.x + text.w / 2, y: text.y + text.h / 2 };
      const score = distance(point, center);
      return !nearest || score < nearest.score ? { text, score } : nearest;
    }, null)?.text || null;
  }

  function beginCanvasTextEdit(object) {
    if (!object || object.kind !== "text") return;
    if (object.locked) {
      showToast("文字圖層已鎖定", "請先在圖層面板解鎖，再編輯文字。", "error");
      return;
    }
    finishCanvasTextEdit();
    selectOnly(object.id);
    switchPanelTab("right", "properties");
    state.editingTextId = object.id;
    canvasTextEditor.value = object.text || "";
    updateCanvasTextEditorStyle(object);
    canvasTextEditor.hidden = false;
    requestRender();
    requestAnimationFrame(() => {
      canvasTextEditor.focus();
      const end = canvasTextEditor.value.length;
      canvasTextEditor.setSelectionRange(end, end);
    });
  }

  function updateCanvasTextEditorStyle(object) {
    canvasTextEditor.style.left = `${object.x}px`;
    canvasTextEditor.style.top = `${object.y}px`;
    canvasTextEditor.style.width = `${object.w}px`;
    canvasTextEditor.style.height = `${object.h}px`;
    canvasTextEditor.style.transformOrigin = "center center";
    canvasTextEditor.style.transform = `rotate(${object.rotation || 0}deg)`;
    canvasTextEditor.style.fontFamily = fontStack(object.fontFamily);
    canvasTextEditor.style.fontSize = `${Math.max(8, object.fontSize)}px`;
    canvasTextEditor.style.fontWeight = String(object.fontWeight || 400);
    canvasTextEditor.style.letterSpacing = `${object.letterSpacing || 0}px`;
    canvasTextEditor.style.lineHeight = String(Math.max(0.7, (object.fontSize + object.lineGap) / Math.max(1, object.fontSize)));
    canvasTextEditor.style.textAlign = object.align === "center" ? "center" : object.align === "end" ? "end" : "start";
    canvasTextEditor.style.writingMode = object.direction === "vertical" ? "vertical-rl" : "horizontal-tb";
    canvasTextEditor.style.textOrientation = object.direction === "vertical" ? "mixed" : "initial";
    const color = normalizeColor(object.color, "#171717");
    const red = parseInt(color.slice(1, 3), 16);
    const green = parseInt(color.slice(3, 5), 16);
    const blue = parseInt(color.slice(5, 7), 16);
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    canvasTextEditor.classList.toggle("is-dark", luminance > 145);
    canvasTextEditor.style.color = color;
  }

  function onCanvasTextEditorInput(event) {
    const object = objectById(state.editingTextId);
    if (!object || object.kind !== "text") return;
    const nextText = event.target.value;
    object.styleRuns = remapStyleRuns(object.text || "", nextText, object.styleRuns || []);
    object.text = nextText;
    applyAutoFit(object);
    updateCanvasTextEditorStyle(object);
    if (state.selected.has(object.id)) {
      $("#textContentInput").value = nextText;
      syncAutoFitInspector(object);
    }
    setDocumentStatus(true);
    scheduleHistory();
    requestRender();
  }

  function onCanvasTextEditorKeyDown(event) {
    if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) {
      event.preventDefault();
      canvasTextEditor.blur();
    }
  }

  function finishCanvasTextEdit() {
    if (!state.editingTextId) return;
    state.editingTextId = null;
    canvasTextEditor.hidden = true;
    flushScheduledHistory();
    requestRender();
  }

  function updateCanvasCursor(point) {
    if (effectiveTool() === "hand") { canvas.style.cursor = "grab"; return; }
    const object = selectedObjects().length === 1 ? topSelectedObject() : null;
    const handle = object && selectionHandleAt(point, object);
    const cursorMap = { tl: "nwse-resize", br: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize", rotate: "crosshair", tail: "move" };
    canvas.style.cursor = cursorMap[handle] || (hitTest(point) ? "move" : "default");
  }

  function beginMove(event, point, hit, altSeparate) {
    const ids = new Set(state.selected);
    if (!altSeparate && hit.kind === "bubble") linkedTextIdsForBubble(hit).forEach(id => ids.add(id));
    state.interaction = {
      type: "move",
      startPoint: point,
      primaryId: hit.id,
      ids: [...ids],
      start: new Map([...ids].map(id => {
        const object = objectById(id);
        return [id, object ? { x: object.x, y: object.y, tailX: object.tailX, tailY: object.tailY } : null];
      }))
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function updateMove(point, event) {
    const interaction = state.interaction;
    const primary = objectById(interaction.primaryId);
    const primaryStart = interaction.start.get(interaction.primaryId);
    let dx = point.x - interaction.startPoint.x;
    let dy = point.y - interaction.startPoint.y;
    state.guides = [];
    if (!event.ctrlKey && primary && primaryStart) {
      const snapped = snapDelta(primary, primaryStart, dx, dy, interaction.ids);
      dx = snapped.dx;
      dy = snapped.dy;
      state.guides = snapped.guides;
    }
    for (const id of interaction.ids) {
      const object = objectById(id);
      const start = interaction.start.get(id);
      if (!object || !start) continue;
      object.x = start.x + dx;
      object.y = start.y + dy;
      if (object.kind === "bubble" && start.tailX != null) {
        object.tailX = start.tailX + dx;
        object.tailY = start.tailY + dy;
      }
    }
    setDocumentStatus(true);
    syncInspectorGeometryOnly();
    requestRender();
  }

  function snapDelta(object, start, dx, dy, ignoredIds) {
    const threshold = 8 / Math.max(state.zoom, 0.1);
    const xCandidates = [0, state.width / 2, state.width];
    const yCandidates = [0, state.height / 2, state.height];
    for (const other of state.objects) {
      if (ignoredIds.includes(other.id) || !other.visible) continue;
      const bounds = collectiveBounds([other]);
      xCandidates.push(bounds.x, bounds.x + bounds.w / 2, bounds.x + bounds.w);
      yCandidates.push(bounds.y, bounds.y + bounds.h / 2, bounds.y + bounds.h);
    }
    const movingX = [start.x + dx, start.x + dx + object.w / 2, start.x + dx + object.w];
    const movingY = [start.y + dy, start.y + dy + object.h / 2, start.y + dy + object.h];
    let bestX = null;
    let bestY = null;
    for (const moving of movingX) for (const candidate of xCandidates) {
      const delta = candidate - moving;
      if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, value: candidate };
    }
    for (const moving of movingY) for (const candidate of yCandidates) {
      const delta = candidate - moving;
      if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, value: candidate };
    }
    const guides = [];
    if (bestX) { dx += bestX.delta; guides.push({ axis: "x", value: bestX.value }); }
    if (bestY) { dy += bestY.delta; guides.push({ axis: "y", value: bestY.value }); }
    return { dx, dy, guides };
  }

  function beginResize(event, point, object, handle) {
    const corners = objectCorners(object);
    const opposite = { tl: "br", br: "tl", tr: "bl", bl: "tr" }[handle];
    state.interaction = {
      type: "resize",
      objectId: object.id,
      handle,
      anchor: corners[opposite],
      start: deepClone(object),
      linkedStarts: object.kind === "bubble" ? linkedTextIdsForBubble(object).map(id => deepClone(objectById(id))).filter(Boolean) : [],
      aspect: object.w / object.h,
      pointer: point,
      altSeparate: event.altKey
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function updateResize(point, event) {
    const interaction = state.interaction;
    const object = objectById(interaction.objectId);
    if (!object) return;
    const angle = (interaction.start.rotation || 0) * Math.PI / 180;
    const rotatedPoint = rotatePoint(point, interaction.anchor, -angle);
    const dx = rotatedPoint.x - interaction.anchor.x;
    const dy = rotatedPoint.y - interaction.anchor.y;
    const signs = { tl: [-1, -1], tr: [1, -1], br: [1, 1], bl: [-1, 1] }[interaction.handle];
    let newW = Math.max(MIN_SIZE, Math.abs(dx));
    let newH = Math.max(MIN_SIZE, Math.abs(dy));
    if (event.shiftKey) {
      if (newW / newH > interaction.aspect) newH = newW / interaction.aspect;
      else newW = newH * interaction.aspect;
    }
    const localCenter = { x: signs[0] * newW / 2, y: signs[1] * newH / 2 };
    const center = rotatePoint({ x: interaction.anchor.x + localCenter.x, y: interaction.anchor.y + localCenter.y }, interaction.anchor, angle);
    object.w = newW;
    object.h = newH;
    object.x = center.x - newW / 2;
    object.y = center.y - newH / 2;
    if (object.kind === "bubble" && interaction.linkedStarts.length && !event.altKey) resizeLinkedTexts(object, interaction.start, interaction.linkedStarts);
    if (object.kind === "text") applyAutoFit(object);
    setDocumentStatus(true);
    syncInspectorGeometryOnly();
    requestRender();
  }

  function resizeLinkedTexts(bubble, bubbleStart, textStarts) {
    for (const textStart of textStarts) {
      const text = objectById(textStart.id);
      if (!text) continue;
      const relX = (textStart.x - bubbleStart.x) / bubbleStart.w;
      const relY = (textStart.y - bubbleStart.y) / bubbleStart.h;
      const relW = textStart.w / bubbleStart.w;
      const relH = textStart.h / bubbleStart.h;
      text.x = bubble.x + relX * bubble.w;
      text.y = bubble.y + relY * bubble.h;
      text.w = relW * bubble.w;
      text.h = relH * bubble.h;
      if (text.autoFit) {
        applyAutoFit(text);
      } else {
        const scale = Math.sqrt((bubble.w / bubbleStart.w) * (bubble.h / bubbleStart.h));
        text.fontSize = clamp(textStart.fontSize * scale, 8, 300);
        text.lineGap = textStart.lineGap * scale;
        text.letterSpacing = textStart.letterSpacing * scale;
      }
    }
  }

  function beginRotate(event, point, object) {
    const center = { x: object.x + object.w / 2, y: object.y + object.h / 2 };
    state.interaction = {
      type: "rotate",
      objectId: object.id,
      center,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x),
      startRotation: object.rotation || 0
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function updateRotate(point, event) {
    const interaction = state.interaction;
    const object = objectById(interaction.objectId);
    if (!object) return;
    const angle = Math.atan2(point.y - interaction.center.y, point.x - interaction.center.x);
    let degrees = interaction.startRotation + (angle - interaction.startAngle) * 180 / Math.PI;
    if (event.shiftKey) degrees = Math.round(degrees / 15) * 15;
    object.rotation = normalizeDegrees(degrees);
    setDocumentStatus(true);
    syncInspectorGeometryOnly();
    requestRender();
  }

  function beginTailDrag(event, point, object) {
    state.interaction = { type: "tail", objectId: object.id, startPoint: point };
    canvas.setPointerCapture(event.pointerId);
  }

  function updateTail(point) {
    const object = objectById(state.interaction.objectId);
    if (!object) return;
    object.tailX = point.x;
    object.tailY = point.y;
    setDocumentStatus(true);
    syncInspectorGeometryOnly();
    requestRender();
  }

  function normalizeDegrees(value) {
    let result = value % 360;
    if (result > 180) result -= 360;
    if (result < -180) result += 360;
    return Math.round(result * 10) / 10;
  }

  function onViewportPointerDown(event) {
    if (event.target === canvas) return;
    if (effectiveTool() === "hand" || state.temporaryHand || event.button === 1) beginPan(event);
    else if (!event.target.closest("button,input,select,textarea")) clearSelection();
  }

  function beginPan(event) {
    event.preventDefault();
    state.interaction = { type: "pan", startClientX: event.clientX, startClientY: event.clientY, panX: state.panX, panY: state.panY };
    viewport.classList.add("is-panning");
  }

  function onWindowPointerMove(event) {
    if (state.interaction?.type !== "pan") return;
    state.panX = state.interaction.panX + event.clientX - state.interaction.startClientX;
    state.panY = state.interaction.panY + event.clientY - state.interaction.startClientY;
    updateStageTransform();
  }

  function onWindowPointerUp() {
    if (state.interaction?.type !== "pan") return;
    state.interaction = null;
    viewport.classList.remove("is-panning");
  }

  function onViewportWheel(event) {
    event.preventDefault();
    if (!state.background && !state.objects.length) return;
    if (event.ctrlKey) {
      setZoom(state.zoom * (event.deltaY < 0 ? 1.08 : 0.92), { clientX: event.clientX, clientY: event.clientY });
    } else {
      state.panX -= event.deltaX;
      state.panY -= event.deltaY;
      updateStageTransform();
    }
  }

  function setTool(tool) {
    state.tool = tool;
    viewport.dataset.tool = tool;
    $$('[data-tool]').forEach(button => button.classList.toggle("active", button.dataset.tool === tool));
    canvas.style.cursor = tool === "hand" ? "grab" : "default";
  }

  function effectiveTool() { return state.temporaryHand ? "hand" : state.tool; }

  function setZoom(value, focal = null) {
    const next = clamp(value, 0.1, 1.6);
    if (focal) {
      const rect = viewport.getBoundingClientRect();
      const x = focal.clientX - (rect.left + rect.width / 2) - state.panX;
      const y = focal.clientY - (rect.top + rect.height / 2) - state.panY;
      const ratio = next / state.zoom;
      state.panX -= x * (ratio - 1);
      state.panY -= y * (ratio - 1);
    }
    state.zoom = next;
    updateStageTransform();
  }

  function fitCanvas(resetPan = true) {
    if (!state.background && !state.objects.length) return;
    const rect = viewport.getBoundingClientRect();
    const availableW = Math.max(100, rect.width - 56);
    const availableH = Math.max(100, rect.height - 56);
    state.zoom = clamp(Math.min(availableW / state.width, availableH / state.height), 0.1, 1.0);
    if (resetPan) { state.panX = 0; state.panY = 0; }
    updateStageTransform();
  }

  function updateStageTransform() {
    shell.style.left = `calc(50% + ${state.panX}px)`;
    shell.style.top = `calc(50% + ${state.panY}px)`;
    // Scale first so the percentage centering offset is expressed in the
    // scaled canvas size. Reversing these functions pushes large canvases far
    // outside the viewport at fit-to-screen zoom levels.
    shell.style.transform = `scale(${state.zoom}) translate(-50%, -50%)`;
    $("#zoomSlider").value = String(Math.round(state.zoom * 100));
    $("#zoomValue").textContent = `${Math.round(state.zoom * 100)}%`;
    requestRender();
  }

  function selectOnly(id) {
    state.selected = id ? new Set([id]) : new Set();
    syncSelectionUI();
    requestRender();
  }

  function clearSelection() {
    if (!state.selected.size) return;
    state.selected.clear();
    syncSelectionUI();
    requestRender();
  }

  function deleteSelection() {
    if (!state.selected.size) return;
    const ids = new Set(state.selected);
    for (const object of selectedObjects()) {
      if (object.kind === "bubble") linkedTextIdsForBubble(object).forEach(id => ids.add(id));
      if (object.kind === "text" && object.linkedBubbleId) {
        const bubble = objectById(object.linkedBubbleId);
        if (bubble) {
          bubble.linkedTextIds = linkedTextIdsForBubble(bubble).filter(id => id !== object.id);
          bubble.linkedTextId = bubble.linkedTextIds[0] || null;
        }
      }
    }
    state.objects = state.objects.filter(object => !ids.has(object.id) || object.locked);
    state.selected.clear();
    commitMutation("刪除物件");
  }

  function duplicateSelection() {
    const selected = selectedComponentObjects();
    if (!selected.length) return;
    const idMap = new Map(selected.map(object => [object.id, uid(object.kind)]));
    const groupMap = new Map();
    const copies = selected.map(object => {
      const copy = deepClone(object);
      copy.id = idMap.get(object.id);
      copy.name = `${object.name} 複本`;
      copy.x += 26;
      copy.y += 26;
      if (copy.tailX != null) { copy.tailX += 26; copy.tailY += 26; }
      if (copy.linkedTextId) copy.linkedTextId = idMap.get(copy.linkedTextId) || null;
      if (Array.isArray(copy.linkedTextIds)) copy.linkedTextIds = copy.linkedTextIds.map(id => idMap.get(id)).filter(Boolean);
      if (copy.linkedBubbleId) copy.linkedBubbleId = idMap.get(copy.linkedBubbleId) || null;
      if (copy.groupId) {
        if (!groupMap.has(copy.groupId)) groupMap.set(copy.groupId, uid("group"));
        copy.groupId = groupMap.get(copy.groupId);
      }
      return copy;
    });
    state.objects.push(...copies);
    state.selected = new Set(copies.map(object => object.id));
    commitMutation("複製物件");
  }

  function copySelection() {
    state.clipboard = deepClone(selectedComponentObjects());
    if (state.clipboard.length) showToast("已複製", `${state.clipboard.length} 個物件已放入應用程式剪貼簿。`);
  }

  function pasteSelection() {
    if (!state.clipboard.length) return;
    const copies = deepClone(state.clipboard);
    const idMap = new Map(copies.map(object => [object.id, uid(object.kind)]));
    const groupMap = new Map();
    for (const copy of copies) {
      copy.id = idMap.get(copy.id);
      copy.x += 32;
      copy.y += 32;
      if (copy.tailX != null) { copy.tailX += 32; copy.tailY += 32; }
      if (copy.linkedTextId) copy.linkedTextId = idMap.get(copy.linkedTextId) || null;
      if (Array.isArray(copy.linkedTextIds)) copy.linkedTextIds = copy.linkedTextIds.map(id => idMap.get(id)).filter(Boolean);
      if (copy.linkedBubbleId) copy.linkedBubbleId = idMap.get(copy.linkedBubbleId) || null;
      if (copy.groupId) {
        if (!groupMap.has(copy.groupId)) groupMap.set(copy.groupId, uid("group"));
        copy.groupId = groupMap.get(copy.groupId);
      }
    }
    state.objects.push(...copies);
    state.selected = new Set(copies.map(object => object.id));
    state.clipboard = deepClone(copies);
    commitMutation("貼上物件");
  }

  function groupSelection() {
    const selected = selectedObjects();
    if (selected.length < 2) {
      showToast("需要多重選取", "按住 Shift 點選至少兩個物件。", "error");
      return;
    }
    const groupId = uid("group");
    selected.forEach(object => { object.groupId = groupId; });
    commitMutation("群組物件");
  }

  function ungroupSelection() {
    const selected = selectedObjects();
    if (!selected.some(object => object.groupId)) return;
    const groups = new Set(selected.map(object => object.groupId).filter(Boolean));
    state.objects.forEach(object => { if (groups.has(object.groupId)) object.groupId = null; });
    commitMutation("取消群組");
  }

  function reorderSelection(direction) {
    if (!state.selected.size) return;
    const ordered = direction > 0 ? [...state.objects].reverse() : [...state.objects];
    for (const object of ordered) {
      if (!state.selected.has(object.id)) continue;
      const index = state.objects.indexOf(object);
      const target = clamp(index + direction, 0, state.objects.length - 1);
      if (target === index) continue;
      state.objects.splice(index, 1);
      state.objects.splice(target, 0, object);
    }
    commitMutation("調整圖層順序");
  }

  function alignSelection(mode) {
    const objects = selectedObjects();
    if (objects.length < 2) return;
    const bounds = collectiveBounds(objects);
    for (const object of objects) {
      if (mode === "left") object.x = bounds.x;
      if (mode === "hcenter") object.x = bounds.x + bounds.w / 2 - object.w / 2;
      if (mode === "right") object.x = bounds.x + bounds.w - object.w;
      if (mode === "top") object.y = bounds.y;
      if (mode === "vcenter") object.y = bounds.y + bounds.h / 2 - object.h / 2;
      if (mode === "bottom") object.y = bounds.y + bounds.h - object.h;
    }
    commitMutation("排列物件");
  }

  function onKeyDown(event) {
    const editable = event.target.matches("input, textarea, select, [contenteditable=true]");
    if (event.code === "Space" && !editable) {
      event.preventDefault();
      state.temporaryHand = true;
      viewport.dataset.tool = "hand";
      return;
    }
    if (editable) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (modifier && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
    if (modifier && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelection(); return; }
    if (modifier && event.key.toLowerCase() === "c") { event.preventDefault(); copySelection(); return; }
    if (modifier && event.key.toLowerCase() === "v") { event.preventDefault(); pasteSelection(); return; }
    if (modifier && event.key.toLowerCase() === "g") { event.preventDefault(); event.shiftKey ? ungroupSelection() : groupSelection(); return; }
    if (modifier && event.key.toLowerCase() === "s") { event.preventDefault(); exportProject(); return; }
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelection(); return; }
    if (event.key.toLowerCase() === "v") setTool("select");
    if (event.key.toLowerCase() === "h") setTool("hand");
    if (event.key.toLowerCase() === "t") addText(event.shiftKey ? "horizontal" : "vertical");
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      nudgeSelection(event.key, event.shiftKey ? 10 : 1);
    }
  }

  function onKeyUp(event) {
    if (event.code === "Space") {
      state.temporaryHand = false;
      viewport.dataset.tool = state.tool;
    }
  }

  function nudgeSelection(key, amount) {
    const delta = { ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount] }[key];
    for (const object of selectedObjects()) {
      if (object.locked) continue;
      object.x += delta[0];
      object.y += delta[1];
      if (object.kind === "bubble" && object.tailX != null) { object.tailX += delta[0]; object.tailY += delta[1]; }
    }
    commitMutation("微移物件");
  }

  function onDragEnter(event) { event.preventDefault(); $("#stageDropOverlay").hidden = false; }
  function onDragOver(event) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }
  function onDragLeave(event) { if (!viewport.contains(event.relatedTarget)) $("#stageDropOverlay").hidden = true; }
  function onDrop(event) {
    event.preventDefault();
    $("#stageDropOverlay").hidden = true;
    const file = [...event.dataTransfer.files].find(item => item.type.startsWith("image/"));
    if (file) handleImageFile(file);
  }

  function bindInspector() {
    const textBindings = {
      fontFamilyInput: ["fontFamily", value => value],
      fontSizeInput: ["fontSize", Number],
      fontWeightInput: ["fontWeight", Number],
      letterSpacingInput: ["letterSpacing", Number],
      lineGapInput: ["lineGap", Number],
      textColorInput: ["color", value => value],
      textStrokeColorInput: ["stroke", value => value],
      textStrokeWidthInput: ["strokeWidth", Number],
      textShadowBlurInput: ["shadowBlur", Number]
    };
    for (const [id, [property, parse]] of Object.entries(textBindings)) {
      $(`#${id}`).addEventListener("input", event => mutateSelected("text", property, parse(event.target.value), true));
      $(`#${id}`).addEventListener("change", flushScheduledHistory);
    }
    $("#textContentInput").addEventListener("input", handleTextContentInput);
    $("#textContentInput").addEventListener("change", flushScheduledHistory);
    $("#autoFitToggle").addEventListener("change", event => {
      const object = topSelectedObject();
      if (object?.kind !== "text") return;
      object.autoFit = event.target.checked;
      if (object.autoFit) {
        object.autoFitMaxSize = clamp(Number(object.fontSize) || 56, 8, 300);
        object.autoFitMinSize = clamp(Number(object.autoFitMinSize) || 12, 8, object.autoFitMaxSize);
        applyAutoFit(object);
      }
      commitMutation(object.autoFit ? "開啟自動配合文字框" : "關閉自動配合文字框");
    });
    for (const [id, property] of [["autoFitMinInput", "autoFitMinSize"], ["autoFitMaxInput", "autoFitMaxSize"]]) {
      $(`#${id}`).addEventListener("input", event => {
        const object = topSelectedObject();
        if (object?.kind !== "text" || !object.autoFit) return;
        object[property] = clamp(Number(event.target.value) || 8, 8, 300);
        if (object.autoFitMinSize > object.autoFitMaxSize) {
          if (property === "autoFitMinSize") object.autoFitMaxSize = object.autoFitMinSize;
          else object.autoFitMinSize = object.autoFitMaxSize;
        }
        applyAutoFit(object);
        setDocumentStatus(true);
        scheduleHistory();
        syncAutoFitInspector(object);
        requestRender();
      });
      $(`#${id}`).addEventListener("change", flushScheduledHistory);
    }
    $("#toggleWritingModeButton").addEventListener("click", () => {
      const object = topSelectedObject();
      if (object?.kind !== "text") return;
      object.direction = object.direction === "vertical" ? "horizontal" : "vertical";
      object.name = object.direction === "vertical" ? object.name.replace("橫排", "直排") : object.name.replace("直排", "橫排");
      applyAutoFit(object);
      commitMutation("切換排版方向");
    });
    $("#textAlignGroup").addEventListener("click", event => {
      const button = event.target.closest("[data-value]");
      if (button) { mutateSelected("text", "align", button.dataset.value); commitMutation("調整文字對齊"); }
    });
    $("#applyMixedStyleButton").addEventListener("click", applyMixedStyle);
    $("#clearMixedStyleButton").addEventListener("click", clearMixedStyle);

    const bubbleBindings = {
      bubbleFillInput: ["fill", value => value],
      bubbleStrokeInput: ["stroke", value => value],
      bubbleOpacityInput: ["opacity", Number],
      bubbleStrokeWidthInput: ["strokeWidth", Number],
      tailXInput: ["tailX", Number],
      tailYInput: ["tailY", Number],
      tailWidthInput: ["tailWidth", Number]
    };
    for (const [id, [property, parse]] of Object.entries(bubbleBindings)) {
      $(`#${id}`).addEventListener("input", event => mutateSelected("bubble", property, parse(event.target.value), true));
      $(`#${id}`).addEventListener("change", flushScheduledHistory);
    }
    $("#tailEnabledInput").addEventListener("change", event => { mutateSelected("bubble", "tailEnabled", event.target.checked); commitMutation("切換氣泡尾巴"); });
    $("#linkTextToggle").addEventListener("change", toggleTextLink);

    const geometryBindings = {
      objectXInput: ["x", Number], objectYInput: ["y", Number], objectWInput: ["w", Number], objectHInput: ["h", Number], objectRotationInput: ["rotation", Number], objectRotationRange: ["rotation", Number]
    };
    for (const [id, [property, parse]] of Object.entries(geometryBindings)) {
      $(`#${id}`).addEventListener("input", event => {
        const object = topSelectedObject();
        if (!object || selectedObjects().length !== 1) return;
        object[property] = property === "rotation" ? normalizeDegrees(parse(event.target.value)) : parse(event.target.value);
        if (["w", "h"].includes(property)) object[property] = Math.max(MIN_SIZE, object[property]);
        if (object.kind === "text" && ["w", "h"].includes(property)) {
          applyAutoFit(object);
          syncAutoFitInspector(object);
        }
        if (property === "rotation") {
          $("#objectRotationInput").value = object.rotation;
          $("#objectRotationRange").value = object.rotation;
        }
        setDocumentStatus(true);
        scheduleHistory();
        requestRender();
      });
      $(`#${id}`).addEventListener("change", flushScheduledHistory);
    }
    $$('[data-action="rename"]').forEach(button => button.addEventListener("click", renameSelected));
    $$('[data-align]').forEach(button => button.addEventListener("click", () => alignSelection(button.dataset.align)));
  }

  function mutateSelected(kind, property, value, schedule = false) {
    if (state.inspectorSyncing) return;
    const object = topSelectedObject();
    if (!object || object.kind !== kind) return;
    object[property] = value;
    if (kind === "text" && object.autoFit && ["fontFamily", "fontWeight", "letterSpacing", "lineGap", "strokeWidth", "shadowBlur"].includes(property)) {
      applyAutoFit(object);
      syncAutoFitInspector(object);
    }
    setDocumentStatus(true);
    if (schedule) scheduleHistory();
    syncInspectorDecorations();
    requestRender();
  }

  function handleTextContentInput(event) {
    if (state.inspectorSyncing) return;
    const object = topSelectedObject();
    if (object?.kind !== "text") return;
    const nextText = event.target.value;
    object.styleRuns = remapStyleRuns(object.text || "", nextText, object.styleRuns || []);
    object.text = nextText;
    applyAutoFit(object);
    syncAutoFitInspector(object);
    setDocumentStatus(true);
    scheduleHistory();
    requestRender();
  }

  function remapStyleRuns(previousText, nextText, runs) {
    if (!runs.length || previousText === nextText) return runs;
    let prefix = 0;
    const prefixLimit = Math.min(previousText.length, nextText.length);
    while (prefix < prefixLimit && previousText[prefix] === nextText[prefix]) prefix += 1;
    let suffix = 0;
    const suffixLimit = Math.min(previousText.length - prefix, nextText.length - prefix);
    while (suffix < suffixLimit && previousText[previousText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]) suffix += 1;
    const removedEnd = previousText.length - suffix;
    const insertedEnd = nextText.length - suffix;
    const delta = nextText.length - previousText.length;
    const result = [];
    for (const run of runs) {
      if (run.end <= prefix) {
        result.push(run);
        continue;
      }
      if (run.start >= removedEnd) {
        result.push({ ...run, start: run.start + delta, end: run.end + delta });
        continue;
      }
      if (prefix === removedEnd && run.start <= prefix && run.end >= prefix) {
        result.push({ ...run, end: run.end + (insertedEnd - prefix) });
        continue;
      }
      if (run.start < prefix) result.push({ ...run, end: prefix });
      if (run.end > removedEnd) result.push({ ...run, start: insertedEnd, end: run.end + delta });
    }
    return result.filter(run => run.end > run.start && run.start >= 0 && run.end <= nextText.length);
  }

  function toggleTextLink(event) {
    const bubble = topSelectedObject();
    if (bubble?.kind !== "bubble") return;
    if (event.target.checked) {
      if (linkedTextIdsForBubble(bubble).length) return;
      const text = defaultText({
        name: `${bubble.name}・文字`,
        x: bubble.x + bubble.w * 0.22,
        y: bubble.y + bubble.h * 0.15,
        w: bubble.w * 0.56,
        h: bubble.h * 0.7,
        autoFit: true,
        autoFitMaxSize: 56,
        align: "center",
        linkedBubbleId: bubble.id
      });
      applyAutoFit(text);
      bubble.linkedTextId = text.id;
      bubble.linkedTextIds = [text.id];
      state.objects.push(text);
    } else if (linkedTextIdsForBubble(bubble).length) {
      for (const id of linkedTextIdsForBubble(bubble)) {
        const text = objectById(id);
        if (text) text.linkedBubbleId = null;
      }
      bubble.linkedTextId = null;
      bubble.linkedTextIds = [];
    }
    commitMutation("調整文字聯動");
  }

  function applyMixedStyle() {
    const object = topSelectedObject();
    const input = $("#textContentInput");
    if (object?.kind !== "text") return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (start === end) {
      showToast("請先選取文字", "在內容欄位中反白一段文字，再套用混合樣式。", "error");
      input.focus();
      return;
    }
    object.styleRuns = (object.styleRuns || []).filter(run => run.end <= start || run.start >= end);
    object.styleRuns.push({
      start,
      end,
      color: $("#mixedColorInput").value,
      size: Number($("#mixedSizeInput").value),
      weight: Number($("#mixedWeightInput").value)
    });
    applyAutoFit(object);
    commitMutation("套用混合文字樣式");
    input.focus();
    input.setSelectionRange(start, end);
  }

  function clearMixedStyle() {
    const object = topSelectedObject();
    const input = $("#textContentInput");
    if (object?.kind !== "text") return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (start === end) object.styleRuns = [];
    else object.styleRuns = (object.styleRuns || []).filter(run => run.end <= start || run.start >= end);
    applyAutoFit(object);
    commitMutation("清除混合文字樣式");
  }

  function renameSelected() {
    const object = topSelectedObject();
    if (!object) return;
    const name = window.prompt("物件名稱", object.name);
    if (!name?.trim()) return;
    object.name = name.trim().slice(0, 80);
    commitMutation("重新命名物件");
  }

  function syncSelectionUI() {
    const objects = selectedObjects();
    const empty = $("#selectionEmpty");
    const textInspector = $("#textInspector");
    const bubbleInspector = $("#bubbleInspector");
    const multiInspector = $("#multiInspector");
    const commonInspector = $("#commonInspector");
    empty.hidden = objects.length > 0;
    textInspector.hidden = true;
    bubbleInspector.hidden = true;
    multiInspector.hidden = true;
    commonInspector.hidden = objects.length !== 1;
    if (objects.length > 1) {
      multiInspector.hidden = false;
      $("#multiSelectionCount").textContent = `${objects.length} 個物件`;
    }
    if (objects.length === 1) {
      const object = objects[0];
      if (object.kind === "text") { textInspector.hidden = false; syncTextInspector(object); }
      if (object.kind === "bubble") { bubbleInspector.hidden = false; syncBubbleInspector(object); }
      syncGeometryInspector(object);
    }
    renderLayers();
    updateActionButtons();
  }

  function syncTextInspector(object) {
    state.inspectorSyncing = true;
    $("#textObjectName").textContent = object.name;
    $("#textContentInput").value = object.text;
    $("#writingModeBadge").textContent = object.direction === "vertical" ? "縦書き" : "横書き";
    $("#toggleWritingModeButton").textContent = object.direction === "vertical" ? "切換橫排" : "切換直排";
    $("#lineGapLabel").textContent = object.direction === "vertical" ? "欄距" : "行距";
    populateFontSelect();
    if (![...$("#fontFamilyInput").options].some(option => option.value === object.fontFamily)) {
      const option = document.createElement("option");
      option.value = object.fontFamily;
      option.textContent = `⚠ ${object.fontFamily}（缺失）`;
      $("#fontFamilyInput").append(option);
    }
    $("#fontFamilyInput").value = object.fontFamily;
    $("#fontSizeInput").value = round(object.fontSize);
    $("#fontWeightInput").value = String(object.fontWeight);
    $("#letterSpacingInput").value = round(object.letterSpacing);
    $("#lineGapInput").value = round(object.lineGap);
    $("#textColorInput").value = normalizeColor(object.color, "#171717");
    $("#textStrokeColorInput").value = normalizeColor(object.stroke, "#ffffff");
    $("#textStrokeWidthInput").value = round(object.strokeWidth);
    $("#textShadowBlurInput").value = round(object.shadowBlur);
    $$('[data-value]', $("#textAlignGroup")).forEach(button => button.classList.toggle("active", button.dataset.value === object.align));
    syncAutoFitInspector(object);
    syncInspectorDecorations();
    state.inspectorSyncing = false;
  }

  function syncAutoFitInspector(object) {
    if (!object || object.kind !== "text") return;
    const enabled = Boolean(object.autoFit);
    $("#autoFitToggle").checked = enabled;
    $("#autoFitMinInput").value = round(object.autoFitMinSize ?? 12);
    $("#autoFitMaxInput").value = round(object.autoFitMaxSize ?? object.fontSize);
    $("#autoFitMinInput").disabled = !enabled;
    $("#autoFitMaxInput").disabled = !enabled;
    $("#autoFitLimits").classList.toggle("is-disabled", !enabled);
    $("#fontSizeInput").disabled = enabled;
    const status = $("#autoFitStatus");
    status.classList.remove("warning");
    if (!enabled) {
      status.textContent = "目前使用手動字級。";
      return;
    }
    const overflow = !textLayoutFits(object);
    status.textContent = overflow
      ? `已縮至最小 ${round(object.fontSize)} px；內容仍可能超出文字框。`
      : `目前配合字級：${round(object.fontSize)} px`;
    status.classList.toggle("warning", overflow);
  }

  function syncBubbleInspector(object) {
    state.inspectorSyncing = true;
    $("#bubbleObjectName").textContent = object.name;
    $("#linkTextToggle").checked = linkedTextIdsForBubble(object).length > 0;
    $("#bubbleFillInput").value = normalizeColor(object.fill, "#ffffff");
    $("#bubbleStrokeInput").value = normalizeColor(object.stroke, "#171717");
    $("#bubbleOpacityInput").value = round(object.opacity);
    $("#bubbleStrokeWidthInput").value = round(object.strokeWidth);
    $("#tailEnabledInput").checked = Boolean(object.tailEnabled);
    $("#tailXInput").value = round(object.tailX);
    $("#tailYInput").value = round(object.tailY);
    $("#tailWidthInput").value = round(object.tailWidth);
    const isAsset = object.shape === "asset";
    $("#bubblePaintFields").classList.toggle("is-disabled", isAsset);
    $("#bubbleStrokeWidthField").classList.toggle("is-disabled", isAsset);
    $("#tailInspectorSection").classList.toggle("is-disabled", isAsset || !object.tailEnabled);
    syncInspectorDecorations();
    state.inspectorSyncing = false;
  }

  function syncGeometryInspector(object) {
    state.inspectorSyncing = true;
    $("#objectXInput").value = round(object.x);
    $("#objectYInput").value = round(object.y);
    $("#objectWInput").value = round(object.w);
    $("#objectHInput").value = round(object.h);
    $("#objectRotationInput").value = round(object.rotation);
    $("#objectRotationRange").value = round(object.rotation);
    state.inspectorSyncing = false;
  }

  function syncInspectorGeometryOnly() {
    const object = topSelectedObject();
    if (object && selectedObjects().length === 1) {
      syncGeometryInspector(object);
      if (object.kind === "text") syncAutoFitInspector(object);
      if (object.kind === "bubble") {
        state.inspectorSyncing = true;
        $("#tailXInput").value = round(object.tailX);
        $("#tailYInput").value = round(object.tailY);
        state.inspectorSyncing = false;
      }
    }
  }

  function syncInspectorDecorations() {
    const object = topSelectedObject();
    if (!object) return;
    if (object.kind === "text") {
      $("#textColorCode").textContent = (object.color || "#171717").toUpperCase();
      $("#textStrokeColorCode").textContent = (object.stroke || "#ffffff").toUpperCase();
    } else {
      $("#bubbleFillCode").textContent = (object.fill || "#ffffff").toUpperCase();
      $("#bubbleStrokeCode").textContent = (object.stroke || "#171717").toUpperCase();
    }
  }

  function normalizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
  }

  function round(value) { return Math.round((Number(value) || 0) * 10) / 10; }

  function renderLayers() {
    $("#layerCount").textContent = String(state.objects.length);
    const rows = [...state.objects].reverse().map(object => {
      const row = document.createElement("div");
      row.className = `layer-row${state.selected.has(object.id) ? " selected" : ""}${!object.visible ? " hidden-layer" : ""}`;
      row.dataset.id = object.id;
      const thumbnail = document.createElement("span");
      thumbnail.className = `layer-thumbnail${object.kind === "bubble" ? " bubble-thumbnail" : ""}`;
      thumbnail.textContent = object.kind === "text" ? (object.direction === "vertical" ? "縦" : "T") : object.shape === "focus" ? "✺" : "○";
      const copy = document.createElement("div");
      const name = document.createElement("b");
      name.textContent = object.name;
      const meta = document.createElement("small");
      const linked = object.linkedTextId || object.linkedBubbleId ? " · 已聯動" : "";
      meta.textContent = `${object.kind === "text" ? "文字" : "氣泡"}${object.groupId ? " · 群組" : ""}${linked}`;
      copy.append(name, meta);
      const visible = document.createElement("button");
      visible.className = "layer-action";
      visible.type = "button";
      visible.textContent = object.visible ? "●" : "○";
      visible.title = object.visible ? "隱藏圖層" : "顯示圖層";
      visible.addEventListener("click", event => {
        event.stopPropagation();
        object.visible = !object.visible;
        if (!object.visible) state.selected.delete(object.id);
        commitMutation(object.visible ? "顯示圖層" : "隱藏圖層");
      });
      const locked = document.createElement("button");
      locked.className = "layer-action";
      locked.type = "button";
      locked.textContent = object.locked ? "◆" : "◇";
      locked.title = object.locked ? "解鎖圖層" : "鎖定圖層";
      locked.addEventListener("click", event => {
        event.stopPropagation();
        object.locked = !object.locked;
        commitMutation(object.locked ? "鎖定圖層" : "解鎖圖層");
      });
      row.addEventListener("click", event => {
        if (event.shiftKey) {
          if (state.selected.has(object.id)) state.selected.delete(object.id); else state.selected.add(object.id);
          syncSelectionUI();
          requestRender();
        } else selectOnly(object.id);
      });
      row.append(thumbnail, copy, visible, locked);
      return row;
    });
    $("#layerList").replaceChildren(...rows);
  }

  function updateActionButtons() {
    const count = state.selected.size;
    $("#duplicateButton").disabled = count === 0;
    $("#deleteButton").disabled = count === 0;
    $("#groupButton").disabled = count < 2;
    $("#ungroupButton").disabled = !selectedObjects().some(object => object.groupId);
  }

  function scheduleHistory() {
    clearTimeout(state.historyTimer);
    state.historyTimer = setTimeout(() => {
      state.historyTimer = null;
      pushHistory();
      syncSelectionUI();
    }, 350);
  }

  function flushScheduledHistory() {
    if (!state.historyTimer) return;
    clearTimeout(state.historyTimer);
    state.historyTimer = null;
    pushHistory();
    syncSelectionUI();
  }

  function historySnapshot() {
    return JSON.stringify({ objects: state.objects });
  }

  function resetHistory() {
    clearTimeout(state.historyTimer);
    state.historyTimer = null;
    state.history = [historySnapshot()];
    state.historyIndex = 0;
    updateUndoRedo();
  }

  function pushHistory() {
    const snapshot = historySnapshot();
    if (state.history[state.historyIndex] === snapshot) return;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snapshot);
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    state.historyIndex = state.history.length - 1;
    updateUndoRedo();
  }

  function commitMutation(label = "變更") {
    clearTimeout(state.historyTimer);
    state.historyTimer = null;
    if (!state.history.length) resetHistory(); else pushHistory();
    setDocumentStatus(true);
    syncSelectionUI();
    requestRender();
  }

  function undo() {
    flushScheduledHistory();
    if (state.historyIndex <= 0) return;
    state.historyIndex -= 1;
    restoreHistorySnapshot(state.history[state.historyIndex]);
  }

  function redo() {
    flushScheduledHistory();
    if (state.historyIndex >= state.history.length - 1) return;
    state.historyIndex += 1;
    restoreHistorySnapshot(state.history[state.historyIndex]);
  }

  function restoreHistorySnapshot(snapshot) {
    const parsed = JSON.parse(snapshot);
    state.objects = parsed.objects || [];
    state.selected = new Set([...state.selected].filter(id => objectById(id)));
    setDocumentStatus(true);
    syncSelectionUI();
    updateUndoRedo();
    requestRender();
  }

  function updateUndoRedo() {
    $("#undoButton").disabled = state.historyIndex <= 0;
    $("#redoButton").disabled = state.historyIndex < 0 || state.historyIndex >= state.history.length - 1;
  }

  function setDocumentStatus(dirty, visual = null) {
    state.dirty = dirty;
    $("#documentName").textContent = state.documentName;
    const dot = $("#saveStatusDot");
    dot.className = "status-dot";
    if (visual === "saved" || (!dirty && visual !== "idle")) dot.classList.add("saved");
    if (dirty) dot.classList.add("dirty");
    dot.title = dirty ? "有未輸出的變更" : "目前狀態已輸出";
  }

  function toggleExportMenu() {
    const menu = $("#exportMenu");
    menu.hidden = !menu.hidden;
    $("#exportMenuButton").setAttribute("aria-expanded", String(!menu.hidden));
  }

  function closeExportMenu() {
    $("#exportMenu").hidden = true;
    $("#exportMenuButton").setAttribute("aria-expanded", "false");
  }

  async function exportByMode(mode) {
    closeExportMenu();
    if (!state.background && !state.objects.length) {
      showToast("沒有可輸出的作品", "請先開啟來源圖片或建立測試畫布。", "error");
      return;
    }
    const missing = await findMissingFonts();
    if (missing.length) {
      showToast("輸出已阻止：字體缺失", `請安裝或嵌入：${missing.join("、")}`, "error", 8000);
      return;
    }
    showProgress("正在建立輸出", mode === "both" ? "產生 PNG 與可編輯專案…" : "保持完整畫布尺寸與圖層狀態…");
    try {
      if (mode === "png") await exportPNG();
      if (mode === "project") exportProject();
      if (mode === "both") {
        await exportPNG();
        await new Promise(resolve => setTimeout(resolve, 180));
        exportProject();
      }
      setDocumentStatus(false, "saved");
      showToast("輸出完成", mode === "both" ? "PNG 與可編輯專案已下載。" : mode === "png" ? "原尺寸 PNG 已下載。" : "可編輯專案已下載。", "success");
    } catch (error) {
      console.error(error);
      showToast("輸出失敗", error.message || "瀏覽器未能建立下載檔案。", "error");
    } finally {
      hideProgress();
    }
  }

  async function findMissingFonts() {
    await document.fonts.ready;
    const fonts = [...new Set(state.objects.filter(object => object.kind === "text").map(object => object.fontFamily))];
    return fonts.filter(font => {
      if (["serif", "sans-serif", "monospace"].includes(font)) return false;
      return !document.fonts.check(`16px ${JSON.stringify(font)}`, "漫画あア漢字");
    });
  }

  async function exportPNG() {
    const output = document.createElement("canvas");
    output.width = state.width;
    output.height = state.height;
    const outputContext = output.getContext("2d", { alpha: false });
    drawScene(outputContext, { selection: false, exportMode: true });
    const blob = await new Promise((resolve, reject) => output.toBlob(result => result ? resolve(result) : reject(new Error("PNG 編碼失敗")), "image/png"));
    downloadBlob(blob, `${safeFileName(state.documentName)}.png`);
  }

  function exportProject() {
    const payload = {
      kind: PROJECT_KIND,
      version: APP_VERSION,
      createdWith: "Glyph Atelier 3",
      savedAt: new Date().toISOString(),
      document: { name: state.documentName },
      canvas: { width: state.width, height: state.height, backgroundColor: state.backgroundColor },
      source: { name: state.backgroundName, dataURL: state.backgroundData },
      assets: state.bubbleAssets,
      fonts: state.fonts,
      objects: state.objects
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `${safeFileName(state.documentName)}.glyph.json`);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function safeFileName(name) {
    return (name || "glyph-atelier").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/[. ]+$/, "").slice(0, 120) || "glyph-atelier";
  }

  function showProgress(title, message) {
    $("#progressTitle").textContent = title;
    $("#progressMessage").textContent = message;
    $("#progressModal").hidden = false;
  }

  function hideProgress() { $("#progressModal").hidden = true; }

  function showToast(title, message, type = "info", duration = 3600) {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icon = document.createElement("span");
    icon.textContent = type === "error" ? "!" : type === "success" ? "✓" : "i";
    const heading = document.createElement("b");
    heading.textContent = title;
    const copy = document.createElement("small");
    copy.textContent = message;
    toast.append(icon, heading, copy);
    $("#toastRegion").append(toast);
    setTimeout(() => toast.remove(), duration);
  }

  init();
})();
