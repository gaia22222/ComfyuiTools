"""ToolHub media API: loopback locally, password protected in cloud mode."""
import argparse
import hmac
import json
import math
import mimetypes
import os
from pathlib import Path
import re
import secrets
import signal
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlsplit, urlunsplit

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
sys.path.insert(0, str(BASE / "vendor"))
try:
    import yt_dlp
except ImportError:
    yt_dlp = None

PLATFORMS = {
    "youtube.com": "YouTube", "youtu.be": "YouTube", "tiktok.com": "TikTok",
    "facebook.com": "Facebook", "fb.watch": "Facebook", "instagram.com": "Instagram",
    "twitter.com": "X", "x.com": "X",
}
TERMINAL = {"completed", "failed", "cancelled"}


def validate_url(value):
    value = str(value).strip()
    if len(value) > 2048:
        raise ValueError("連結太長，請貼上單一影片網址。")
    if not re.match(r"^https?://", value, re.I):
        value = "https://" + value
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower()
    platform = next((name for domain, name in PLATFORMS.items()
                     if host == domain or host.endswith("." + domain)), None)
    if not platform or parsed.username or parsed.password or parsed.port not in (None, 80, 443):
        raise ValueError("請使用 YouTube、TikTok、Facebook、Instagram 或 X 的影片連結。")
    if not parsed.path or parsed.path == "/":
        raise ValueError("請貼上影片頁面的連結，不能使用平台首頁。")
    if platform == "YouTube":
        query = parse_qs(parsed.query)
        video_id = query.get("v", [""])[0]
        if host.endswith("youtu.be"):
            video_id = parsed.path.strip("/").split("/")[0]
        elif parsed.path.startswith(("/shorts/", "/embed/", "/live/")):
            video_id = parsed.path.strip("/").split("/")[1]
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            raise ValueError("請貼上單一 YouTube 影片或 Shorts 連結。")
        return "https://www.youtube.com/watch?v=" + video_id, platform
    return urlunsplit(("https", host, parsed.path, parsed.query, "")), platform


def parse_time(value):
    if value in (None, ""):
        return None
    parts = str(value).strip().split(":")
    if len(parts) > 3 or any(not re.fullmatch(r"\d+(?:\.\d+)?", p) for p in parts):
        raise ValueError("時間請使用秒數、MM:SS 或 HH:MM:SS。")
    number = 0.0
    for part in parts:
        number = number * 60 + float(part)
    if not math.isfinite(number) or number < 0:
        raise ValueError("時間必須是有效的正數。")
    return number


def readable_error(error):
    message = re.sub(r"\x1b\[[0-9;]*m", "", str(error)).replace("ERROR: ", "")
    if any(word in message.lower() for word in ("sign in", "login", "cookies", "private", "members-only")):
        return "平台要求登入或驗證，這個公開下載模式無法處理此影片。請改用其他公開影片。"
    if any(word in message.lower() for word in ("403", "429", "bot")):
        return "平台暫時拒絕存取或限制請求，請稍後再試。"
    if any(word in message.lower() for word in ("unavailable", "removed", "not available")):
        return "這個影片目前無法存取，可能已下架、限制地區或不是公開影片。請改用其他連結。"
    if any(word in message.lower() for word in ("getaddrinfo", "unable to download", "timed out")):
        return "無法連線至影片平台，請確認網路後重試。"
    return message[-700:] or "處理失敗，請重新解析影片後再試。"


def subtitle_text(content):
    lines = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.isdigit() or "-->" in line or line.startswith(("WEBVTT", "Kind:", "Language:", "NOTE", "STYLE")):
            continue
        text = re.sub(r"<[^>]+>", "", line)
        if text and (not lines or lines[-1] != text):
            lines.append(text)
    return "\n".join(lines) + "\n"


class MediaService:
    def __init__(self, port, cloud=False):
        self.port = port
        self.cloud = cloud
        self.password = os.environ.get("MEDIA_PASSWORD", "").encode("utf-8") if cloud else b""
        if cloud and len(os.environ.get("MEDIA_PASSWORD", "")) < 16:
            raise ValueError("Set MEDIA_PASSWORD to a password of at least 16 characters before cloud deployment.")
        self.public_url = os.environ.get("MEDIA_PUBLIC_URL") or os.environ.get("RENDER_EXTERNAL_URL", "")
        if cloud and not self.public_url:
            raise ValueError("Set MEDIA_PUBLIC_URL to the public HTTPS service URL.")
        public = urlsplit(self.public_url)
        if cloud and ((public.scheme != "https" and not (public.scheme == "http" and public.hostname in ("localhost", "127.0.0.1")))
                      or not public.hostname or public.username or public.password or public.path not in ("", "/") or public.query or public.fragment):
            raise ValueError("MEDIA_PUBLIC_URL must be a root HTTPS URL (HTTP is allowed only for loopback tests).")
        self.allowed_origins = {self.public_url.rstrip("/"), "https://gaia22222.github.io"}
        self.login_attempts = []
        self.max_height = int(os.environ.get("MEDIA_MAX_HEIGHT", "1080")) if cloud else None
        self.max_duration = int(os.environ.get("MEDIA_MAX_DURATION", "1800")) if cloud else None
        self.max_bytes = int(os.environ.get("MEDIA_MAX_DOWNLOAD_MB", "200")) * 1024 * 1024 if cloud else None
        self.max_seconds = int(os.environ.get("MEDIA_JOB_TIMEOUT", "900")) if cloud else None
        self.retention = int(os.environ.get("MEDIA_RETENTION_SECONDS", "3600")) if cloud else None
        self.token = secrets.token_urlsafe(32)
        self.ffmpeg = shutil.which("ffmpeg") or self.find_binary("ffmpeg")
        self.node = shutil.which("node")
        self.cache = {}
        self.jobs = {}
        self.processes = {}
        self.lock = threading.RLock()
        self.workers = ThreadPoolExecutor(max_workers=1 if cloud else 2)
        self.data = BASE / ".data"
        self.downloads = BASE / "downloads"
        self.data.mkdir(exist_ok=True)
        self.downloads.mkdir(exist_ok=True)
        self.history = self.data / "history.json"
        if self.history.exists():
            self.jobs = json.loads(self.history.read_text(encoding="utf-8"))
            for job in self.jobs.values():
                if job["status"] not in TERMINAL:
                    job.update(status="failed", error="下載服務已重新啟動，請重新加入下載。")

    def login(self, password):
        with self.lock:
            now = time.time()
            self.login_attempts = [t for t in self.login_attempts if now - t < 60]
            if len(self.login_attempts) >= 5:
                return False, True
            if hmac.compare_digest(str(password).encode("utf-8"), self.password):
                self.login_attempts.clear()
                return True, False
            self.login_attempts.append(now)
            return False, False

    def cleanup(self):
        if not self.cloud:
            return
        with self.lock:
            expired = [j for j in self.jobs.values() if j["status"] in TERMINAL
                       and time.time() - j.get("finished", j["created"]) > self.retention]
            for job in expired:
                path = (self.downloads / job["id"]).resolve()
                if re.fullmatch(r"[a-f0-9]{24}", job["id"]) and path.is_relative_to(self.downloads.resolve()) and path.is_dir():
                    shutil.rmtree(path)
                self.jobs.pop(job["id"], None)
            if expired:
                self.save()

    def find_binary(self, name):
        candidates = [BASE / "bin" / (name + ".exe"), Path(sys.executable).parent / "Library" / "bin" / (name + ".exe")]
        return next((str(p) for p in candidates if p.exists()), None)

    def save(self):
        with self.lock:
            temporary = self.history.with_suffix(".tmp")
            temporary.write_text(json.dumps(self.jobs, ensure_ascii=False), encoding="utf-8")
            temporary.replace(self.history)

    def options(self):
        options = {"quiet": True, "no_warnings": True, "noplaylist": True, "socket_timeout": 20,
                   "retries": 1, "cachedir": False, "skip_download": True}
        if self.node:
            options["js_runtimes"] = {"node": {"path": self.node}}
        return options

    def inspect(self, value):
        if not yt_dlp:
            raise ValueError("尚未安裝 yt-dlp，請執行 Start-VideoDownloader.cmd。")
        url, platform = validate_url(value)
        with yt_dlp.YoutubeDL(self.options()) as downloader:
            info = downloader.extract_info(url, download=False)
        if not info or info.get("_type") in ("playlist", "multi_video"):
            raise ValueError("請使用單一影片連結，暫不處理播放清單或多項貼文。")
        if info.get("is_live") or info.get("live_status") == "is_live":
            raise ValueError("影片正在直播，請等待直播結束後再試。")
        formats = [f for f in info.get("formats", []) if not f.get("has_drm")]
        heights = sorted({int(f["height"]) for f in formats if f.get("height") and f.get("vcodec") not in (None, "none")}, reverse=True)
        if self.cloud:
            heights = [h for h in heights if h <= self.max_height]
        has_audio = any(f.get("acodec") not in (None, "none") for f in formats)
        subtitles = []
        for source, key in (("manual", "subtitles"), ("auto", "automatic_captions")):
            for lang, tracks in info.get(key, {}).items():
                if any(t.get("ext") in ("vtt", "srt") for t in tracks):
                    subtitles.append({"language": lang, "source": source,
                                      "name": next((t.get("name") for t in tracks if t.get("name")), lang)})
        token = secrets.token_hex(16)
        summary = {"token": token, "url": url, "platform": platform, "title": info.get("title") or info.get("id"),
                   "author": info.get("uploader") or info.get("channel") or "", "duration": info.get("duration"),
                   "thumbnail": info.get("thumbnail"), "heights": heights, "has_audio": has_audio,
                   "subtitles": subtitles, "has_thumbnail": bool(info.get("thumbnail"))}
        with self.lock:
            self.cache = {k: v for k, v in self.cache.items() if time.time() - v["created"] < 3600}
            if len(self.cache) >= 40:
                self.cache.pop(next(iter(self.cache)))
            self.cache[token] = {"summary": summary, "created": time.time()}
        return summary

    def search(self, query):
        if not yt_dlp:
            raise ValueError("尚未安裝 yt-dlp，請先啟動本地服務。")
        if not query.strip() or len(query) > 150:
            raise ValueError("請輸入 1 至 150 個字的關鍵字。")
        with yt_dlp.YoutubeDL({**self.options(), "extract_flat": True}) as downloader:
            info = downloader.extract_info("ytsearch5:" + query, download=False)
        return [{"url": e.get("url"), "title": e.get("title"), "author": e.get("uploader") or e.get("channel") or "",
                 "duration": e.get("duration"), "thumbnail": (e.get("thumbnails") or [{}])[-1].get("url")}
                for e in info.get("entries", []) if e and e.get("url")]

    def create_job(self, body):
        self.cleanup()
        with self.lock:
            entry = self.cache.get(body.get("token"))
            if not entry or time.time() - entry["created"] > 3600:
                raise ValueError("影片資料已過期，請重新解析連結。")
            media = entry["summary"]
            kind = body.get("kind")
            if kind not in ("mp4", "mp3", "thumbnail", "subtitle"):
                raise ValueError("不支援的下載格式。")
            if not self.ffmpeg:
                raise ValueError("找不到 FFmpeg，請安裝或放到 video-downloader/bin。")
            height = body.get("height", "best")
            if kind == "mp4" and height != "best" and height not in media["heights"]:
                raise ValueError("此畫質不存在，請選擇影片可用的畫質。")
            if kind == "mp4" and not media["heights"]:
                raise ValueError("影片沒有可下載的視訊。")
            if kind == "mp3" and not media["has_audio"]:
                raise ValueError("影片沒有可下載的音訊。")
            if self.cloud and kind in ("mp4", "mp3") and (not media["duration"] or media["duration"] > self.max_duration):
                raise ValueError(f"雲端模式只接受長度已知且不超過 {self.max_duration // 60} 分鐘的影片。")
            bitrate = body.get("bitrate", 192)
            if bitrate not in (128, 192, 256, 320):
                raise ValueError("不支援的 MP3 音質。")
            sub_format = body.get("subtitle_format", "srt")
            if sub_format not in ("srt", "vtt", "txt"):
                raise ValueError("不支援的字幕格式。")
            lang, source = body.get("language"), body.get("subtitle_source")
            if kind == "subtitle" and not any(s["language"] == lang and s["source"] == source for s in media["subtitles"]):
                raise ValueError("找不到所選字幕，請重新選擇語言。")
            if kind == "thumbnail" and not media["has_thumbnail"]:
                raise ValueError("影片沒有封面。")
            start, end = parse_time(body.get("start")), parse_time(body.get("end"))
            if start is not None or end is not None:
                if kind not in ("mp4", "mp3") or start is None or end is None or end <= start:
                    raise ValueError("請填寫完整的開始與結束時間，結束時間必須較晚。")
                if media["duration"] and end > media["duration"]:
                    raise ValueError("結束時間超過影片長度。")
            if sum(j["status"] not in TERMINAL for j in self.jobs.values()) >= (5 if self.cloud else 20):
                raise ValueError("下載佇列已滿，請等待部分工作完成。")
            if self.cloud:
                used = sum(p.stat().st_size for p in self.downloads.glob("*/*") if p.is_file())
                reserved = self.max_bytes * (1 + sum(j["status"] not in TERMINAL for j in self.jobs.values()))
                if used + reserved > 1024 * 1024 * 1024:
                    raise ValueError("雲端暫存空間不足，請儲存已完成檔案並等待逾時清理。")
            job_id = secrets.token_hex(12)
            job = {"id": job_id, "title": media["title"], "url": media["url"], "kind": kind,
                   "height": height, "bitrate": bitrate, "language": lang, "subtitle_source": source,
                   "subtitle_format": sub_format, "start": start, "end": end, "created": time.time(),
                   "status": "queued", "progress": 0, "speed": None, "eta": None, "error": "", "files": []}
            self.jobs[job_id] = job
            self.save()
            self.workers.submit(self.run_job, job_id)
            return dict(job)

    def command(self, job, directory):
        command = [sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-plugin-dirs", "--no-playlist",
                   "--no-cache-dir", "--socket-timeout", "20", "--retries", "2", "--fragment-retries", "2",
                   "--windows-filenames", "--trim-filenames", "140", "--ffmpeg-location", self.ffmpeg,
                   "--newline", "--progress", "--progress-template", "download:__PROGRESS__%(progress)j",
                   "-o", str(directory / "%(title).100B [%(id)s].%(ext)s")]
        if self.node:
            command += ["--js-runtimes", "node:" + self.node]
        if self.cloud:
            command += ["--max-filesize", str(self.max_bytes)]
        if job["kind"] == "mp4":
            height = self.max_height if self.cloud and job["height"] == "best" else job["height"]
            limit = "" if height == "best" else "[height<=" + str(height) + "]"
            command += ["-f", f"bv{limit}+ba/b{limit}/bv{limit}", "--merge-output-format", "mp4", "--recode-video", "mp4"]
        elif job["kind"] == "mp3":
            command += ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", str(job["bitrate"]) + "K"]
        elif job["kind"] == "thumbnail":
            command += ["--skip-download", "--write-thumbnail", "--convert-thumbnails", "jpg"]
        else:
            command += ["--skip-download", "--write-auto-subs" if job["subtitle_source"] == "auto" else "--write-subs",
                        "--sub-langs", "^" + re.escape(job["language"]) + "$", "--sub-format", "vtt/srt",
                        "--convert-subs", "srt" if job["subtitle_format"] == "txt" else job["subtitle_format"]]
        if job["start"] is not None:
            command += ["--download-sections", f"*{job['start']}-{job['end']}", "--force-keyframes-at-cuts"]
        return command + ["--", job["url"]]

    def run_job(self, job_id):
        with self.lock:
            job = self.jobs[job_id]
            if job["status"] == "cancelled":
                return
            job["status"] = "downloading"
            directory = self.downloads / job_id
            directory.mkdir(exist_ok=True)
            environment = dict(os.environ, PYTHONPATH=str(BASE / "vendor"), PYTHONIOENCODING="utf-8")
        errors = []
        stopped = threading.Event()
        try:
            with self.lock:
                if job["status"] == "cancelled":
                    return
                process = subprocess.Popen(self.command(job, directory), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                           text=True, encoding="utf-8", errors="replace", env=environment,
                                           start_new_session=os.name != "nt",
                                           creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                self.processes[job_id] = process
                if self.cloud:
                    threading.Thread(target=self.watch_job, args=(job_id, directory, stopped), daemon=True).start()
            for line in process.stdout:
                if line.startswith("__PROGRESS__"):
                    progress = json.loads(line[len("__PROGRESS__"):])
                    with self.lock:
                        total = progress.get("total_bytes") or progress.get("total_bytes_estimate")
                        job["progress"] = min(99, round(100 * progress.get("downloaded_bytes", 0) / total)) if total else None
                        job["speed"], job["eta"] = progress.get("speed"), progress.get("eta")
                        if progress.get("status") == "downloading" and job["status"] != "cancelled":
                            job["status"] = "downloading"
                        if progress.get("status") == "finished":
                            job["status"] = "processing" if job["status"] != "cancelled" else "cancelled"
                elif "ERROR:" in line:
                    errors.append(line.strip())
                elif any(mark in line for mark in ("[Merger]", "[ExtractAudio]", "[VideoConvertor]", "[download] Downloading 1 time ranges")):
                    with self.lock:
                        if job["status"] != "cancelled":
                            job["status"] = "processing"
            code = process.wait()
            with self.lock:
                if job["status"] == "cancelled":
                    return
                if code:
                    job.update(status="failed", error=job["error"] or readable_error("\n".join(errors)))
                    return
                extension = {"mp4": ".mp4", "mp3": ".mp3", "thumbnail": ".jpg", "subtitle": "." + job["subtitle_format"]}[job["kind"]]
                if job["kind"] == "subtitle" and extension == ".txt":
                    for subtitle in directory.glob("*.srt"):
                        subtitle.with_suffix(".txt").write_text(subtitle_text(subtitle.read_text(encoding="utf-8-sig")), encoding="utf-8")
                files = [p for p in directory.iterdir() if p.is_file() and p.suffix == extension]
                if not files:
                    job.update(status="failed", error="平台未產生所選檔案。請重新解析或選擇其他格式。")
                    return
                job.update(status="completed", progress=100, eta=0, speed=None,
                           files=[{"name": p.name, "size": p.stat().st_size} for p in files])
        except (OSError, ValueError) as error:
            with self.lock:
                if job["status"] != "cancelled":
                    job.update(status="failed", error=readable_error(error))
        finally:
            stopped.set()
            with self.lock:
                self.processes.pop(job_id, None)
                job["finished"] = time.time()
                self.save()

    def stop_process(self, process):
        if process.poll() is not None:
            return
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True,
                           creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
        else:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    def watch_job(self, job_id, directory, stopped):
        started = time.monotonic()
        while not stopped.wait(2):
            try:
                size = sum(p.stat().st_size for p in directory.iterdir() if p.is_file())
            except FileNotFoundError:
                continue
            error = "檔案超過雲端暫存容量，請選擇較低畫質或較短影片。" if size > self.max_bytes else ""
            if time.monotonic() - started > self.max_seconds:
                error = "超過雲端處理時間上限，請選擇較短影片或稍後再試。"
            if error:
                with self.lock:
                    job = self.jobs[job_id]
                    process = self.processes.get(job_id)
                    if process and job["status"] not in TERMINAL:
                        job["error"] = error
                        self.stop_process(process)
                return

    def cancel(self, job_id):
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                raise ValueError("找不到下載工作。")
            if job["status"] in TERMINAL:
                return
            job["status"] = "cancelled"
            job["finished"] = time.time()
            process = self.processes.get(job_id)
            if process and process.poll() is None:
                self.stop_process(process)
            self.save()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_):
        pass

    def trusted(self):
        host = self.headers.get("Host", "")
        media = self.server.media
        origin = self.headers.get("Origin")
        if media.cloud:
            return host == urlsplit(media.public_url).netloc and (not origin or origin in media.allowed_origins)
        if host not in (f"127.0.0.1:{self.server.media.port}", f"localhost:{self.server.media.port}"):
            return False
        return not origin or origin in ("http://" + host, "https://gaia22222.github.io") or re.fullmatch(r"http://(?:localhost|127\.0\.0\.1):\d+", origin)

    def end_headers(self):
        origin = self.headers.get("Origin")
        if origin and self.trusted():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-ToolHub-Token")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def authenticated(self):
        return self.trusted() and hmac.compare_digest(self.headers.get("X-ToolHub-Token", ""), self.server.media.token)

    def do_OPTIONS(self):
        self.json({}, 200 if self.trusted() else 403)

    def do_GET(self):
        parsed = urlsplit(self.path)
        media = self.server.media
        if not self.trusted():
            return self.json({"error": "不允許的來源。"}, 403)
        if parsed.path == "/api/health":
            authenticated = self.authenticated()
            ready = bool(yt_dlp and media.ffmpeg and media.node)
            return self.json({"service": "toolhub-media", "token": media.token if not media.cloud or authenticated else None,
                              "mode": "cloud" if media.cloud else "local", "requires_login": media.cloud and not authenticated,
                              "ready": ready,
                              "limits": {"height": media.max_height, "duration": media.max_duration,
                                         "download_mb": media.max_bytes // 1024 // 1024 if media.cloud else None,
                                         "retention": media.retention},
                              "yt_dlp": yt_dlp.version.__version__ if yt_dlp else None,
                              "ffmpeg": bool(media.ffmpeg), "node": bool(media.node)}, 503 if media.cloud and not ready else 200)
        if parsed.path == "/api/jobs":
            if not self.authenticated():
                return self.json({"error": "請先登入或重新連線至下載服務。"}, 403)
            media.cleanup()
            with media.lock:
                return self.json({"jobs": sorted(media.jobs.values(), key=lambda j: j["created"], reverse=True)})
        if parsed.path.startswith("/api/files/"):
            parts = parsed.path.split("/")
            token = parse_qs(parsed.query).get("token", [""])[0]
            if not hmac.compare_digest(token, media.token) or len(parts) != 5:
                return self.json({"error": "無效的檔案連結。"}, 403)
            job = media.jobs.get(parts[3])
            name = unquote(parts[4])
            if not job or job["status"] != "completed" or name not in [f["name"] for f in job["files"]]:
                return self.json({"error": "找不到已完成的檔案。"}, 404)
            path = (media.downloads / job["id"] / name).resolve()
            if not path.is_relative_to(media.downloads.resolve()) or not path.is_file():
                return self.json({"error": "檔案已移動或刪除。"}, 404)
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(path.stat().st_size))
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + quote(name))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with path.open("rb") as file:
                shutil.copyfileobj(file, self.wfile)
            return
        if parsed.path.startswith("/api/"):
            return self.json({"error": "找不到此 API。"}, 404)
        if media.cloud and parsed.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/VideoDownloader.html")
            self.end_headers()
            return
        path = Path(self.translate_path(parsed.path)).resolve()
        if not path.is_relative_to(ROOT):
            return self.send_error(404)
        relative = path.relative_to(ROOT)
        if any(p.startswith(".") or p in ("vendor", "downloads", "bin", "node_modules") for p in relative.parts) or path.suffix.lower() not in ("", ".html", ".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".woff2", ".ttf", ".otf", ".json", ".txt"):
            return self.send_error(404)
        if path.is_dir() and not (path / "index.html").exists():
            return self.send_error(404)
        return super().do_GET()

    def do_POST(self):
        media = self.server.media
        path = urlsplit(self.path).path
        login = path == "/api/login" and media.cloud
        if not self.trusted() or (not login and not self.authenticated()):
            return self.json({"error": "請先登入或重新連線至下載服務。"}, 403)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 8192:
                raise ValueError("請求大小不正確。")
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError("請求格式不正確。")
            if login:
                accepted, limited = media.login(body.get("password", ""))
                if not accepted:
                    return self.json({"error": "嘗試次數過多，請等候一分鐘再試。" if limited else "密碼不正確。"}, 429 if limited else 401)
                return self.json({"token": media.token})
            if path == "/api/inspect":
                return self.json(media.inspect(body.get("url", "")))
            if path == "/api/search":
                return self.json({"results": media.search(str(body.get("query", "")))})
            if path == "/api/jobs":
                return self.json(media.create_job(body), 202)
            if re.fullmatch(r"/api/jobs/[a-f0-9]{24}/cancel", path):
                media.cancel(path.split("/")[3])
                return self.json({"ok": True})
            return self.json({"error": "找不到此 API。"}, 404)
        except (ValueError, OSError) as error:
            return self.json({"error": readable_error(error)}, 400)
        except yt_dlp.utils.DownloadError as error:
            return self.json({"error": readable_error(error)}, 422)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8910")))
    parser.add_argument("--cloud", action="store_true", default=os.environ.get("MEDIA_MODE") == "cloud")
    args = parser.parse_args()
    media = MediaService(args.port, cloud=args.cloud)
    server = ThreadingHTTPServer(("0.0.0.0" if args.cloud else "127.0.0.1", args.port), Handler)
    server.media = media
    print(f"ToolHub: {media.public_url if args.cloud else 'http://127.0.0.1:' + str(args.port)}/VideoDownloader.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        for job in list(server.media.jobs.values()):
            if job["status"] not in TERMINAL:
                server.media.cancel(job["id"])
        server.media.workers.shutdown(wait=False, cancel_futures=True)
        server.server_close()


if __name__ == "__main__":
    main()
