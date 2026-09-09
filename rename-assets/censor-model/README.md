# Rename.html 內置漫畫打碼模型

`Rename.html` 已內置瀏覽器端自動偵測。使用者在打碼工作室按「自動偵測目前圖片」後，頁面會從同一個 GitHub Pages 網站載入模型及 ONNX Runtime Web；圖片像素只在目前瀏覽器分頁處理，不會上傳。

人工拖框、刪框、原圖對比、Canvas 馬賽克／模糊／黑白遮罩及批量匯出均不依賴模型，離線打開頁面也可使用。效果、強度與擴張設定會同步到全部圖片，並保存於瀏覽器的 `localStorage`。

## 內置模型

- 模型：`deepghs/anime_censor_detection` 的 `censor_detect_v1.0_n`
- 檔案：`censor_detect_v1.0_n.onnx`
- 來源：https://huggingface.co/deepghs/anime_censor_detection
- 授權：模型庫標示為 MIT
- SHA-256：`029de0a116f6c3c73bde62d2a8354c78664795579858f3c8e28fc1b4633a891c`
- 類別：`nipple_f`、`penis`、`pussy`
- 輸入：動態 NCHW；本站以 `640 × 640` RGB float32 執行
- 輸出：`[1, 7, 8400]`，即 YOLO box 4 通道加 3 個類別通道

`model-config.json` 是內置模型的已驗證設定。模型發布頁列出的建議信心門檻為 `0.278`，本站沿用該值。頁面先以灰色 letterbox 保持長寬比，再把偵測框映射回原圖座標。

## 自訂模型

進階使用者仍可在頁面同時選取本機 `.onnx` 與 `.json`。兩個檔案只會讀入目前瀏覽器分頁，並會取代該分頁已載入的內置模型。

支援的契約：

- 輸入：RGB、`float32`、NCHW `[1, 3, inputSize, inputSize]`、像素除以 255。
- 縮放：`resizeMode` 可用 `letterbox` 或 `stretch`；未指定時為 `stretch`。
- 輸出：YOLO raw detection，形狀為 `[1, 4+C, N]` 或 `[1, N, 4+C]`。
- Box：`center_x, center_y, width, height`。預設以 `inputSize` 像素表示；若是 0–1，設定 `boxesNormalized: true`。
- YOLOv8 類輸出通常設定 `hasObjectness: false`；有獨立 objectness 通道的模型設定為 `true`。
- 後處理：只保留 `targetClassIds` / `targetLabels`，再套用 confidence threshold 與 class-agnostic NMS。

可從 `model-config.example.json` 複製設定；`labels` 順序必須與模型訓練時完全一致。

## 限制

自動偵測只會建立黃色候選框。遮擋、極端角度、細小區域及未涵蓋的畫風仍可能漏檢，因此輸出前必須人工覆核；手動框會以粉紅色顯示。
