# 部署私人雲端影音工具

使用者不需要 Python、FFmpeg、Node.js 或本地服務。這些元件由 Docker 雲端服務執行。GitHub Pages 保留 ToolHub 入口，Render 執行下載後端及獨立工具頁。

## 第一次部署

[開啟這個 repository 的 Render 部署頁](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fgaia22222%2FComfyuiTools)

1. 註冊／登入 [Render](https://dashboard.render.com/)，連接你的 GitHub 帳戶。
2. 選 **New → Blueprint**，選 `gaia22222/ComfyuiTools` 的 `main` 分支。根目錄的 `render.yaml` 已設定 Docker、Singapore 地區、**Free** 方案及自動部署。
3. 在 Render 提示的 `MEDIA_PASSWORD` 欄位設定至少 16 個字元的密碼。不要把密碼寫進 Git，也不需要在聊天中提供。
4. 確認方案仍為 **Free**，建立服務並等候狀態變成 **Live**。目前不需要開通付費方案。
5. 開啟 Render 實際顯示的 HTTPS 網址，會自動進入影音工具。輸入密碼後即可使用。
6. 若從 GitHub Pages 的 ToolHub 進入，按工具右上角「服務設定」，填入 Render 的 HTTPS 根網址（例如 `https://實際名稱.onrender.com`），儲存並登入。網址只保存在這個瀏覽器。

上面的部署連結會帶入 repository；登入 Render 後仍需由你確認 Free 方案及設定密碼。直接開雲端工具網址會自動連接同一台服務；未部署前，GitHub Pages 的工具頁只能顯示設定入口，不能下載。Render 的 `RENDER_EXTERNAL_URL` 自動提供允許的服務網址；其他 Docker 平台要設定 `MEDIA_PUBLIC_URL`。

每次推送到這個服務連接的 Git 分支，Render 自動重新部署。改密碼請在 Render Environment 更新 `MEDIA_PASSWORD` 並重新部署，原有登入 token 隨重啟失效。

## 免費方案及實際限制

- 最多 1 個工作同時下載，最多 5 個工作等候／執行。
- MP4 最高 1080p；影音來源最長 30 分鐘；每個工作暫存上限 200 MiB，全部工作合計預留不超過 1 GiB。超過檔案或 15 分鐘處理上限會中止工作。
- 完成檔案請在一小時內下載到裝置。逾時的檔案及紀錄會在下次查看工作／加入工作時清理。
- Render 免費服務閒置 15 分鐘會休眠，再次啟動約需一分鐘。服務休眠、重新部署或重啟後，暫存檔案及歷史紀錄會清空。
- Render 免費額度有流量及建置限制，大量向外傳輸也可能被暫停。以 Render 帳戶的用量頁為準；不要把此試用配置當作大量公開下載服務。
- YouTube 等平台可能要求登入、驗證或拒絕雲端 IP。密碼只保護你的工具，不能解決來源平台的存取限制。本工具不讀取登入 cookie；必須在實際 Render 主機上測試來源影片，部署成功不等於所有平台都能下載。
- 目前未經過真實 Render Docker 建置及平台下載測試。Windows 本機雲端模式的密碼、隔離及 API 測試與本地下載測試已記錄在 `verification.md`。

環境參數可在自己的主機調整：`MEDIA_MAX_HEIGHT`、`MEDIA_MAX_DURATION`（秒）、`MEDIA_MAX_DOWNLOAD_MB`、`MEDIA_JOB_TIMEOUT`（秒）、`MEDIA_RETENTION_SECONDS`（秒）。Free 配置不適合提高額度處理長片或大量轉碼。

## 其他 Docker 主機

從 repository 根目錄建置 `video-downloader/Dockerfile`。設定 `MEDIA_PASSWORD`、`MEDIA_PUBLIC_URL=https://你的實際網域`，將反向代理接到容器 `10000` port。對外使用 HTTPS；密碼與登入 token 不應經過公開 HTTP。服務以非 root 帳戶執行，只提供工具頁及必要前端檔案，不暴露下載資料夾或 Python 原始碼。

參考：[Render 免費方案](https://render.com/docs/free)、[Blueprint 設定](https://render.com/docs/blueprint-spec)、[Docker 部署](https://render.com/docs/docker)、[yt-dlp 平台驗證限制](https://github.com/yt-dlp/yt-dlp/wiki/FAQ)。
