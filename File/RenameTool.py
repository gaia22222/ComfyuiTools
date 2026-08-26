import sys
import os
import shutil
from PyQt6.QtWidgets import (QApplication, QWidget, QPushButton, QLabel, QMessageBox, 
                             QVBoxLayout, QHBoxLayout, QScrollArea, QFileDialog, 
                             QSizePolicy, QLineEdit)
from PyQt6.QtCore import (Qt, QMimeData, QTimer, QPoint, QPropertyAnimation, 
                          QEasingCurve, QRunnable, QThreadPool, QObject, pyqtSignal, 
                          QParallelAnimationGroup)
from PyQt6.QtGui import QDrag, QPixmap, QPainter, QColor, QFont, QPen

# === 1. 深色彈窗工具 ===
class DarkDialog:
    @staticmethod
    def question(parent, title, text):
        msg = QMessageBox(parent)
        msg.setWindowTitle(title)
        msg.setText(text)
        msg.setIcon(QMessageBox.Icon.Question)
        msg.setStandardButtons(QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        msg.setStyleSheet(DarkDialog.get_style())
        return msg.exec()

    @staticmethod
    def warning(parent, title, text):
        msg = QMessageBox(parent)
        msg.setWindowTitle(title)
        msg.setText(text)
        msg.setIcon(QMessageBox.Icon.Warning)
        msg.setStandardButtons(QMessageBox.StandardButton.Ok)
        msg.setStyleSheet(DarkDialog.get_style_warning())
        return msg.exec()

    @staticmethod
    def get_style():
        return """
            QMessageBox { background-color: #2b2b2b; }
            QLabel { color: #ffffff; font-size: 14px; }
            QPushButton {
                background-color: #1890ff; color: white; 
                border-radius: 5px; padding: 5px 15px; min-width: 60px;
            }
            QPushButton:hover { background-color: #40a9ff; }
        """
    
    @staticmethod
    def get_style_warning():
        return """
            QMessageBox { background-color: #2b2b2b; }
            QLabel { color: #ffffff; font-size: 14px; }
            QPushButton {
                background-color: #ff4d4f; color: white; 
                border-radius: 5px; padding: 5px 15px; min-width: 60px;
            }
            QPushButton:hover { background-color: #ff7875; }
        """

# === 2. 非同步圖片加載工人 (Async Worker) ===
class ImageLoaderSignals(QObject):
    finished = pyqtSignal(QPixmap) # 完成時回傳 Pixmap

class ImageLoader(QRunnable):
    def __init__(self, path, target_size):
        super().__init__()
        self.path = path
        self.target_size = target_size
        self.signals = ImageLoaderSignals()

    def run(self):
        if not os.path.exists(self.path):
            return
        # 在後台讀取並縮放圖片，避免卡住介面
        pixmap = QPixmap(self.path)
        if not pixmap.isNull():
            # 預先縮圖以節省記憶體並加快渲染
            scaled = pixmap.scaled(
                self.target_size, self.target_size,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation
            )
            self.signals.finished.emit(scaled)

# === 3. 格子物件 (Slot) ===
class ImageSlot(QLabel):
    def __init__(self, index, parent_window):
        super().__init__(parent_window.content_widget) # 注意：父層直接設為 content_widget
        self.index = index 
        self.parent_window = parent_window
        self.file_path = None 
        self.original_pixmap = None 
        
        self.is_placeholder = False
        self.is_highlighted = False
        self.is_loading = False # 載入中狀態

        # 固定大小 (為了絕對定位計算方便，這裡建議固定，或者動態計算)
        # 這裡我們設為固定大小，加上 Margin 來控制間距
        self.setFixedSize(130, 130) 
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setAcceptDrops(True) 
        self.show() # 必須手動 show，因為沒有 layout 幫忙

        # 動畫屬性
        self._animation = QPropertyAnimation(self, b"pos")
        self._animation.setDuration(250) # 動畫時間 250ms
        self._animation.setEasingCurve(QEasingCurve.Type.OutQuad) # 減速曲線 (滑順感)

        self.default_style = """
            QLabel {
                background-color: #444;
                border: 2px dashed #777;
                border-radius: 8px;
                color: #AAA;
                font-size: 14px;
            }
        """
        self.placeholder_style = """
            QLabel {
                background-color: #333; 
                border: 2px dashed #888;
                border-radius: 8px;
            }
        """
        self.filled_style = """
            QLabel {
                background-color: #FFF;
                border: 2px solid #1890ff;
                border-radius: 8px;
            }
        """
        self.loading_style = """
             QLabel {
                background-color: #444;
                border: 2px solid #666;
                border-radius: 8px;
                color: #eb2f96;
                font-weight: bold;
            }
        """
        self.setStyleSheet(self.default_style)
        self.setText(f"Slot {index + 1}")

    # === 動畫控制 ===
    def move_to(self, pos, animate=True):
        if self.is_placeholder: 
            # 如果是正在被拖曳的本體，直接瞬移，不要動畫 (因為它要跟隨滑鼠/或瞬移歸位)
            # 但因為我們拖曳是用 drag.exec() 阻塞，這裡主要是處理 reflow 時
            # 如果是 placeholder，我們通常不移動它，或者讓它瞬移
            self.move(pos)
            return None
            
        if animate:
            if self.pos() == pos: return None # 位置沒變就不動
            self._animation.stop()
            self._animation.setStartValue(self.pos())
            self._animation.setEndValue(pos)
            return self._animation # 回傳動畫物件給 Group 管理
        else:
            self.move(pos)
            return None

    # === 非同步圖片設定 ===
    def set_image(self, path):
        self.file_path = path
        if path:
            self.is_loading = True
            self.setText("Loading...")
            self.setStyleSheet(self.loading_style)
            self.original_pixmap = None # 先清空

            # 啟動後台載入
            loader = ImageLoader(path, 200) # 載入 200x200 的縮圖
            loader.signals.finished.connect(self.on_image_loaded)
            QThreadPool.globalInstance().start(loader)
        else:
            self.clear_slot()

    def on_image_loaded(self, pixmap):
        # 確保路徑沒變 (防止快速切換時顯示錯誤圖片)
        if self.is_loading and self.file_path:
            self.is_loading = False
            self.original_pixmap = pixmap
            # 觸發重繪
            self.update() 
            self.setStyleSheet(self.filled_style)
            self.setText("")

    def clear_slot(self):
        self.file_path = None
        self.original_pixmap = None
        self.is_placeholder = False
        self.is_loading = False
        self.clear()
        self.setText(f"Slot {self.index + 1}")
        self.setStyleSheet(self.default_style)

    # === 繪圖與拖曳 (與上一版類似，但適配 Async) ===
    def paintEvent(self, event):
        if self.is_highlighted:
            super().paintEvent(event)
            painter = QPainter(self)
            pen = QPen(QColor("#52c41a")); pen.setWidth(4)
            painter.setPen(pen); painter.drawRect(2, 2, self.width()-4, self.height()-4)
            return

        if self.is_placeholder:
            super().paintEvent(event)
            if self.original_pixmap:
                painter = QPainter(self)
                painter.setRenderHint(QPainter.RenderHint.Antialiasing)
                painter.setOpacity(0.3) # 殘影透明度
                
                # 計算縮放與置中
                scaled = self.original_pixmap.scaled(
                    self.width()-10, self.height()-10,
                    Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
                x = (self.width() - scaled.width()) // 2
                y = (self.height() - scaled.height()) // 2
                painter.drawPixmap(x, y, scaled)
                
                painter.setOpacity(0.5)
                pen = QPen(QColor("#FFFFFF")); pen.setStyle(Qt.PenStyle.DashLine); pen.setWidth(2)
                painter.setPen(pen); painter.setBrush(Qt.BrushStyle.NoBrush)
                painter.drawRect(2, 2, self.width()-4, self.height()-4)
            return

        super().paintEvent(event)
        
        # 正常繪圖 (如果有圖且已載入完成)
        if self.original_pixmap and not self.is_loading:
            painter = QPainter(self)
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)
            
            # 畫圖
            scaled = self.original_pixmap.scaled(
                self.width()-10, self.height()-10,
                Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
            x = (self.width() - scaled.width()) // 2
            y = (self.height() - scaled.height()) // 2
            painter.drawPixmap(x, y, scaled)

            # 畫序號
            painter.setBrush(QColor("#ff4d4f")); painter.setPen(Qt.PenStyle.NoPen)
            painter.drawEllipse(5, 5, 30, 30)
            painter.setPen(QColor("white")); painter.setFont(QFont("Arial", 12, QFont.Weight.Bold))
            painter.drawText(5, 5, 30, 30, Qt.AlignmentFlag.AlignCenter, str(self.index + 1))
        
        # 如果正在 Loading，畫序號就好
        elif self.is_loading:
             pass # 文字由 setText 處理

    def mouseMoveEvent(self, event):
        if not self.file_path or self.is_loading: return
        if event.buttons() != Qt.MouseButton.LeftButton: return

        self.parent_window.dragging_slot_index = self.index
        drag = QDrag(self)
        mime = QMimeData()
        mime.setText(str(self.index)) 
        drag.setMimeData(mime)

        if self.original_pixmap:
            drag.setPixmap(self.original_pixmap)
            drag.setHotSpot(event.position().toPoint())

        self.set_placeholder_mode(True)
        self.parent_window.dragging_slot_index = self.index
        
        # 執行拖曳
        drag.exec(Qt.DropAction.MoveAction)

        # 結束
        self.parent_window.dragging_slot_index = None 
        self.parent_window.finalize_drag()

    def set_placeholder_mode(self, active):
        self.is_placeholder = active
        self.update() # 觸發 paintEvent 重繪

    # === 右鍵選單 ===
    def contextMenuEvent(self, event):
        if not self.file_path: return
        from PyQt6.QtWidgets import QMenu
        from PyQt6.QtGui import QAction
        menu = QMenu(self)
        menu.setStyleSheet("QMenu { background-color: #333; color: white; border: 1px solid #555; } QMenu::item:selected { background-color: #1890ff; }")
        action_remove = QAction("❌ 移除此圖片", self)
        action_remove.triggered.connect(lambda: self.parent_window.remove_slot_item(self.index))
        menu.addAction(action_remove)
        menu.exec(event.globalPos())

    # === Drag & Drop ===
    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls() or event.mimeData().hasText(): event.accept()
        else: event.ignore()

    def dragMoveEvent(self, event):
        if event.mimeData().hasText():
            source_idx = self.parent_window.dragging_slot_index
            target_idx = self.index
            if source_idx is not None and source_idx != target_idx:
                # 呼叫主視窗的平滑重排
                self.parent_window.preview_reorder(source_idx, target_idx)
            event.accept()
        elif event.mimeData().hasUrls():
            if not self.is_highlighted:
                self.is_highlighted = True
                self.update()
            event.accept()

    def dragLeaveEvent(self, event):
        if self.is_highlighted:
            self.is_highlighted = False
            self.update()

    def dropEvent(self, event):
        self.is_highlighted = False
        self.update()
        if event.mimeData().hasUrls():
            paths = [url.toLocalFile() for url in event.mimeData().urls() 
                     if url.toLocalFile().lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.webp'))]
            if paths: self.parent_window.batch_import_images(paths, insert_at=self.index)
        elif event.mimeData().hasText():
            event.accept()

# === 4. 主視窗 (V14 平滑動畫 + 非同步版) ===
class RenamerV14(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("圖片排序 V14 - 平滑動畫 & 非同步載入")
        self.resize(1050, 850)
        self.setStyleSheet("background-color: #222;") 

        self.slots = []
        self.dragging_slot_index = None
        self.cols_per_row = 5
        
        # 格子配置參數
        self.slot_width = 130
        self.slot_height = 130
        self.spacing = 15
        self.margin = 15

        main_layout = QVBoxLayout()
        
        info = QLabel("V14 更新：\n1. 非同步載入 (介面不卡頓)\n2. 平滑動畫 (位置交換時有滑動效果)\n3. 右鍵可移除單張圖片")
        info.setStyleSheet("color: #EEE; font-size: 14px; padding: 10px; background-color: #333; border-radius: 5px;")
        main_layout.addWidget(info)

        # Scroll Area
        self.scroll_area = QScrollArea()
        # 關鍵：關閉 WidgetResizable，因為我們要手動控制內容大小 (Absolute Layout)
        self.scroll_area.setWidgetResizable(False) 
        self.scroll_area.setStyleSheet("border: none;")
        
        self.content_widget = QWidget()
        self.content_widget.setStyleSheet("background-color: #333;")
        # 注意：content_widget 不再設置 Layout！
        
        self.scroll_area.setWidget(self.content_widget)
        main_layout.addWidget(self.scroll_area)

        # 初始格子
        for i in range(15):
            self.add_new_slot()

        # UI 下方按鈕 (維持不變)
        btn_layout = QVBoxLayout()
        naming_layout = QHBoxLayout()
        input_style = "QLineEdit { background-color: #444; color: #FFF; border: 1px solid #666; border-radius: 4px; padding: 5px; } QLabel { color: #DDD; font-weight: bold; }"
        self.txt_prefix = QLineEdit(); self.txt_prefix.setStyleSheet(input_style)
        self.txt_suffix = QLineEdit(); self.txt_suffix.setStyleSheet(input_style)
        naming_layout.addWidget(QLabel("前綴:", styleSheet=input_style)); naming_layout.addWidget(self.txt_prefix)
        naming_layout.addSpacing(20)
        naming_layout.addWidget(QLabel("後綴:", styleSheet=input_style)); naming_layout.addWidget(self.txt_suffix)
        btn_layout.addLayout(naming_layout)

        top_actions = QHBoxLayout()
        btn_import = QPushButton("＋ 導入圖片"); btn_import.setMinimumHeight(60)
        btn_import.setStyleSheet("QPushButton { background-color: #722ed1; color: white; font-weight: bold; border-radius: 8px; }")
        btn_import.clicked.connect(self.open_file_dialog)
        top_actions.addWidget(btn_import, 3)
        
        self.btn_rename = QPushButton("依照順序重命名")
        self.btn_rename.setMinimumHeight(60)
        self.btn_rename.setStyleSheet("QPushButton { background-color: #1890ff; color: white; font-weight: bold; border-radius: 8px; }")
        self.btn_rename.clicked.connect(self.start_rename)
        top_actions.addWidget(self.btn_rename, 7)
        btn_layout.addLayout(top_actions)

        btn_clear = QPushButton("清空所有"); btn_clear.setStyleSheet("background-color: #555; color: white; padding: 10px; border-radius: 5px;")
        btn_clear.clicked.connect(self.reset_grid)
        btn_layout.addWidget(btn_clear)
        main_layout.addLayout(btn_layout)
        self.setLayout(main_layout)

        # 啟動時先排一次
        QTimer.singleShot(100, self.reflow_grid_animated)

    # === [核心] 絕對位置計算與動畫 ===
    def calculate_pos(self, index, cols):
        row = index // cols
        col = index % cols
        x = self.margin + col * (self.slot_width + self.spacing)
        y = self.margin + row * (self.slot_height + self.spacing)
        return QPoint(x, y)

    def reflow_grid_animated(self):
        # 1. 計算目前視窗能容納幾列
        viewport_width = self.scroll_area.viewport().width()
        available_width = viewport_width - (2 * self.margin)
        new_cols = max(1, available_width // (self.slot_width + self.spacing))
        self.cols_per_row = new_cols

        # 2. 建立並行動畫群組
        anim_group = QParallelAnimationGroup(self)
        
        # 3. 為每個 Slot 設定動畫目標
        for i, slot in enumerate(self.slots):
            slot.index = i
            # 如果不是佔位符，也不是空的，顯示序號
            if not slot.file_path and not slot.is_placeholder:
                slot.setText(f"Slot {i+1}")
            elif slot.is_placeholder:
                slot.setText(f"{i+1}")
            
            target_pos = self.calculate_pos(i, new_cols)
            
            # 取得該 Slot 的動畫物件 (如果它需要移動)
            anim = slot.move_to(target_pos, animate=True)
            if anim:
                anim_group.addAnimation(anim)

        # 4. 開始所有動畫
        anim_group.start()

        # 5. 更新 Content Widget 高度 (讓 ScrollBar 能動)
        total_rows = (len(self.slots) - 1) // new_cols + 1
        total_height = self.margin + total_rows * (self.slot_height + self.spacing) + self.margin
        self.content_widget.setFixedSize(viewport_width, total_height)

    # === 視窗大小改變時 ===
    def resizeEvent(self, event):
        # 視窗改變大小時，不要動畫，直接瞬移 (不然會很暈)
        self.reflow_grid_instant()
        super().resizeEvent(event)

    def reflow_grid_instant(self):
        viewport_width = self.scroll_area.viewport().width()
        available_width = viewport_width - (2 * self.margin)
        new_cols = max(1, available_width // (self.slot_width + self.spacing))
        self.cols_per_row = new_cols
        
        for i, slot in enumerate(self.slots):
            target_pos = self.calculate_pos(i, new_cols)
            slot.move_to(target_pos, animate=False) # 瞬移

        total_rows = (len(self.slots) - 1) // new_cols + 1
        total_height = self.margin + total_rows * (self.slot_height + self.spacing) + self.margin
        self.content_widget.setFixedSize(viewport_width, total_height)

    # === 預覽排序 (拖曳中) ===
    def preview_reorder(self, from_idx, to_idx):
        if from_idx == to_idx: return
        
        moved_slot = self.slots.pop(from_idx)
        self.slots.insert(to_idx, moved_slot)
        
        self.dragging_slot_index = to_idx
        
        # 這裡呼叫有動畫的版本，實現平滑交換
        self.reflow_grid_animated()

    def finalize_drag(self):
        for slot in self.slots:
            if slot.is_placeholder:
                slot.set_placeholder_mode(False)
        self.dragging_slot_index = None
        self.reflow_grid_animated()

    # === 功能函式 ===
    def add_new_slot(self):
        index = len(self.slots)
        slot = ImageSlot(index, self)
        self.slots.append(slot)
        # 初始位置先放在螢幕外或最後，再 reflow
        return slot

    def remove_slot_item(self, index):
        slot = self.slots[index]
        if slot.file_path:
            slot.clear_slot()
            # 整理邏輯：移除這個 slot，把後面的 slot 內容往前移
            # 但為了簡單，我們這裡做的邏輯是：取出所有路徑，清空 Grid，重新填入
            # 或者更高效：把這個 slot 移到最後面，然後大家往前擠
            
            # 這裡用「重新整理資料流」的方式
            current_paths = [s.file_path for s in self.slots if s.file_path]
            # 因為已經清空了自己，所以 current_paths 已經不包含被刪除的圖
            self.refresh_grid_with_paths(current_paths)

    def refresh_grid_with_paths(self, path_list):
        # 1. 填入資料
        for i, path in enumerate(path_list):
            if i >= len(self.slots): self.add_new_slot()
            # 只有當路徑不同時才重新讀取 (避免閃爍)
            if self.slots[i].file_path != path:
                self.slots[i].set_image(path)
        
        # 2. 清空多餘的
        for i in range(len(path_list), len(self.slots)):
            self.slots[i].clear_slot()
            
        # 3. 檢查擴充
        self.check_and_expand()
        
        # 4. 動畫排列
        self.reflow_grid_animated()

    def check_and_expand(self):
        if not self.slots: self.add_new_slot(); return
        while self.slots[-1].file_path is not None:
            self.add_new_slot()

    def open_file_dialog(self):
        files, _ = QFileDialog.getOpenFileNames(self, "選擇圖片", "", "Images (*.png *.jpg *.jpeg *.bmp *.webp)")
        if files: self.batch_import_images(files)

    def batch_import_images(self, paths, insert_at=None):
        current_imgs = [s.file_path for s in self.slots if s.file_path]
        if insert_at is not None:
            target = min(insert_at, len(current_imgs))
            for p in reversed(paths): current_imgs.insert(target, p)
        else:
            current_imgs.extend(paths)
        self.refresh_grid_with_paths(current_imgs)

    def reset_grid(self):
        if any(s.file_path for s in self.slots):
            if DarkDialog.question(self, "確認", "確定清空？") == QMessageBox.StandardButton.No: return
        
        # 刪除多餘的 slot，只留 15 個
        while len(self.slots) > 15:
            slot = self.slots.pop()
            slot.deleteLater()
        
        for slot in self.slots: slot.clear_slot()
        self.reflow_grid_animated()

    def start_rename(self):
        tasks = [s.file_path for s in self.slots if s.file_path]
        if not tasks: DarkDialog.warning(self, "注意", "無圖片"); return
        
        pre = self.txt_prefix.text().strip()
        suf = self.txt_suffix.text().strip()
        if DarkDialog.question(self, '確認', f"將重命名 {len(tasks)} 張圖片？") == QMessageBox.StandardButton.No: return
        
        folder = os.path.join(os.path.dirname(tasks[0]), "Renamed_V14")
        if not os.path.exists(folder): os.makedirs(folder)
        
        try:
            for i, path in enumerate(tasks):
                ext = os.path.splitext(path)[1]
                new_name = f"{pre}{i+1}{suf}{ext}"
                shutil.copy2(path, os.path.join(folder, new_name))
            
            # 簡單的按鈕回饋
            self.btn_rename.setText("完成！"); self.btn_rename.setEnabled(False)
            QTimer.singleShot(2000, lambda: [self.btn_rename.setText("依照順序重命名"), self.btn_rename.setEnabled(True)])
        except Exception as e:
            DarkDialog.warning(self, "錯誤", str(e))

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = RenamerV14()
    window.show()
    sys.exit(app.exec())