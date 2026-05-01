# Kế hoạch: Transparent Drawing Overlay — EvoDraw Desktop

## Tổng quan

Tạo một cửa sổ Electron **trong suốt, luôn trên cùng (always-on-top)**, cho phép người dùng **vẽ bằng chuột** lên màn hình, nhưng khi không vẽ thì **click xuyên xuống ứng dụng bên dưới**.
Tiếp theo, tích hợp **Socket.io** để đồng bộ nét vẽ hai chiều giữa Desktop App và Server/Web App.

## Cập nhật Kiến trúc: Local Socket Proxy Relay

**Luồng:** `Desktop App` ➔ `(Local Socket)` ➔ `Web App` ➔ `(Internet)` ➔ `Server`

✅ **ƯU ĐIỂM:**
1. **Không cần làm lại Đăng nhập:** Web đã lo hết phần xác thực (token, user, room), Desktop chỉ việc "ké" quyền của Web.
2. **Dữ liệu đồng nhất:** Mọi nét vẽ đều gom về Web xử lý rồi mới gửi lên Server, tránh lỗi xung đột nét vẽ.
3. **Desktop app siêu nhẹ:** Chỉ tập trung làm cửa sổ trong suốt và bắt nét vẽ, không phải gánh logic phức tạp.
4. **Trải nghiệm liền mạch:** Bật/tắt Desktop ngay từ một nút bấm trên Web.

⚠️ **NHƯỢC ĐIỂM:**
1. **Bắt buộc phải mở Web:** Nếu lỡ tắt tab trình duyệt, Desktop sẽ mất kết nối và không vẽ lên mạng được nữa.
2. **Tốn RAM/CPU hơn:** Cả trình duyệt và Desktop đều phải chạy logic vẽ (Fabric.js) cùng lúc.
3. **Kết nối Local dễ lỗi vặt:** Cổng kết nối giữa Desktop và Web (VD: port 4242) thỉnh thoảng có thể bị Firewall hoặc phần mềm diệt virus chặn.

> [!NOTE]
> Thay vì Desktop App phải xử lý Authentication (JWT) và tự kết nối lên Main Server, chúng ta sử dụng kiến trúc **Local Socket Proxy Relay**.
> Đặc biệt, Desktop App sẽ không viết lại logic vẽ bằng Vanilla JS, mà **sẽ nhúng trực tiếp giao diện Web (React)** qua một Route riêng (`/desktop-overlay`) để tái sử dụng toàn bộ tính năng vẽ (`useDrawingTools.js`, Fabric.js) từ Web App.

## Bước 1 — Tạo BrowserWindow trong suốt, always-on-top (Đã Triển Khai)

### Mục tiêu kỹ thuật
Tạo một `BrowserWindow` toàn màn hình, nền hoàn toàn trong suốt, luôn hiển thị trên tất cả cửa sổ khác.

### API Electron cần dùng

| API | Mục đích |
|---|---|
| `new BrowserWindow({ transparent: true })` | Nền cửa sổ trong suốt |
| `alwaysOnTop: true` | Cửa sổ luôn trên cùng |
| `frame: false` | Bỏ thanh tiêu đề + viền |
| `fullscreen: true` hoặc `setBounds()` | Phủ toàn bộ màn hình |
| `skipTaskbar: true` | Không hiện trên taskbar |
| `hasShadow: false` | Bỏ shadow (tránh viền mờ) |

### Code mẫu — `apps/desktop/src/main.js`

```js
import { app, BrowserWindow, screen, globalShortcut, ipcMain } from 'electron';
import path from 'node:path';

const createWindow = () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    focusable: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  return mainWindow;
};
```

### Cách test thủ công
1. Chạy app, mở overlay window
2. ✅ Cửa sổ overlay phủ kín toàn bộ màn hình
3. ✅ Nền hoàn toàn trong suốt — nhìn thấy desktop phía sau
4. ✅ Không hiện trên taskbar
5. ✅ Luôn nằm trên các cửa sổ khác

---

## Bước 2 — Click-through: chuột xuyên qua overlay (Đã Triển Khai)

### Mục tiêu kỹ thuật
Mặc định overlay **không chặn** bất kỳ thao tác chuột nào — mọi click, scroll, drag đều đi thẳng xuống ứng dụng bên dưới.

### API Electron cần dùng

| API | Mục đích |
|---|---|
| `win.setIgnoreMouseEvents(true, { forward: true })` | Bỏ qua mouse events nhưng **vẫn forward** các event `mousemove`/`mouseenter`/`mouseleave` vào renderer |
| CSS `pointer-events: none` trên `<body>` | Đảm bảo renderer không bắt click |

### Code mẫu — Thêm vào `apps/desktop/src/main.js`

```js
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  })
```

### Code mẫu — `index.html` & `src/index.css` (renderer)

**`apps/desktop/index.html`**:
```html
  <body>
    <canvas id="draw-canvas"></canvas>

    <div id="overlay-indicator" class="mode-passthrough">
      ⬤ Click-through &mdash; Ctrl+Shift+D to draw
    </div>
    <script type="module" src="/src/renderer.js"></script>
  </body>
```

**`apps/desktop/src/index.css`**:
```css
html,
body {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: transparent;
  pointer-events: none;
}

#draw-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* Canvas trong suốt */
  background: transparent;
  pointer-events: none;
}
```

### Cách test thủ công
1. Mở overlay, mở Notepad hoặc trình duyệt bên dưới
2. ✅ Click chuột → Notepad/trình duyệt nhận được click bình thường
3. ✅ Kéo thả, scroll trên app bên dưới hoạt động bình thường
4. ✅ Cửa sổ overlay vẫn hiển thị (nhìn thấy nếu có nội dung vẽ)

---

## Bước 3 — Toggle chế độ vẽ qua Hotkey + IPC (Đã Triển Khai)

### Mục tiêu kỹ thuật
Nhấn phím tắt (ví dụ `Ctrl+Shift+D`) để **bật/tắt chế độ vẽ**:
- **Chế độ vẽ BẬT**: canvas bắt chuột → người dùng vẽ được
- **Chế độ vẽ TẮT**: click xuyên qua overlay như bình thường

### API Electron cần dùng

| API | Mục đích |
|---|---|
| `globalShortcut.register()` | Đăng ký phím tắt toàn cục |
| `ipcMain.handle()` / `ipcRenderer.invoke()` | Giao tiếp Main ↔ Renderer |
| `win.setIgnoreMouseEvents(false)` | Bật lại bắt chuột cho overlay |
| `win.setIgnoreMouseEvents(true, { forward: true })` | Tắt bắt chuột (click-through) |
| `contextBridge.exposeInMainWorld()` | Expose API an toàn cho renderer |

### Code mẫu — Main process (`apps/desktop/src/main.js`)

```js
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    isDrawingMode = !isDrawingMode;
    
    if (isDrawingMode) {
      mainWindow.setIgnoreMouseEvents(false);
    } else {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }

    // send to renderer to update UI/Canvas
    mainWindow.webContents.send('drawing-mode-changed', isDrawingMode);
    console.log(`[Main] Drawing mode: ${isDrawingMode ? 'ON' : 'OFF'}`);
  });

// Handle IPC requests from preload
ipcMain.handle('get-drawing-mode', () => {
  return isDrawingMode;
});
```

### Code mẫu — Preload (`apps/desktop/src/preload.js`)

```js
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  onDrawingModeChanged: (callback) => ipcRenderer.on('drawing-mode-changed', (_event, value) => callback(value)),
  getDrawingMode: () => ipcRenderer.invoke('get-drawing-mode')
});
```

### Code mẫu — Renderer (`apps/desktop/src/renderer.js`)

```js
// receive toggle drawing mode from main process
window.electronAPI.onDrawingModeChanged((isDrawing) => {
  if (isDrawing) {
    // drawing mode → canvas + body receive mouse events
    document.body.style.pointerEvents = 'auto';
    canvas.style.pointerEvents = 'auto';
    document.body.style.cursor = 'crosshair';
    canvas.style.cursor = 'crosshair';
    canvas.style.background = 'rgba(0, 0, 0, 0.01)';

    indicator.className = 'mode-drawing';
    indicator.innerHTML = '⬤ Drawing Mode &mdash; Ctrl+Shift+D to exit';
  } else {
    // passthrough mode → canvas + body not receive mouse events
    document.body.style.pointerEvents = 'none';
    canvas.style.pointerEvents = 'none';
    document.body.style.cursor = 'default';
    canvas.style.cursor = 'default';
    canvas.style.background = 'transparent';

    indicator.className = 'mode-passthrough';
    indicator.innerHTML = '⬤ Click-through &mdash; Ctrl+Shift+D to draw';
  }
});
```

### Cách test thủ công
1. Mở overlay + mở Notepad bên dưới
2. ✅ Mặc định: click vào Notepad hoạt động bình thường (click-through)
3. Nhấn `Ctrl+Shift+D`
4. ✅ Con trỏ đổi thành crosshair → đang ở chế độ vẽ
5. ✅ Click chuột **không** xuyên xuống Notepad nữa
6. Nhấn `Ctrl+Shift+D` lần nữa
7. ✅ Con trỏ trở lại bình thường → click xuyên qua lại

---

## Bước 4 — Tận dụng chức năng vẽ của Web cho Desktop

## Lưu ý quan trọng

> [!WARNING]
> **`transparent: true` trên Windows**: Electron trên Windows yêu cầu **disable GPU acceleration** nếu gặp lỗi render trong suốt. Thêm `app.disableHardwareAcceleration()` trước `app.whenReady()` nếu cần.

> [!NOTE]
> **`focusable: false`** ngăn overlay cướp focus khi đang ở chế độ click-through. Khi bật chế độ vẽ, cần set `focusable: true` + `focus()` để nhận mouse events.

> [!TIP]
> **Multi-monitor**: Dùng `screen.getAllDisplays()` thay vì `getPrimaryDisplay()` nếu muốn hỗ trợ vẽ trên nhiều màn hình.

## Phím tắt tổng hợp

| Phím tắt | Chức năng |
|---|---|
| `Ctrl+Shift+D` | Toggle chế độ vẽ ↔ click-through |
