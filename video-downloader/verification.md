# 驗證紀錄

2026-10-11，本地 Windows / Python 3.10.18 / yt-dlp 2026.08.19 / FFmpeg 7.1.1 / Node.js 22.13.1。

- 11 項單元測試通過：URL 白名單及 YouTube 連結正規化、時間輸入、字幕純文字、格式與裁切驗證、CLI 參數、排隊取消、重新啟動、佇列容量、資料過期、完成檔案註冊與啟動失敗。
- 真實 YouTube 解析及關鍵字搜尋通過，並由搜尋結果進入影片工作台。
- Blender 的 Big Buck Bunny：下載 480p 三秒 MP4，FFprobe 確認 H.264 / AAC、854×480、3.007 秒；MP3 192 kbps 輸出 3.024 秒；JPG 封面 1278×720。
- Blender Studio 的 Sprite Fright：人工英文字幕輸出 SRT、VTT、TXT；VTT 有 WEBVTT 標頭，SRT 有時間軸，TXT 已移除時間軸。
- 真實工作取消成功；MP4 檔案端點正確傳回 attachment 與 91,804 bytes。
- API 無 token 回傳 403；拒絕其他網域 Origin 與私有 URL；程式、.data 和 .git 檔案不可直接讀取。
- 瀏覽器驗證服務設定、格式分頁、片段時間、佇列與歷史紀錄。ToolHub 首頁入口可在原有 iframe 啟動影音工具；新工具沒有瀏覽器 console error。
- 390×844 手機尺寸下工作台、字幕設定與佇列可操作，無水平溢出；已保存桌面及手機畫面。

## 私人雲端模式

- 共 19 項測試通過，包括 8 項雲端測試：HTTP 未登入不洩漏 token、歷史與檔案密碼保護、Origin 白名單、錯誤密碼限速、公開網址只接受 HTTPS、下載上限與過期檔案清理、容量監控，以及 Linux 整個子程序群組取消（Windows 上以 mock 驗證）。
- Windows 本機以 cloud 模式實際驗證登入、重新整理保留目前分頁的登入狀態，以及登出後隱藏紀錄並要求重新登入。
- 真實解析 Blender Big Buck Bunny，僅顯示 1080p 以下畫質；密碼登入後完成三秒 480p MP4 下載。
- 雲端登入頁在 390×844 尺寸下無水平溢出（clientWidth / scrollWidth 均為 375）；沒有 console error。保存 `preview-cloud-login.png`、`preview-cloud-mobile.png`。
- Docker CLI 存在，但本機 Docker daemon 未啟動；未完成 Linux Docker 建置或 Render 真實部署。Render 部署需要使用者自己的帳戶及在平台設定的密碼。

驗證限制：本次實際平台下載測試以 YouTube 為主，而且網路出口是 Windows 本機。TikTok、Facebook、Instagram、X 未逐一實測；雲端 IP、平台登入、地區及反自動化限制可能使部分連結無法下載。必須在實際 Render 主機測試影片。GitHub Pages 至本地服務的瀏覽器權限流程未在正式線上頁面測試。
