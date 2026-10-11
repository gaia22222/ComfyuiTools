# ToolHub 影音下載器

## 私人雲端模式（開網頁直接使用）

本工具已有 Docker 及 Render Free 部署設定，不需要使用者啟動本地服務。按 [DEPLOY.md](DEPLOY.md) 連接 GitHub、設定服務密碼並部署。密碼保護下載 API、歷史紀錄和完成檔案；雲端工具直接開啟即可連線，GitHub Pages 入口在服務設定填入雲端 HTTPS 網址。

首次部署需要你的 Render 帳戶。推送 Git 只會發布前端及部署原始碼，並不會自行建立雲端主機。免費試用的休眠、暫存及平台存取限制請看部署文件。

## 本地模式（可選）

雙擊工具根目錄的 `Start-VideoDownloader.cmd`。保持終端視窗開啟，瀏覽 `http://127.0.0.1:8910/index.html`，從「管理及上架工具」進入影音下載器；獨立頁面是 `/VideoDownloader.html`。

需要 Python 3.10+、FFmpeg / FFprobe 和 Node.js 22+。第一次啟動會把 `yt-dlp[default]` 安裝在本工具的 `vendor`，不會修改 ComfyUI 的套件。FFmpeg 可放在 `bin` 或 PATH；也會查找 Python 同目錄的 `Library/bin`。

支援公開單一 YouTube、TikTok、Facebook、Instagram、X 影片；實際可用性受平台限制影響。可搜尋 YouTube、選擇 MP4 畫質、轉 MP3、下載最大封面與人工／自動字幕（SRT、VTT、TXT），以及按時間裁切影音。服務最多同時處理兩個工作，佇列上限 20 個。正在直播、播放清單、私人、需登入及 DRM 內容不支援。

下載檔案位於 `downloads/<工作 ID>/`，歷史紀錄保存在 `.data/history.json`。檔案完成後按「儲存到裝置」另存副本。關閉頁面不會中斷下載；關閉服務會停止工作，重新啟動會保留歷史。裁切重新處理切點，高解析度或不相容編碼轉 MP4 可能較慢。MP3 位元率不代表原始音訊品質。

前端預設連線至所在網站的同源 API。從其他本地 HTTP 伺服器或 GitHub Pages 使用本地模式時，在服務設定填入 `http://127.0.0.1:8910`；瀏覽器可能要求允許存取本地網路。直接以 `file://` 開啟時，請改用 `http://127.0.0.1:8910/VideoDownloader.html`。GitHub Pages 本身無法執行 Python 或 FFmpeg，可以連接本地服務或已部署的私人雲端服務。

## 整合 API

1. `GET /api/health`：元件狀態；本地模式取得本次啟動的 token。雲端未登入只回傳 `requires_login: true`，不公開 token。雲端先呼叫 `POST /api/login`，`{"password":"服務密碼"}`，取得 token；失敗五次後等候一分鐘。
2. 其餘 API 帶 `X-ToolHub-Token` header；POST 使用 JSON。
3. `POST /api/inspect`，`{"url":"https://www.youtube.com/watch?v=..."}`：取得影片 token、畫質、字幕及資訊，有效一小時。
4. `POST /api/search`，`{"query":"..."}`：最多五個 YouTube 搜尋結果。
5. `POST /api/jobs`，`{"token":"影片 token","kind":"mp4","height":1080}`：加入下載。`kind` 支援 `mp4/mp3/thumbnail/subtitle`，`height` 可用 `best`；MP3 的 `bitrate` 支援 128/192/256/320。字幕傳 `language`、`subtitle_source`（manual/auto）、`subtitle_format`（srt/vtt/txt）。裁切傳 `start`、`end`（秒數或時間字串）。
6. `GET /api/jobs`：工作進度、錯誤和已完成檔案。
7. `POST /api/jobs/<id>/cancel`，`{}`：取消等候或正在執行的工作。
8. `GET /api/files/<id>/<URL-encoded filename>?token=<服務 token>`：另存已完成檔案。

本地模式只監聽 `127.0.0.1`；雲端模式在容器內監聽 `0.0.0.0`，對外由主機提供 HTTPS。兩種模式都驗證 Host / Origin 與隨機 token，不執行輸入的 shell 命令、不讀取瀏覽器登入 cookie。下載僅在使用者操作時發生。雲端模式目前供單一擁有者使用密碼登入，不提供匿名公開下載。

更新解析器（在工具根目錄）：

```powershell
python -m pip install --upgrade --target video-downloader/vendor -r video-downloader/requirements.txt
```

更新後重新啟動服務。只保存你擁有或已獲授權下載的內容。

功能流程參考：https://vd6s.net/zh-tw4/

下載引擎與文件：https://github.com/yt-dlp/yt-dlp
