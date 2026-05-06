# Screen Share Bug Analysis

## Background: What Worked in `a524fee`

In commit `a524fee`, screen sharing worked correctly. The implementation was simple:

```
startSharing():
  1. getDisplayMedia()          ← captures screen
  2. publishTrack() to LiveKit  ← viewers subscribe via TrackSubscribed
  3. socket.emit('screen:start') ← metadata to room
  4. create local <video>        ← presenter sees overlay
```

The `useLiveKitRoom` hook at `a524fee` had deps `[room, roomId, username]` and called `room.disconnect()` synchronously in its cleanup. This worked because the token/connect happened fast enough and username was stable after initial render.

---

## What Changed After `a524fee` (Current Working Tree)

Three files have non-trivial changes that affect the screen share + LiveKit flow:

### 1. `useLiveKitRoom.js` — Deferred Disconnect

**Why it was changed:** When `username` was in the effect deps `[room, roomId, username]`, any username state update caused `room.disconnect()` to fire, then immediately reconnect. If `publishTrack` was in-flight during that disconnect, it crashed with *"could not createOffer with closed peer connection"*.

The fix: remove `username` from deps, use a ref for the current username value, and defer the disconnect by 150ms so React Strict Mode's double-invoke can cancel the timer before it fires.

**The bug this introduced (React Strict Mode):**

React dev mode runs every effect twice, synchronously:
```
[Run 1]  effect runs → cancelled=false → emit livekit:get-token (async, in flight)
[Clean 1] cancelled=true → start 150ms disconnect timer
[Run 2]  effect runs → timer IS pending → cancel timer, skip token request
          (because "prior run's connection is still alive")
[async]  token callback from Run 1 arrives → checks cancelled → true → EXITS
```

Result: the timer is cancelled (good, no disconnect), but the token callback is also cancelled. **No `room.connect()` is ever called.** The room stays disconnected indefinitely. When `publishTrack` is called, LiveKit's engine hasn't established a WebRTC peer connection → timeout.

Console: *"PublishTrackError: publishing rejected as engine not connected within timeout"*

---

### 2. `useScreenShare.js` — Background IIFE + Disconnected Bail-out

**Why it was changed:** The desktop overlay deep link (`evodraw://start?...`) must be launched synchronously within the user gesture window. Chrome blocks custom protocol launches after an `await`. But `publishTrack` is async and was `await`ed before the deep link in `a524fee`. The fix was to fire the deep link synchronously, then run `publishTrack` in a background IIFE.

**The bug the IIFE introduced:**

```js
;(async () => {
  if (room.state === 'disconnected') {
    console.warn('LiveKit room is disconnected; skipping publish')
    return  // ← THIS IS THE BUG
  }
  await room.localParticipant.publishTrack(...)
})()
```

`disconnected` is the **initial state** of a brand new `Room()` object. The room doesn't move out of `disconnected` until `room.connect()` is called inside `useLiveKitRoom`. The `livekit:get-token` socket callback is async — if the user starts screen sharing before it returns, `room.state` is still `disconnected` and the publish is skipped entirely. Presenter sees local overlay, viewers see nothing.

---

### 3. `screenShareObject.js` — Viewport-Aware Proxy Rect Sizing

Unrelated to the LiveKit failure, but explains the *"Setting up overlay: 2x2 for k (You)"* log:

The new code computes proxy rect size from the canvas viewport. If `canvas.getWidth()` or `canvas.getHeight()` returns 0 or near-zero (e.g., before the canvas has been laid out by the browser), the scale calculation produces a near-zero result, making the proxy rect 2×2 pixels. The video stream itself is fine, but the Fabric proxy rect on the canvas is effectively invisible.

---

## Why Deep Link and LiveKit Publishing Conflict

The conflict is a browser security constraint:

```
Chrome user gesture window:
  ─────────────────────────────────────────────────────
  ↑ user clicks "Share Screen"
  |  getDisplayMedia()  ← await OK, still in gesture
  |  [gesture window still active after getDisplayMedia resolves]
  |  deep link anchor.click()  ← must happen HERE
  |  publishTrack()  ← await OK after deep link
  ─────────────────────────────────────────────────────
```

`getDisplayMedia` itself IS the user gesture — Chrome grants the gesture token to it. After it resolves, there is a brief window where other gesture-gated actions (like opening `evodraw://`) are still allowed. Once you `await` anything else (like `publishTrack`), the gesture window closes and Chrome blocks protocol launches silently.

In `a524fee`, there was no deep link, so `publishTrack` was awaited directly — no conflict. When the deep link was added after `publishTrack`, Chrome blocked it. The IIFE workaround fixed the ordering (deep link fires sync, publish runs async) but introduced the `disconnected` bail-out bug.

---

## Root Cause Summary

| Symptom | Root Cause | File |
|---------|-----------|------|
| Viewers see nothing, presenter sees overlay | `disconnected` bail-out in IIFE skips publish entirely | `useScreenShare.js` |
| "engine not connected within timeout" | Strict Mode cancels Run 1 token callback; `room.connect()` never called | `useLiveKitRoom.js` |
| "Disconnected from room" + "closed peer connection" | Second `room.connect()` from Strict Mode Run 2 tears down first | `useLiveKitRoom.js` |
| "2x2" proxy rect on canvas | Viewport dimensions read before canvas DOM is laid out | `screenShareObject.js` |
| Desktop overlay WebSocket 400 | `file://` Electron origin not in server `ALLOWED_ORIGINS` | `apps/server/.env` |
| Deep link blocked by Chrome | Fired after `await publishTrack` (outside user gesture window) | `useScreenShare.js` |

---

## Current Code State (After This Session's Edits)

| File | State |
|------|-------|
| `useScreenShare.js` | Reverted to `a524fee` base + deep link anchor click added synchronously before `publishTrack`. IIFE and bail-out removed. |
| `useLiveKitRoom.js` | Deferred disconnect kept + double-connect fix applied. But: Strict Mode still cancels the Run 1 token callback, so room may never connect. |
| `canvasSerializer.js` | Overlay strokes excluded from `canvas_op` (prevents double-broadcast). Correct. |
| `screenShareObject.js` | Viewport-aware centering/scaling for proxy rect (introduces 2×2 bug). |
| `useWebOverlayEmit.js` | New hook for routing pen strokes over screen share via overlay protocol. |
| `useDrawingTools.js` | Modified to support overlay stroke routing. |

---

## Options to Fix `useLiveKitRoom.js`

### Option A — Revert to `a524fee`

Keep it simple. `username` goes back in deps, synchronous disconnect in cleanup.

- **Pro:** Known working.
- **Con:** Username changes mid-session cause `room.disconnect()` → reconnect. If user renames during an active screen share, publish fails.

### Option B — Fix with a `cancelledRef`

Replace the closure `cancelled` variable with a `useRef` so Run 2 can reset it to `false`, allowing Run 1's in-flight token callback to proceed:

```js
const cancelledRef = useRef(false)

useEffect(() => {
  cancelledRef.current = false  // reset on every run

  socket.emit('livekit:get-token', ..., async (response) => {
    if (cancelledRef.current) return  // reads current ref value, not stale closure
    await room.connect(response.url, response.token)
  })

  return () => {
    // Do NOT set cancelledRef here — the timer sets it on real unmount
    disconnectTimerRef.current = setTimeout(() => {
      cancelledRef.current = true   // only cancelled on actual unmount
      room.disconnect()
      setIsLiveKitConnected(false)
    }, 150)
  }
}, [room, roomId])
```

- **Pro:** Handles both username changes and Strict Mode correctly.
- **Con:** Slightly more complex; `cancelledRef` must not be set in the synchronous cleanup path.

### Option C — Revert `useLiveKitRoom.js` + fix only `useScreenShare.js`

Revert `useLiveKitRoom.js` to `a524fee`. Keep only the deep link anchor click addition in `useScreenShare.js`. Accept that username changes may disconnect mid-share (low risk in practice — users rarely rename during an active share session).

- **Pro:** Minimal change, known stable base.
- **Con:** Leaves the username-causes-disconnect edge case unfixed.
