# 🏗️ Implementation Plan: Desktop Overlay for Screen Share Drawing

## Decision Summary

| Decision | Choice |
|----------|--------|
| **Approach** | Electron desktop overlay (Option A) — rebuilt from scratch |
| **Hotkey** | Customizable, default `Ctrl+Shift+D` |
| **Drawing scope** | Strokes are scoped to the screen share video rect |
| **Coordinate system** | Normalized (0–1) for resolution independence |
| **Sync protocol** | Socket.io `overlay:stroke` events (separate from canvas ops) |
| **Activation** | Deep link `evodraw://overlay?room=X&token=Y` from web app |

---

## Architecture Overview

```
┌── PRESENTER'S SCREEN ────────────────────────────────────────────┐
│                                                                   │
│  ┌── Shared Application (PowerPoint, VS Code, etc.) ──────────┐  │
│  │                                                              │  │
│  │   ┌── Electron Overlay Window (transparent, topmost) ─────┐ │  │
│  │   │                                                        │ │  │
│  │   │   Fabric.js canvas (full screen, transparent bg)       │ │  │
│  │   │   • Drawing mode: captures pen/mouse input             │ │  │
│  │   │   • Working mode: click-through (ignoreMouseEvents)    │ │  │
│  │   │                                                        │ │  │
│  │   │   ┌─ Mini Toolbar (draggable) ──────────────────────┐  │ │  │
│  │   │   │ [✏️ Pen] [🎨 Color] [↔️ Width] [🧹 Clear] [⚙️]  │  │ │  │
│  │   │   └────────────────────────────────────────────────┘  │ │  │
│  │   │                                                        │ │  │
│  │   │   ┌─ Mode Indicator ──┐                                │ │  │
│  │   │   │ 🟢 WORKING MODE   │  ← or 🔴 DRAWING MODE         │ │  │
│  │   │   └──────────────────┘                                │ │  │
│  │   └────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│        ↓ Socket.io (overlay:stroke:add / overlay:stroke:clear)    │
│                                                                   │
│  ┌── Node.js Server ──────────────────────────────────────────┐   │
│  │  Broadcasts overlay:stroke events to room                   │   │
│  └──────────────────────────────────────────────────────────────┘  │
│        ↓                                                          │
│  ┌── Web App (Viewers) ────────────────────────────────────────┐  │
│  │  Canvas receives strokes → renders on screen share rect      │  │
│  │  Strokes use normalized coords → mapped to proxy rect size   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Desktop App Foundation

> Rebuild `apps/desktop` from scratch using Electron Forge + Vite

### Task 1.1: Initialize Electron Forge Project

- [ ] Create `package.json` with Electron Forge + Vite plugin
- [ ] Set up `forge.config.cjs` with:
  - Squirrel Windows maker
  - Protocol handler: `evodraw://`
  - Auto-update config placeholder
- [ ] Create directory structure:
  ```
  apps/desktop/
  ├── package.json
  ├── forge.config.cjs
  ├── vite.main.config.mjs
  ├── vite.preload.config.mjs
  ├── vite.renderer.config.mjs
  ├── src/
  │   ├── main.js          ← Electron main process
  │   ├── preload.js       ← Context bridge
  │   └── renderer/
  │       ├── index.html
  │       ├── overlay.js   ← Drawing canvas logic
  │       ├── overlay.css
  │       ├── toolbar.js   ← Floating mini toolbar
  │       └── settings.js  ← Hotkey customization
  ```

### Task 1.2: Main Process (`main.js`)

- [ ] Create transparent, frameless, always-on-top BrowserWindow
  - `transparent: true`, `frame: false`, `alwaysOnTop: true`
  - `fullscreen: true` (or fullscreenable with manual sizing)
  - `skipTaskbar: true`
  - `resizable: false`
- [ ] Register customizable global shortcut (default: `Ctrl+Shift+D`)
  - Toggle `win.setIgnoreMouseEvents(true/false)` 
  - When **working mode**: `setIgnoreMouseEvents(true, { forward: true })` — overlay is invisible to mouse
  - When **drawing mode**: `setIgnoreMouseEvents(false)` — overlay captures input
- [ ] Handle `evodraw://` protocol deep links
  - Parse `room`, `token`, `serverUrl` from URL
  - Pass to renderer via IPC
- [ ] IPC handlers:
  - `overlay:set-mode` — toggle working/drawing
  - `overlay:get-settings` — return saved hotkey config
  - `overlay:save-settings` — persist hotkey to electron-store
  - `overlay:quit` — close overlay
- [ ] Tray icon with right-click menu:
  - Toggle drawing mode
  - Settings
  - Quit

### Task 1.3: Preload Script (`preload.js`)

- [ ] `contextBridge.exposeInMainWorld('electronAPI', { ... })`
  - `onModeChange(callback)` — main tells renderer mode changed
  - `onDeepLink(callback)` — deep link received
  - `setMode(mode)` — renderer requests mode change
  - `getSettings()` / `saveSettings(settings)` — hotkey config
  - `quit()` — close app

### Task 1.4: Protocol Registration

- [ ] Register `evodraw://` as default protocol handler
  - Windows: registry via Electron Forge Squirrel
  - Dev mode: `app.setAsDefaultProtocolClient('evodraw')`
- [ ] Handle `open-url` event (macOS) and `second-instance` (Windows)

---

## Phase 2: Overlay Renderer (Drawing Canvas)

### Task 2.1: Drawing Canvas (`overlay.js`)

- [ ] Initialize Fabric.js canvas covering full screen
  - Transparent background (`backgroundColor: 'transparent'`)
  - `selection: false` (no object selection, freehand only)
- [ ] Drawing tools:
  - **Pen** — freehand drawing (Fabric PencilBrush)
  - **Highlighter** — semi-transparent wide brush
  - **Eraser** — object eraser (remove strokes)
  - **Arrow** — quick annotation arrow
  - **Text** — click to add text annotation
- [ ] Stroke serialization:
  - On `path:created` → serialize path with normalized coordinates (0–1)
  - Emit via Socket.io: `overlay:stroke:add { roomId, shareId, stroke }`
- [ ] Mode indicator:
  - **Working mode**: Show small green pill "🟢 Working" (non-intrusive)
  - **Drawing mode**: Show red pill "🔴 Drawing" + cursor changes to crosshair
- [ ] Clear all strokes button → emits `overlay:stroke:clear { roomId, shareId }`

### Task 2.2: Coordinate Normalization

```
Overlay pixel coords → Normalized (0–1) → Web app maps to video rect

Example:
  Screen: 1920x1080
  Stroke point: (960, 540)
  Normalized: (0.5, 0.5)
  
  Web app video rect: 640x360 at canvas position (100, 100)
  Mapped point: (100 + 640*0.5, 100 + 360*0.5) = (420, 280)
```

- [ ] `normalizeCoords(path, screenW, screenH)` — converts px → 0–1
- [ ] `denormalizeCoords(path, rectW, rectH, rectLeft, rectTop)` — converts 0–1 → canvas coords

### Task 2.3: Floating Mini Toolbar (`toolbar.js`)

- [ ] Draggable toolbar (HTML, not Fabric) positioned at screen edge
- [ ] Controls:
  - Pen tool (active by default)
  - Color picker (preset swatches + custom)
  - Stroke width slider (2px, 4px, 8px, 12px)
  - Eraser
  - Undo (local only)
  - Clear all
  - Settings gear icon (opens hotkey config)
  - Exit button
- [ ] Toolbar auto-hides in working mode, shows on drawing mode
- [ ] Toolbar must NOT be captured by screen share (always on top of overlay)

### Task 2.4: Settings & Hotkey Customization (`settings.js`)

- [ ] Small settings modal (overlay-local)
- [ ] Hotkey capture: "Press your desired shortcut..."
  - Record key combo
  - Validate no conflicts
  - Save via IPC → `electron-store`
- [ ] Persisted settings:
  - `hotkey` (default: `Ctrl+Shift+D`)
  - `defaultColor` (default: `#e03131`)
  - `defaultWidth` (default: 4)
  - `toolbarPosition` (default: `right`)

---

## Phase 3: Server-Side Overlay Stroke Protocol

### Task 3.1: New Socket Handler (`overlay.handler.js`)

- [ ] Create `apps/server/src/sockets/overlay.handler.js`
- [ ] Events:
  ```
  overlay:stroke:add    → broadcast to room
  overlay:stroke:remove → broadcast to room  
  overlay:stroke:clear  → broadcast to room
  overlay:stroke:undo   → broadcast to room
  ```
- [ ] Payload shape:
  ```js
  {
    roomId: string,
    shareId: string,  // which screen share this stroke belongs to
    stroke: {
      id: string,     // unique stroke ID
      type: 'path' | 'arrow' | 'text',
      points: [[x, y], ...],  // normalized 0–1
      color: string,
      width: number,
      opacity: number,
      // For text: { text, fontSize, x, y }
    }
  }
  ```
- [ ] Register in main socket setup

### Task 3.2: Register Handler

- [ ] Import and register in `apps/server/src/sockets/index.js` (or wherever handlers are registered)

---

## Phase 4: Web App — Receiving & Rendering Overlay Strokes

### Task 4.1: New Hook `useOverlayStrokes.js`

- [ ] Create `apps/web/src/hooks/useOverlayStrokes.js`
- [ ] Listen for `overlay:stroke:add`, `overlay:stroke:remove`, `overlay:stroke:clear`
- [ ] Maintain stroke state per shareId
- [ ] Render strokes as Fabric objects positioned relative to the screen share proxy rect:
  ```js
  // Denormalize: normalized coords → canvas scene coords
  const proxyRect = findScreenShareRect(canvas, shareId)
  const rectW = proxyRect.width * proxyRect.scaleX
  const rectH = proxyRect.height * proxyRect.scaleY
  
  stroke.points.forEach(([nx, ny]) => {
    const canvasX = proxyRect.left + nx * rectW
    const canvasY = proxyRect.top + ny * rectH
    // ... build Fabric path at these coords
  })
  ```
- [ ] Mark overlay strokes with `_evoOverlayStroke = true` so they:
  - Move with the proxy rect (bind to rect position)
  - Are excluded from undo history
  - Are excluded from snapshot persistence
  - Are excluded from eraser tool
- [ ] Cleanup strokes when screen share ends

### Task 4.2: Bind Strokes to Proxy Rect Movement

- [ ] When the screen share proxy rect moves/scales, reposition all bound overlay strokes
- [ ] Use Fabric's `group` or manual coordinate rebinding on `moving`/`scaling` events

### Task 4.3: Web App Deep Link Trigger

- [ ] When presenter starts screen sharing in the web app:
  - Show "Open Desktop Overlay" button in the toolbar
  - On click: `window.open('evodraw://overlay?room=${roomCode}&shareId=${shareId}&server=${serverUrl}')`
  - Fallback: show instructions if desktop app not installed

---

## Phase 5: Integration & Polish

### Task 5.1: Desktop ↔ Web Connection

- [ ] Desktop overlay connects to same Socket.io server as web app
- [ ] Authenticate using the room's passcode (passed via deep link)
- [ ] Desktop overlay emits `overlay:stroke:add` → server broadcasts → all web clients render

### Task 5.2: Visual Indicators

- [ ] Web app shows "✏️ [username] is annotating" when overlay strokes arrive
- [ ] Mode indicator on desktop overlay:
  - Working mode: small unobtrusive green dot
  - Drawing mode: red border glow around screen edges + crosshair cursor

### Task 5.3: Edge Cases

- [ ] Multi-monitor: overlay covers primary monitor only (MVP)
- [ ] Screen share ends while overlay is active → auto-cleanup
- [ ] Network disconnect → reconnect logic
- [ ] Multiple presenters annotating simultaneously → strokes scoped by shareId

---

## File Manifest

### New Files (Desktop)
| File | Purpose |
|------|---------|
| `apps/desktop/package.json` | Electron Forge project config |
| `apps/desktop/forge.config.cjs` | Forge build/maker config |
| `apps/desktop/vite.main.config.mjs` | Vite config for main process |
| `apps/desktop/vite.preload.config.mjs` | Vite config for preload |
| `apps/desktop/vite.renderer.config.mjs` | Vite config for renderer |
| `apps/desktop/src/main.js` | Main process: window, hotkey, IPC, protocol |
| `apps/desktop/src/preload.js` | Context bridge for renderer |
| `apps/desktop/src/renderer/index.html` | Overlay HTML shell |
| `apps/desktop/src/renderer/overlay.js` | Fabric.js drawing canvas |
| `apps/desktop/src/renderer/overlay.css` | Overlay styles |
| `apps/desktop/src/renderer/toolbar.js` | Floating mini toolbar |
| `apps/desktop/src/renderer/settings.js` | Hotkey customization UI |

### New Files (Server)
| File | Purpose |
|------|---------|
| `apps/server/src/sockets/overlay.handler.js` | Overlay stroke socket events |

### New Files (Web)
| File | Purpose |
|------|---------|
| `apps/web/src/hooks/useOverlayStrokes.js` | Receive & render overlay strokes |

### Modified Files
| File | Change |
|------|--------|
| `apps/server/src/sockets/index.js` (or equivalent) | Register overlay handler |
| `apps/web/src/components/Toolbar/Toolbar.jsx` | Add "Open Overlay" button |
| `apps/web/src/hooks/useScreenShare.js` | Pass shareId to overlay trigger |
| `apps/web/src/pages/RoomPage/RoomPage.jsx` | Wire useOverlayStrokes hook |
| `apps/web/src/utils/screenShareObject.js` | Bind overlay strokes to proxy rect |

---

## Implementation Order

| # | Task | Est. Time | Dependencies |
|---|------|-----------|--------------|
| 1 | Phase 1: Desktop app scaffold (Electron Forge + Vite) | 1h | None |
| 2 | Phase 1: Main process (window, hotkey, IPC, protocol) | 2h | Task 1 |
| 3 | Phase 2: Drawing canvas + coordinate normalization | 2h | Task 2 |
| 4 | Phase 2: Floating toolbar + settings | 1.5h | Task 3 |
| 5 | Phase 3: Server overlay handler | 0.5h | None |
| 6 | Phase 4: Web hook for overlay strokes | 1.5h | Task 5 |
| 7 | Phase 4: Deep link trigger in web UI | 0.5h | Task 2 |
| 8 | Phase 5: Integration testing & polish | 1.5h | All |
| **Total** | | **~10h** | |

---

> [!IMPORTANT]
> **Start with Phase 1 (Task 1.1 + 1.2)** — getting the Electron window + hotkey toggle working is the foundation everything else depends on.
