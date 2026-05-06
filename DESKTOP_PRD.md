# EvoDraw Desktop Overlay — PRD & Implementation Guide

> Read this entire file before writing any code. It documents the goal, the correct architecture, every known bug and its fix, and a step-by-step build plan.

---

## What it is

An Electron app that runs as a **fullscreen transparent drawing overlay**. The web app launches it automatically after the presenter picks a screen share source. The presenter draws annotations on top of their screen; those strokes appear live on the web canvas for all room participants via Socket.IO.

---

## How it gets launched (deep link flow)

```
Web user clicks "Share Screen"
  → picks screen source in browser dialog
  → web app calls window.open("evodraw://start?room=X&token=Y&shareId=Z&server=S&username=U")
  → OS dispatches evodraw:// to the Electron app
  → Electron main process stores params as pendingDeepLink
  → Renderer (React) polls on mount via getPendingDeepLink()
  → App.jsx receives params → sets roomInfo → OverlayPage mounts
  → OverlayPage enters drawing mode immediately
```

**Without deep link** (manual join — future feature, not priority):
The app shows nothing; user joins via tray or future landing page.

---

## Files that are CORRECT — do not rewrite these

| File | Status | Notes |
|------|--------|-------|
| `src/main.js` | ✅ Correct | All Electron shell logic is solid |
| `src/preload.js` | ✅ Correct | IPC bridge is correct |
| `src/renderer/App.jsx` | ✅ Correct | Deep link handling is correct |
| `src/renderer/services/socket.js` | ✅ Correct | Uses `['polling', 'websocket']` — critical order |
| `src/renderer/services/api.js` | ✅ Correct | |
| `src/renderer/hooks/useRoom.js` | ✅ Correct | Uses `join_room_overlay` |
| `src/renderer/hooks/useCanvasSync.js` | ✅ Correct | |
| `src/renderer/hooks/useHistory.js` | ✅ Correct | |
| `src/renderer/hooks/useOverlayEmit.js` | ✅ Correct | Normalizes coords, emits overlay:stroke:add |

**Only rewrite:** `src/renderer/pages/OverlayPage.jsx` and all CSS/UI.

---

## Key fixes already applied to the "do not rewrite" files

### main.js
- `show: false` on BrowserWindow — window is hidden until deep link arrives
- `--squirrel-firstrun` early exit — prevents launch after Windows install
- `overlayWindow.show()` called when deep link arrives (in both `handleDeepLink` and `getPendingDeepLink`)
- `overlayWindow.hide()` called when `inRoom: false` via `overlay:room-state` IPC
- **Never call `overlayWindow.focus()`** — it blacks out the browser's screen share video

### socket.js
- Transports must be `['polling', 'websocket']` (polling first) — WebSocket fails silently in Electron renderer without this

### App.jsx
- No landing page (returns `null` when no roomInfo) — landing page blocks the screen
- No `setIgnoreMouse(false)` on init — window starts click-through
- `handleDeepLinkParams` calls `window.electronAPI.setMode('drawing')` when `shareId` is present

### preload.js
- All `on*` listeners return proper cleanup: `() => ipcRenderer.removeListener(channel, h)`

---

## Architecture

```
Electron Main Process (main.js)
  ├── BrowserWindow: transparent, always-on-top, show:false, no frame
  ├── setIgnoreMouseEvents(true, { forward: true })  ← default: click-through
  ├── Tray icon (only visible thing on launch)
  ├── globalShortcut: Ctrl+Shift+D → toggleMode()
  ├── Deep link handler (evodraw://)
  └── IPC handlers

Renderer Process (React + Vite)
  ├── App.jsx          → null | <OverlayPage>
  ├── OverlayPage.jsx  → fullscreen canvas + toolbar
  ├── hooks/
  │   ├── useRoom.js         → Socket.IO connect + join_room_overlay
  │   ├── useOverlayEmit.js  → path:created → normalize → overlay:stroke:add
  │   ├── useCanvasSync.js   → full sync (non-overlay sessions only)
  │   └── useHistory.js      → undo/redo (non-overlay sessions only)
  └── components/Toolbar/    → copied from web app
```

---

## UI Design

```
┌─────────────────────────────────────────────────────────┐
│  [transparent — you see the desktop/screen share]        │
│                                                          │
│  ┌── Toolbar (left, frosted glass, 70% opacity) ──┐     │
│  │  [select]  [pen●]  [eraser]  [text]  [shapes▾] │     │
│  │  ─────────────────────────────────────────────  │     │
│  │  [undo]                                         │     │
│  │  ─────────────────────────────────────────────  │     │
│  │  [clear all]  [leave room]                      │     │
│  └────────────────────────────────────────────────┘     │
│                                                          │
│  [● Drawing mode]          ← mode indicator, top center  │
│                                                          │
│  [Room · N online]         ← status bar, bottom left     │
│  [✏ FAB]                  ← mode toggle, bottom right    │
└─────────────────────────────────────────────────────────┘
```

**Toolbar is copied from the web app.** Voice and screen share buttons are NOT shown (just don't pass those props).

**In working mode:** toolbar slides out / becomes invisible, all clicks pass through to the desktop. The FAB stays visible so the user can re-enter drawing mode.

**In drawing mode:** toolbar is visible (frosted glass), the Fabric canvas captures mouse input for drawing.

---

## Component reuse from web app

Copy these files **exactly** from `apps/web/src/components/Toolbar/` into `apps/desktop/src/renderer/components/Toolbar/`:

| File | Change needed |
|------|--------------|
| `toolDefinitions.jsx` | None — copy exactly |
| `PenOptionsPopup.jsx` | None — copy exactly |
| `Toolbar.jsx` | Add 4 props: `hidden`, `onMouseEnter`, `onMouseLeave`, `children` |
| `Toolbar.css` | Change `toolbar-area` to `position: fixed` (not absolute) |

### Changes to Toolbar.jsx

```jsx
export default function Toolbar({
  // ... existing props ...
  hidden = false,        // ADD THIS
  onMouseEnter,          // ADD THIS
  onMouseLeave,          // ADD THIS
  children,              // ADD THIS
}) {
  return (
    <div
      className={`toolbar-area${hidden ? ' hidden' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <nav className="toolbar">
        {/* ... all existing buttons unchanged ... */}
      </nav>
      {children}   {/* ADD THIS — renders overlay-specific cards below */}
    </div>
  )
}
```

### Changes to Toolbar.css

```css
/* CRITICAL: must be fixed, not absolute */
/* Fabric.js replaces the canvas with a wrapper div that disrupts absolute positioning */
.toolbar-area {
  position: fixed;   /* was: absolute */
  top: 50%;
  left: 16px;
  transform: translateY(-50%);
  z-index: 200;
  /* ... rest unchanged ... */
}

.toolbar-area.hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(-12px);
}

/* Frosted glass for overlay context */
.toolbar {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(20, 20, 26, 0.72);
  /* ... rest unchanged ... */
}

.tool-options {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(20, 20, 26, 0.72);
}
```

---

## overlay.css — full file

```css
/* CSS custom properties — dark frosted-glass theme */
:root {
  --accent: #7c78f0;
  --accent-hover: #6965db;
  --text: #e4e4e8;
  --text-light: #a0a0ab;
  --text-muted: #6e6e7a;
  --border: rgba(255, 255, 255, 0.12);
  --surface: rgba(20, 20, 26, 0.72);
  --bg: transparent;
}

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

html, body, #root {
  width: 100vw; height: 100vh;
  overflow: hidden;
  background: transparent;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  color: var(--text);
  user-select: none;
  -webkit-app-region: no-drag;
}

/* Overlay root — transparent, full screen */
.overlay-root {
  width: 100vw; height: 100vh;
  position: relative;
  background: transparent;
}

/* Fabric.js wraps <canvas> in .canvas-container — pin it behind everything */
.canvas-container {
  position: fixed !important;
  inset: 0 !important;
  z-index: 1 !important;
}

/* Mode indicator pill — top center */
.mode-indicator {
  position: fixed;
  top: 12px; left: 50%;
  transform: translateX(-50%);
  z-index: 300;
  display: flex; align-items: center; gap: 6px;
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 12px; font-weight: 600;
  backdrop-filter: blur(8px);
  pointer-events: none;
}
.mode-indicator.working { background: rgba(34, 139, 34, 0.85); color: #fff; }
.mode-indicator.drawing { background: rgba(224, 49, 49, 0.9); color: #fff; }

.mode-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }

/* Red border glow in drawing mode */
.overlay-root:has(.mode-indicator.drawing)::after {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none; z-index: 50;
  border: 3px solid rgba(224, 49, 49, 0.5);
  animation: border-glow 2s ease-in-out infinite alternate;
}
@keyframes border-glow {
  from { border-color: rgba(224, 49, 49, 0.5); }
  to   { border-color: rgba(224, 49, 49, 0.15); }
}

/* Clear + Leave card — rendered as children of Toolbar */
.overlay-actions {
  display: flex; flex-direction: column; gap: 2px;
  padding: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.exit-btn:hover {
  background: rgba(224, 49, 49, 0.15) !important;
  color: #e03131 !important;
}

/* Connection status — bottom left */
.connection-status {
  position: fixed;
  bottom: 12px; left: 12px;
  z-index: 300;
  display: flex; align-items: center; gap: 6px;
  padding: 4px 12px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  backdrop-filter: blur(8px);
  font-size: 11px; color: var(--text-muted);
  pointer-events: none;
}
.conn-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); }
.connection-status.connected .conn-dot { background: #2f9e44; }
.connection-status.connected .conn-text { color: var(--text-light); }
.connection-status.error .conn-dot { background: #e03131; }
.connection-status.error .conn-text { color: #ff6b6b; }

/* Mode toggle FAB — bottom right, always visible */
.mode-toggle-fab {
  position: fixed;
  bottom: 12px; right: 16px;
  z-index: 300;
  width: 40px; height: 40px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-light);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  transition: background 0.15s, transform 0.15s;
}
.mode-toggle-fab:hover {
  background: rgba(224, 49, 49, 0.7);
  color: #fff;
  transform: scale(1.08);
}
```

---

## OverlayPage.jsx — full implementation

```jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import useRoom from '../hooks/useRoom';
import useCanvasSync from '../hooks/useCanvasSync';
import useHistory from '../hooks/useHistory';
import useOverlayEmit from '../hooks/useOverlayEmit';
import Toolbar from '../components/Toolbar/Toolbar';

export default function OverlayPage({ roomInfo, serverUrl, screenSize, onLeave }) {
  const { roomId, username, shareId } = roomInfo;
  const isOverlayMode = !!shareId;

  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const syncState = useRef({ _applying: false });
  const [fabricCanvas, setFabricCanvas] = useState(null);

  // Tool state
  const [mode, setMode] = useState(isOverlayMode ? 'drawing' : 'working');
  const [activeTool, setActiveTool] = useState('pen');
  const [strokeColor, setStrokeColor] = useState('#e03131');
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [strokeOpacity, setStrokeOpacity] = useState(1);
  const [strokeStyle, setStrokeStyle] = useState('solid');

  const { isConnected, connectedUsers, error: roomError } = useRoom(serverUrl, roomId, username);

  const { undo: overlayUndo, clearAll: overlayClearAll, eraseStroke } =
    useOverlayEmit(isOverlayMode ? fabricCanvas : null, roomId, shareId, screenSize);
  useCanvasSync(isOverlayMode ? null : fabricCanvas, syncState, roomId, isConnected);
  const { undo: historyUndo } = useHistory(isOverlayMode ? null : fabricCanvas, syncState);
  const undo = isOverlayMode ? overlayUndo : historyUndo;

  // Init Fabric canvas
  useEffect(() => {
    if (!canvasElRef.current) return;
    const { width: w, height: h } = screenSize;
    canvasElRef.current.width = w;
    canvasElRef.current.height = h;

    const fc = new fabric.Canvas(canvasElRef.current, {
      isDrawingMode: false,
      backgroundColor: 'transparent',
      selection: false,
      width: w,
      height: h,
    });
    fc.freeDrawingBrush = new fabric.PencilBrush(fc);
    fc.freeDrawingBrush.color = '#e03131';
    fc.freeDrawingBrush.width = 5;
    fc.freeDrawingBrush.decimate = 2;

    // Pin Fabric's generated wrapper behind the toolbar
    if (fc.wrapperEl) {
      fc.wrapperEl.style.cssText +=
        ';position:fixed!important;inset:0!important;z-index:1!important';
    }

    fabricRef.current = fc;
    setFabricCanvas(fc);
    return () => { fc.dispose(); fabricRef.current = null; setFabricCanvas(null); };
  }, [screenSize]);

  // Apply tool settings
  useEffect(() => {
    const fc = fabricCanvas;
    if (!fc) return;
    if (mode !== 'drawing') { fc.isDrawingMode = false; fc.selection = false; return; }

    if (activeTool === 'select') {
      fc.isDrawingMode = false; fc.selection = true;
    } else if (activeTool === 'pen') {
      fc.isDrawingMode = true; fc.selection = false;
      fc.freeDrawingBrush = new fabric.PencilBrush(fc);
      fc.freeDrawingBrush.color = strokeColor;
      fc.freeDrawingBrush.width = strokeWidth;
      fc.freeDrawingBrush.decimate = 2;
    } else if (activeTool === 'eraser') {
      fc.isDrawingMode = false; fc.selection = false;
    } else {
      fc.isDrawingMode = false; fc.selection = false;
    }
  }, [fabricCanvas, mode, activeTool, strokeColor, strokeWidth]);

  // Apply opacity to completed paths
  useEffect(() => {
    const fc = fabricCanvas;
    if (!fc) return;
    const onPathCreated = ({ path }) => { path.opacity = strokeOpacity; };
    fc.on('path:created', onPathCreated);
    return () => fc.off('path:created', onPathCreated);
  }, [fabricCanvas, strokeOpacity]);

  // Eraser
  useEffect(() => {
    const fc = fabricCanvas;
    if (!fc || activeTool !== 'eraser' || mode !== 'drawing') return;
    const onMouseDown = (opt) => {
      const target = fc.findTarget(opt.e);
      if (!target) return;
      if (isOverlayMode) { if (target._evoOverlay) eraseStroke(target); }
      else { fc.remove(target); fc.requestRenderAll(); }
    };
    fc.on('mouse:down', onMouseDown);
    return () => fc.off('mouse:down', onMouseDown);
  }, [fabricCanvas, activeTool, mode, isOverlayMode, eraseStroke]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'Escape') setActiveTool('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  // On mount: sync Electron window state with initial React mode
  useEffect(() => {
    const initialMode = isOverlayMode ? 'drawing' : 'working';
    window.electronAPI.setMode(initialMode);
    window.electronAPI.setIgnoreMouse(initialMode !== 'drawing');
  }, []);

  // Receive mode changes from global hotkey (main → renderer)
  useEffect(() => {
    return window.electronAPI.onModeChange((m) => setMode(m));
  }, []);

  const toggleMode = useCallback(() => {
    const next = mode === 'drawing' ? 'working' : 'drawing';
    setMode(next);
    window.electronAPI.setMode(next);
    window.electronAPI.setIgnoreMouse(next !== 'drawing');
  }, [mode]);

  const handleClearAll = useCallback(() => {
    if (isOverlayMode) { overlayClearAll(); }
    else {
      const fc = fabricRef.current;
      if (!fc) return;
      fc.getObjects().slice().forEach(obj => fc.remove(obj));
      fc.requestRenderAll();
    }
  }, [isOverlayMode, overlayClearAll]);

  const handleLeave = useCallback(() => {
    fabricRef.current?.dispose();
    fabricRef.current = null;
    onLeave();
  }, [onLeave]);

  // These two functions let UI elements opt-in to being interactive in working mode
  const onInteractiveEnter = () => window.electronAPI.setIgnoreMouse(false);
  const onInteractiveLeave = () => {
    if (mode === 'working') window.electronAPI.setIgnoreMouse(true);
  };

  return (
    <div className="overlay-root">
      <canvas ref={canvasElRef} />

      <div className={`mode-indicator ${mode}`}>
        <span className="mode-dot" />
        <span>{mode === 'drawing' ? 'Drawing' : 'Working'}</span>
      </div>

      <Toolbar
        hidden={mode === 'working'}
        onMouseEnter={onInteractiveEnter}
        onMouseLeave={onInteractiveLeave}
        activeTool={activeTool}
        onToolSelect={setActiveTool}
        strokeColor={strokeColor}
        onColorChange={setStrokeColor}
        strokeWidth={strokeWidth}
        onWidthChange={setStrokeWidth}
        strokeOpacity={strokeOpacity}
        onOpacityChange={setStrokeOpacity}
        strokeStyle={strokeStyle}
        onStyleChange={setStrokeStyle}
        onUndo={undo}
        // Note: no onToggleVoice / onToggleScreenShare → those buttons don't render
      >
        <div className="overlay-actions">
          <button className="tool-btn" title="Clear All" onClick={handleClearAll}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
          <button className="tool-btn exit-btn" title="Leave Room" onClick={handleLeave}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
      </Toolbar>

      <div
        className={`connection-status${isConnected ? ' connected' : roomError ? ' error' : ''}`}
        onMouseEnter={onInteractiveEnter}
        onMouseLeave={onInteractiveLeave}
      >
        <span className="conn-dot" />
        <span className="conn-text">
          {isConnected ? `${roomId} · ${connectedUsers.length + 1} online` : roomError || 'Connecting…'}
        </span>
      </div>

      <button
        className="mode-toggle-fab"
        title="Toggle drawing mode (Ctrl+Shift+D)"
        onClick={toggleMode}
        onMouseEnter={onInteractiveEnter}
        onMouseLeave={onInteractiveLeave}
      >
        {mode === 'drawing'
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        }
      </button>
    </div>
  );
}
```

---

## main.jsx — entry point

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './overlay.css';

createRoot(document.getElementById('root')).render(<App />);
```

---

## Step-by-step rebuild plan

### Step 1 — Delete old UI files
Delete everything inside `src/renderer/` **except** these hooks and services (which are correct):
- `hooks/useRoom.js`
- `hooks/useCanvasSync.js`
- `hooks/useHistory.js`
- `hooks/useOverlayEmit.js`
- `services/socket.js`
- `services/api.js`
- `App.jsx`
- `main.jsx`

### Step 2 — Copy Toolbar from web app
Copy from `apps/web/src/components/Toolbar/`:
- `toolDefinitions.jsx` → unchanged
- `PenOptionsPopup.jsx` → unchanged
- `Toolbar.jsx` → add `hidden`, `onMouseEnter`, `onMouseLeave`, `children` props (see above)
- `Toolbar.css` → change `toolbar-area` to `position: fixed`, add `backdrop-filter` to `.toolbar` and `.tool-options`

Put them in `src/renderer/components/Toolbar/`.

### Step 3 — Create overlay.css
Full content is in the "overlay.css — full file" section above.

### Step 4 — Create OverlayPage.jsx
Full content is in the "OverlayPage.jsx — full implementation" section above.

### Step 5 — Verify main.jsx
Should import `./overlay.css` and render `<App />`. No other changes needed.

---

## Critical bugs encountered (do not repeat these)

| Bug | Root cause | Fix |
|-----|-----------|-----|
| Toolbar never appears | `setMode('drawing')` IPC fires from App.jsx before OverlayPage mounts; listener not registered yet; message lost | Default `mode` to `'drawing'` when `isOverlayMode`; reinforce by calling `window.electronAPI.setMode()` in OverlayPage's own `useEffect` |
| Screen share video goes black | `overlayWindow.focus()` was called on drawing mode enter, stealing focus from browser | Never call `overlayWindow.focus()`. `setIgnoreMouseEvents(false)` alone is enough |
| WebSocket connection fails | Socket.IO tried WebSocket first in Electron renderer; handshake fails silently | Use `transports: ['polling', 'websocket']` — polling first always works |
| Desktop app blocks screen after launch | Landing page rendered with `setIgnoreMouse(false)` — whole overlay became click-blocking | Remove landing page; return `null` from App.jsx when no roomInfo; never call `setIgnoreMouse(false)` on init |
| App launches after Windows install | Squirrel fires one post-install launch without squirrel flags | Detect `--squirrel-firstrun` in process.argv and call `app.quit()` |
| Deep link lost on cold start | `handleDeepLink()` called `webContents.send()` before React mounted | Store as `pendingDeepLink` in main.js; renderer fetches via `ipcRenderer.invoke('overlay:get-pending-deep-link')` on mount |
| Canvas sync hooks never re-bind | Passed `fabricRef.current` (null on first render) instead of reactive state | Use `const [fabricCanvas, setFabricCanvas] = useState(null)` and pass the state variable |
| IPC listeners not cleaned up | `ipcRenderer.on()` returns the emitter, not a cleanup function | Capture handler: `const h = (_e, v) => cb(v); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h)` |
| Fabric wrapper covers toolbar | Fabric wraps `<canvas>` in `.canvas-container` div; absolute-positioned toolbar gets obscured | Use `position: fixed` on `.toolbar-area`; also force `.canvas-container { position: fixed; z-index: 1 }` via CSS |
| Toolbar invisible due to wrong stacking | Same Fabric wrapper issue | `fc.wrapperEl.style.cssText += ';position:fixed!important;inset:0!important;z-index:1!important'` after canvas init |

---

## Socket events reference

| Direction | Event | Purpose |
|-----------|-------|---------|
| desktop → server | `join_room_overlay` | Join room (uses JWT, no passcode) |
| desktop → server | `overlay:stroke:add` | Add annotation stroke |
| desktop → server | `overlay:stroke:remove` | Remove one stroke (undo/eraser) |
| desktop → server | `overlay:stroke:clear` | Clear all strokes |
| server → web clients | `overlay:stroke:added` | Relay stroke to web participants |
| server → web clients | `overlay:stroke:removed` | Relay removal |
| server → web clients | `overlay:stroke:cleared` | Relay clear |

### Stroke payload format

```js
socket.emit('overlay:stroke:add', {
  roomId,
  shareId,
  stroke: {
    id: 'unique-stroke-id',
    pathData: [...],      // SVG path segments, coords normalized to 0-1 range
    color: '#e03131',
    width: strokeWidth / screenWidth,   // also normalized
    opacity: 1,
  },
});
```

**Normalization is critical.** The web canvas maps these 0-1 coords relative to the screen-share proxy rect's dimensions. See `useOverlayEmit.js` for the normalization logic (already correct, do not change).

---

## IPC bridge reference (preload.js)

```js
window.electronAPI = {
  // main → renderer
  onModeChange: (cb) => cleanup_fn,
  onDeepLink: (cb) => cleanup_fn,
  onScreenInfo: (cb) => cleanup_fn,

  // renderer → main (fire and forget)
  setMode: (mode) => void,          // 'drawing' | 'working'
  setIgnoreMouse: (bool) => void,
  notifyRoomState: ({ inRoom }) => void,

  // renderer → main (request/response)
  getSettings: () => Promise<settings>,
  getPendingDeepLink: () => Promise<params | null>,
}
```
