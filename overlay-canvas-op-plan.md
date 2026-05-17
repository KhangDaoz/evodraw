# Plan: Migrate Overlay Strokes to canvas_op (Shared Canvas)

## Context

Overlay strokes currently use a dedicated `overlay:stroke:*` Socket.IO protocol that bypasses
the existing canvas_op pipeline. This means no LWW conflict resolution, no snapshot persistence,
no late-joiner sync, and no mid-stroke live preview. The fix: treat overlay strokes as regular
canvas_op objects. The coordinate mismatch (desktop screen-pixels vs web canvas-space) is solved
by storing 0-1 normalized path data in `_evoNormalizedPath` as a custom prop on each stroke object.

## Coordinate Strategy

The 0-1 normalization is NOT eliminated — it is consolidated into a single custom prop
(`_evoNormalizedPath`) that travels with the object everywhere:

```
Desktop draws (screen px) → normalizePath() → 0-1 path
→ emit canvas_op { type: 'object:added', object: { _evoOverlay:true, _evoNormalizedPath:[0-1], _evoShareId, path:[0-1], ... } }
→ Server broadcasts via draw.handler (canvas_op_received)

Web (useOverlayStrokes):
  intercepts canvas_op_received where op.object._evoOverlay === true
  → finds proxyRect by _evoShareId, calls createStrokeObject() (reuses existing denorm logic)
  → adds canvas-space Fabric path to canvas
  → canvas-space path persists in snapshot automatically (no _evoScreenShare flag → passes serializeCanvas filter)

Desktop inbound (from web peer's overlay stroke):
  intercepts canvas_op_received where op.object._evoOverlay === true
  → uses _evoNormalizedPath * screenW/H to create screen-pixel Fabric path

Late-joiner sync:
  snapshot includes canvas-space overlay paths (they pass the existing filter)
  proxy rect also included (serializeCanvas is called with includeScreenShares:true on state_request)
  paths render at correct position immediately on snapshot load
```

---

## Files to Change

### 1. `apps/web/src/utils/canvasSerializer.js`

- **`CUSTOM_PROPS`** (line 4): add `'_evoOverlay'`, `'_evoShareId'`, `'_evoNormalizedPath'`, `'_evoStrokeId'`
- **`deserializeObject`** (lines 72-85): restore the four new props from JSON (same pattern as existing `_evoScreenShare` restores)
- **`applyRemoteOp` — `object:added` branch** (line 167): add early return so `useOverlayStrokes` owns placement:
  ```js
  if (op.object?._evoOverlay) return  // useOverlayStrokes handles placement
  ```
  `object:removed` and `object:modified` for overlay strokes still flow through normally.
- **`isOverlayStroke` in `attachSerializer`** (line 105): keep `_evoOverlay` excluded — web display paths have canvas-space coords and must not be re-broadcast.

---

### 2. `apps/web/src/hooks/useOverlayStrokes.js`

- **Replace** `socket.on('overlay:stroke:added', ...)` with `socket.on('canvas_op_received', onRemoteOp)`:
  ```js
  const onRemoteOp = ({ op }) => {
    if (op.type !== 'object:added') return
    if (!op.object?._evoOverlay) return
    if (op.object._evoShareId !== shareId) return
    const proxyRect = findProxyRect(op.object._evoShareId)
    if (!proxyRect) return
    // reuse existing createStrokeObject (expects stroke.pathData = _evoNormalizedPath)
    const fabricObj = createStrokeObject({ ...op.object, pathData: op.object._evoNormalizedPath }, proxyRect)
    if (!fabricObj) return
    fabricObj._evoId      = op.object._evoId
    fabricObj._evoVersion = op.object._evoVersion
    fabricObj._evoNonce   = op.object._evoNonce
    fabricObj._evoOverlay = true
    strokeMapRef.current.get(shareId)?.set(op.object._evoStrokeId, fabricObj)
    canvas.add(fabricObj)
    canvas.requestRenderAll()
  }
  ```
- **Remove** `overlay:stroke:removed` and `overlay:stroke:cleared` listeners — `object:removed` canvas_ops are handled by `applyRemoteOp` automatically (finds by `_evoId`).
- **Keep** `screen:stopped` cleanup, `object:modified` repositioning, `annotatingUser` state.

---

### 3. `apps/desktop/src/renderer/hooks/useOverlayEmit.js`

- **`onPathCreated`**: replace `socket.emit('overlay:stroke:add', ...)` with `canvas_op`:
  ```js
  const strokeId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const _evoId   = `${Date.now()}-${++_idCounter}-${Math.random().toString(36).slice(2, 7)}`
  const pathData = normalizePath(path)
  socket.emit('canvas_op', {
    roomId,
    op: {
      type: 'object:added',
      object: {
        type: 'path',
        path: pathData,
        _evoOverlay: true,
        _evoShareId: shareId,
        _evoNormalizedPath: pathData,
        _evoStrokeId: strokeId,
        _evoId,
        _evoVersion: 1,
        _evoNonce: Math.floor(Math.random() * 1073741824),
        stroke: path.stroke,
        strokeWidth: path.strokeWidth / screenSize.width,
        opacity: path.opacity || 1,
        strokeLineCap: path.strokeLineCap || 'round',
        strokeLineJoin: path.strokeLineJoin || 'round',
        fill: null,
      }
    }
  })
  strokeHistoryRef.current.push({ evoId: _evoId, strokeId })
  ```
- **Inbound `canvas_op_received`** (replaces `overlay:stroke:added` listener):
  ```js
  socket.on('canvas_op_received', ({ op }) => {
    if (op.type !== 'object:added' || !op.object?._evoOverlay) return
    if (op.object._evoShareId !== shareId) return
    if (canvas.getObjects().some(o => o._evoId === op.object._evoId)) return
    const { width: screenW, height: screenH } = screenSize
    const denormalized = op.object._evoNormalizedPath.map(seg =>
      seg.map((val, i) => i === 0 ? val : i % 2 === 1 ? val * screenW : val * screenH)
    )
    const svgPath = denormalized.map(seg => seg.join(' ')).join(' ')
    const p = new fabric.Path(svgPath, {
      stroke: op.object.stroke,
      strokeWidth: Math.max(1, (op.object.strokeWidth || 0.005) * screenW),
      fill: null, selectable: false, evented: false,
      opacity: op.object.opacity || 1,
      strokeLineCap: op.object.strokeLineCap || 'round',
      strokeLineJoin: op.object.strokeLineJoin || 'round',
    })
    p._evoOverlay = true
    p._evoId = op.object._evoId
    canvas.add(p)
    canvas.requestRenderAll()
  })
  ```
- **`undo`**: replace `overlay:stroke:remove` emit with:
  ```js
  socket.emit('canvas_op', { roomId, op: { type: 'object:removed', id: last.evoId } })
  ```
- **`eraseStroke`** / **`clearAll`**: same — emit `canvas_op` `object:removed` per stroke.
- Remove `overlay:stroke:removed` / `overlay:stroke:cleared` listeners.

---

### 4. `apps/server/src/sockets/overlay.handler.js`

- **Delete file** — `canvas_op` events are already relayed by `draw.handler.js`.
- Remove `registerOverlayHandlers` import and call from `server.js`.

---

## Verification

| Benefit | How to test |
|---|---|
| Persistence | Draw overlay strokes → refresh web page → strokes still visible |
| Late-joiner sync | Open second browser tab after drawing → overlay strokes appear |
| LWW conflict resolution | Two users draw simultaneously → no duplicates |
| Undo propagation | Desktop Ctrl+Z → stroke disappears on web |
| Eraser sync | Eraser on desktop → stroke disappears on web |

---

## Out of Scope

- **Live mid-stroke preview**: emit `canvas_op` with `_evoDrawing: true` on `mouse:move` — separate PR.
- **Batch clear**: `clearAll` emits N `object:removed` ops for now, not a single sweep event.
- **Snapshot repositioning after proxy rect move on late-join**: `_evoNormalizedPath` is stored for this; the existing `object:modified` repositioning in `useOverlayStrokes` handles the dynamic case.
