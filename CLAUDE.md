# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all three apps concurrently (web, server, desktop)
npm run dev

# Run individual apps
npm run dev:web        # Vite dev server → http://localhost:5173
npm run dev:server     # nodemon → http://localhost:4000
npm run dev:desktop    # Electron Forge

# Build / lint web
npm run build -w apps/web
npm run lint -w apps/web

# Package desktop app (produces .exe)
npm run make -w apps/desktop
```

There are no automated tests configured in this repo.

## Architecture Overview

EvoDraw is a real-time collaborative whiteboard. The monorepo (`npm workspaces`) has three apps:

| App | Tech | Purpose |
|-----|------|---------|
| `apps/web` | React 19 + Vite + Fabric.js | Browser whiteboard client |
| `apps/server` | Express 5 + Socket.IO + MongoDB | Relay, persistence, auth |
| `apps/desktop` | Electron + Fabric.js | Screen-annotation overlay |

### Data flow

```
web client ──Socket.IO──► server ──Socket.IO broadcast──► other web clients
                                                         └──► desktop overlay
web client ──REST──► server ──► MongoDB (room state)
                             └──► Firebase Storage (images)
web client ──LiveKit SDK──► LiveKit SFU (voice/video/screen tracks)
desktop ──────────────── launched via evodraw:// deep link from web
```

### apps/server

`src/server.js` is the entry point — Express + Socket.IO share one HTTP server. Socket handlers are registered in `src/sockets/`:

- `room.handler.js` — join/leave room, user list
- `draw.handler.js` — canvas ops, cursor positions, snapshots
- `chat.handler.js` — chat messages and LiveKit token generation
- `screen.handler.js` — screen share session lifecycle
- `overlay.handler.js` — desktop overlay stroke relay

Authentication uses JWT (24h expiry, secret `TOKEN_SECRET`). Room passcodes are bcrypt-hashed in MongoDB. Rooms auto-delete after 24h via a MongoDB TTL index on `updatedAt`.

**Required `.env` in `apps/server/`:**
```
PORT=4000
MONGODB_URI=
TOKEN_SECRET=
ALLOWED_ORIGINS=http://localhost:5173
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
FIREBASE_STORAGE_BUCKET=
```

### apps/web

`src/pages/RoomPage/RoomPage.jsx` is the root component; all feature logic lives in hooks under `src/hooks/`. The component tree is thin — hooks own all state.

Key hooks:

| Hook | Responsibility |
|------|---------------|
| `useRoom.js` | Socket.IO connection lifecycle, user list |
| `useCanvasSync.js` | Serialize/deserialize Fabric ops over Socket.IO |
| `useDrawingTools.js` | Fabric brush, shapes, arrows, eraser |
| `useHistory.js` | Undo/redo with sceneVersion |
| `useLiveKitRoom.js` | LiveKit SFU connection for voice/video |
| `useScreenShare.js` | Screen capture + DOM video + Fabric proxy rect |
| `useOverlayStrokes.js` | Receives desktop overlay strokes and renders them |
| `useRemoteCursors.js` | Other users' cursor positions |
| `useInfiniteCanvas.js` | Pan/zoom viewport |
| `useImagePasting.js` | Clipboard paste → Firebase upload → Fabric image |

**Vite env vars expected** (prefix `VITE_`): `VITE_SERVER_URL`, `VITE_API_URL`.

### Canvas Sync — LWW conflict resolution (`src/utils/canvasSerializer.js`)

Every Fabric object carries three metadata properties:
- `_evoId` — stable UUID (timestamp + counter + random)
- `_evoVersion` — integer bumped on every local mutation
- `_evoNonce` — random tiebreaker for same-version conflicts

`shouldAcceptRemote(local, remote)`: accept if `remote._evoVersion > local._evoVersion`, or if equal and `remote._evoNonce < local._evoNonce` (deterministic, lower nonce wins).

`attachSerializer()` hooks Fabric events (`object:added/modified/removed`) and emits `canvas_op` Socket.IO events. `applyRemoteOp()` applies incoming ops using LWW reconciliation without re-emitting. The `state._applying` flag prevents echo loops.

Special object flags:
- `_evoScreenShare: true` — proxy rect for a video overlay; excluded from snapshots by default
- `_evoImage: true` — uploaded image; immune to eraser
- `_evoDrawing: true` — in-progress shape, skipped by serializer

Periodic snapshot push (every 10s when `canvas._evoIsDirty`) via `save_snapshot` event stores elements + sceneVersion in MongoDB.

### Screen Sharing (two-layer rendering)

1. **Bottom**: native `<video>` DOM element positioned over the canvas absolutely
2. **Top**: near-invisible Fabric proxy `Rect` (`fill: 'rgba(0,0,0,0.005)'`) that makes the video region draggable/resizable

The proxy rect syncs its position to the DOM video element on every Fabric render tick (`syncOverlayPosition()`). LiveKit SFU delivers tracks to viewers; when `TrackSubscribed` fires the viewer calls `setupOverlay()` to mount its own `<video>` and locate or create the proxy rect.

### apps/desktop

An Electron app that launches as an always-on-top transparent overlay. Launched from the web app via `evodraw://overlay?room=…&shareId=…&token=…` deep link.

- `src/main.js` — main process: single-instance lock, deep-link handler, tray icon, mode toggle (Working = click-through / Drawing = interactive), global hotkey (Ctrl+Shift+D)
- `src/renderer/overlay.js` — Fabric canvas fullscreen, draws strokes, emits `overlay:stroke:add` with normalized coordinates (0–1 range)
- `src/preload.js` — context isolation bridge (IPC between main and renderer)

Overlay strokes use normalized coordinates so they scale to any screen resolution.

## Socket.IO Event Reference

| Direction | Event | Purpose |
|-----------|-------|---------|
| client→server | `join_room` | Enter a room |
| server→clients | `room_users` | Updated user list |
| client→server | `canvas_op` | Single element add/modify/remove |
| server→clients | `canvas_op_received` | Broadcast canvas op to other clients |
| client→server | `save_snapshot` | Persist full canvas to MongoDB |
| client→server | `canvas_state_request` | Request snapshot from a peer |
| peer→peer | `canvas_state_response` | Peer sends snapshot |
| client→server | `livekit:get-token` | Request LiveKit JWT (callback) |
| client→server | `screen:start` / `screen:stop` | Screen share session |
| client→server | `overlay:stroke:add` | Desktop overlay stroke |
| server→clients | `overlay:stroke:added` | Relay overlay stroke to web clients |
