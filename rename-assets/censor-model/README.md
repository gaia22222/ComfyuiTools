# Rename.html 打碼模型擴充

`Rename.html` 的 MVP 不需要 AI 模型：手動拖曳打碼框、點擊刪框、一鍵切換原圖對比、Canvas 馬賽克／模糊／黑白遮罩、批量複製框與匯出都會直接在瀏覽器本機執行。效果、強度與擴張設定會同步到全部圖片，並保存於瀏覽器的 `localStorage`。

自動偵測是選用擴充，專案目前**沒有包含模型或 ONNX Runtime Web**。原因是模型授權、類別順序、輸入尺寸及輸出格式都必須與實際模型配對，不能安全地假定任何通用 NSFW 模型都適用於漫畫。

## 部署檔案

把所選 ONNX Runtime Web browser bundle 放在：

```text
rename-assets/
└─ onnxruntime-web/
   ├─ ort.min.js
   └─ ort-*.wasm
```

請把 `ort.min.js` 實際引用的 `.wasm` 檔放在同一資料夾。頁面固定使用 WASM 單執行緒，避免 GitHub Pages 缺少 cross-origin isolation headers 時因 `SharedArrayBuffer` 失敗。

模型本身不必上傳到網站。使用者可在打碼工作室同時選取本機 `.onnx` 與 `.json`；兩個檔案只會讀入目前瀏覽器分頁。

## 支援的模型契約

- 輸入：RGB、`float32`、NCHW `[1, 3, inputSize, inputSize]`、像素除以 255。
- 縮放：目前版本直接拉伸到正方形，沒有 letterbox。
- 輸出：YOLO raw detection，形狀為 `[1, 4+C, N]` 或 `[1, N, 4+C]`。
- Box：`center_x, center_y, width, height`。預設以 `inputSize` 像素表示；若是 0–1，設定 `boxesNormalized: true`。
- YOLOv8 類輸出通常設定 `hasObjectness: false`；有獨立 objectness 通道的模型設定為 `true`。
- 後處理：只保留 `targetClassIds` / `targetLabels`，再套用 confidence threshold 與 class-agnostic NMS。

可從 `model-config.example.json` 複製設定。`labels` 的順序必須與模型訓練時完全一致。

## 發布前檢查

1. 確認 runtime 與模型授權允許公開發布或本機使用。
2. 用相同漫畫類型的獨立測試集量度漏檢；不要只看真人照片或單一畫風。
3. 在桌面與手機瀏覽器測試記憶體用量。大型模型可能在手機直接失敗。
4. 保留人工覆核；頁面會以黃色顯示模型候選框，手動框為粉紅色。
