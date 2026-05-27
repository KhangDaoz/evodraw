# EvoDraw Desktop

Electron-based always-on-top transparent overlay client for EvoDraw. Renders the same shared Fabric.js canvas as the web app, lets a presenter annotate directly on top of their screen, and locks its viewport to the screen-share proxy rect so strokes drawn by web viewers appear at the right pixel on the presenter's real screen.

## How it relates to the rest of the monorepo

```
web client ──Socket.IO── server ──Socket.IO── desktop overlay
                            ▲
                            └── MongoDB (snapshots, rooms)
```

Desktop is just another peer on the shared room canvas — no overlay-specific protocol. Everything goes through the same `canvas_op` / snapshot pipeline as the web client.

Launched on-demand: the web app emits an `evodraw://start?room=…&token=…&shareId=…` deep link when a user starts screen-sharing. The desktop process registers itself as the handler for the `evodraw://` URL scheme, opens a fullscreen transparent window over the presenter's screen, and joins the room with the embedded JWT.

## Architecture

```
main process (src/main.js)
├── single-instance lock + deep-link router (evodraw://)
├── transparent always-on-top BrowserWindow
├── tray icon + global hotkey (Ctrl+Shift+D)
├── click-through toggle via setIgnoreMouseEvents()
└── electron-store (settings persistence)
        │ IPC bridge (src/preload.js)
        ▼
renderer (src/renderer/)
├── App.jsx               waits for deep-link, then mounts OverlayPage
├── pages/OverlayPage.jsx room + canvas wiring; viewport-lock effect
├── components/
│   ├── Canvas/           wraps Fabric canvas + hook composition
│   ├── Toolbar/          drawing tools (pen, eraser, shapes, …)
│   ├── ChatPanel/
│   └── SettingsPanel/
├── hooks/
│   ├── useOverlayCanvas  fabric.Canvas sized to screen, transparent
│   ├── useCanvasSync     joins room: snapshot + canvas_op + peer state
│   ├── useDrawingTools   pen / eraser / shapes / arrows
│   ├── useOverlayPanZoom right-click pan, wheel zoom, "0" reset
│   ├── useHistory        undo/redo on sceneVersion
│   ├── useRoom           Socket.IO connect + join_room_overlay
│   └── useChat
├── services/socket.js    socket.io-client wrapper
└── utils/canvasSerializer.js  LWW + custom-prop preservation
```

### Working vs. Drawing mode

The overlay window has two modes (toggled by hotkey or tray menu):

- **Working** (default): `setIgnoreMouseEvents(true)` — clicks pass straight through to whatever is underneath. Toolbar is hidden. The user keeps using their apps; only the strokes from the shared canvas are painted on top.
- **Drawing**: `setIgnoreMouseEvents(false)` — the window captures the mouse. Toolbar appears. The user can draw / select / erase.

The mode-toggle FAB and the global hotkey both call `window.electronAPI.setMode(...)` which round-trips to the main process.

### Viewport lock + Snap button

When the overlay launches with a `shareId`, [`OverlayPage`](src/renderer/pages/OverlayPage.jsx) computes a viewport transform that maps the proxy rect's scene bounds onto the desktop's full screen:

```
viewportTransform = [
  screenW / rectW,   0,
  0,                 screenH / rectH,
  -rectLeft * sx,    -rectTop * sy,
]
```

That way a stroke drawn by a web viewer at scene `(rectLeft + dx, rectTop + dy)` lands at desktop pixel `(dx * sx, dy * sy)` — i.e. at the screen position the presenter sees underneath the overlay.

The lock follows the rect when a web user drags or resizes it (via Fabric's `after:render` event with sig caching, since `applyRemoteOp` mutates objects silently).

When the desktop user pans or zooms, the lock releases (`viewportLocked = false`). A **Snap** FAB in the bottom-right reapplies the lock.

### Screen-capture invisibility

`overlayWindow.setContentProtection(true)` prevents the overlay's own surface from being captured. Without this, a presenter who shares "Entire screen" while the overlay is up would record the overlay into the outgoing video, creating an infinite-mirror feedback.

## Development

From the monorepo root:

```bash
npm install               # workspace install
npm run dev               # runs web + server + desktop concurrently
npm run dev:desktop       # desktop only
```

Or from this directory:

```bash
npm start
```

Electron Forge handles bundling via Vite (`vite.main.config.mjs`, `vite.preload.config.mjs`, `vite.renderer.config.mjs`). HMR works for the renderer.

### Launching via deep link in dev

The web app's "Open in EvoDraw" button generates an `evodraw://start?…` URL. For the protocol to resolve to a running Electron dev instance, the OS needs the handler registered — Forge does this on first run. On Windows you may need to `npm run make` once and run the produced installer to register the protocol globally.

For local iteration without the full handshake, paste the deep-link URL into a browser address bar; the OS will hand it to the dev instance via the single-instance lock.

### Settings

Persisted with `electron-store` (no `.env` needed):

| Key                | Default                       | Purpose                              |
| ------------------ | ----------------------------- | ------------------------------------ |
| `hotkey`           | `CommandOrControl+Shift+D`    | Toggle drawing mode                  |
| `defaultColor`     | `#e03131`                     | Initial pen color                    |
| `defaultWidth`     | `4`                           | Initial stroke width                 |
| `toolbarPosition`  | `right`                       | Toolbar anchor                       |
| `serverUrl`        | `DEFAULT_SERVER_URL` env or `http://localhost:4000` | Backend URL    |
| `username`         | `''`                          | Last-used display name               |

`DEFAULT_SERVER_URL` is read from a `.env` file in this directory at startup (loaded via `dotenv`). It only seeds the initial `serverUrl` setting; subsequent deep links override it.

## Build / package

```bash
npm run package -w apps/desktop   # build executable into apps/desktop/out/
npm run make -w apps/desktop      # produce installer (Squirrel on Windows, ZIP elsewhere)
```

The Squirrel installer registers the `evodraw://` protocol; ZIP builds do not.

## Sync protocol cheat sheet

| Event                    | Direction         | Purpose                                  |
| ------------------------ | ----------------- | ---------------------------------------- |
| `join_room_overlay`      | client → server   | Authenticated join (JWT, no passcode)    |
| `request_snapshot`       | client → server   | Pull latest MongoDB snapshot for room    |
| `snapshot_loaded`        | server → client   | Snapshot delivery                        |
| `canvas_state_request`   | client → peers    | Ask for live in-memory canvas (includes screen-share rects) |
| `canvas_state_response`  | peer → server     | Peer-to-peer fallback / live extras      |
| `canvas_state_init`      | server → client   | Forwarded peer state                     |
| `canvas_op`              | client → server   | Single add/modify/remove                 |
| `canvas_op_received`     | server → clients  | Broadcast canvas op                      |
| `save_snapshot`          | client → server   | Periodic persistence (every 10s when dirty) |
| `screen:stopped`         | server → clients  | Presenter ended share; overlay auto-leaves |

LWW reconciliation lives in [`utils/canvasSerializer.js`](src/renderer/utils/canvasSerializer.js): every Fabric object carries `_evoId` / `_evoVersion` / `_evoNonce`; higher version wins, ties broken by lower nonce. Screen-share rects (`_evoScreenShare: true`) are excluded from persisted snapshots but included in peer-state responses, so the proxy rect reaches the desktop overlay even though MongoDB never stores it.

## Known gotchas

- **Fabric v6 `toJSON(props)` ignores its argument.** Use `toObject(props)` when you need custom properties (`_evoScreenShare`, `_evoShareId`, `_evoImage`) preserved across the wire. `serializeObject()` in [`canvasSerializer.js`](src/renderer/utils/canvasSerializer.js) already does this.
- **Multiple overlay windows aren't supported.** A single-instance lock in `main.js` forwards subsequent deep links to the existing process; secondary launches are silently merged.
- **`applyRemoteOp` doesn't fire Fabric's `object:modified` event.** Mutations from canvas_ops are silent (`target.set` + `setCoords`). Anything that needs to react to remote changes (e.g. the viewport-lock effect) hooks `canvas.on('after:render', …)` and caches a signature to avoid loops.
