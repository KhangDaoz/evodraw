# EvoDraw Canvas Synchronization & Versioning

## Overview
EvoDraw is a real-time, multiplayer vector drawing application. To maintain high performance and prevent data conflicts between multiple users drawing simultaneously, the application relies on a decoupled **`sceneVersion`** counter. 

This document explains the architecture behind the canvas synchronization and why the `sceneVersion` operates independently of the canvas element count.

## The Versioning Problem
In a collaborative environment, multiple users may attempt to push their canvas snapshots to the database at the exact same time. Without a strict versioning system, the database could overwrite a newer, more complete canvas state with an older, slightly delayed snapshot sent by another user's machine (a race condition).

### Why NOT use element count?
Initially, the version was based on the number of elements on the canvas (e.g., 13 strokes = version 13). 
This caused critical failures during **delete** operations. If a user had 13 elements and deleted one, the count dropped to 12. When pushing this new snapshot to the server, the server would see `12 < 13` and incorrectly reject the snapshot as "outdated". 

### Why NOT just increment on save (`+1` during snapshot push)?
If the client merely added `+1` to the version right before pushing to the server, version numbers would lose their connection to the actual state of the canvas. 
Because the background timer runs independently for every user, two users could draw the exact same strokes but push at different times, creating diverging version numbers for the exact same canvas state. 

## The Solution: Monotonic Operation Counter
To fix this, `sceneVersion` is designed as a **monotonic counter** that tracks *actions*, not elements or saves. 

### 1. Global Version Increment
Every time a mutation happens on the canvas (an element is added, modified, or removed), the `sceneVersion` goes up by `1`.
- **Add a stroke:** `sceneVersion += 1`
- **Move a shape:** `sceneVersion += 1`
- **Erase a line:** `sceneVersion += 1` (Even though the element count goes down, the version still goes up!)

This guarantees the version number never drops, preventing the server from ever rejecting a valid snapshot.

### 2. Perfect WebRTC Synchronization
When User A draws a line, their `sceneVersion` becomes `13`. That stroke is immediately broadcast to User B over WebRTC. When User B receives the stroke, their local canvas applies it and their local `sceneVersion` *also* becomes `13`. 
The `sceneVersion` acts as a perfect, unified fingerprint of the current visual state for everyone in the room.

### 3. Preventing Redundant Saves
Because all users maintain the exact same `sceneVersion` for the same canvas state, race conditions are completely neutralized:
- User A's background timer triggers and pushes `sceneVersion: 13`.
- The server saves the snapshot and updates its database to version `13`.
- User B's background timer triggers a second later and also pushes `sceneVersion: 13`.
- The server checks if the incoming version is strictly greater than the database version (`13 > 13`).
- Because it is `false`, the server silently ignores User B's redundant snapshot.

This architectural decision heavily optimizes database interactions. No matter how many users are in a room, the server only processes the very first snapshot for a given canvas state, dropping all identical subsequent requests.

## Server-Side Implementation
The backend acts strictly as a passive storage validator. It does **not** count or increment anything. It simply enforces the rule:

```javascript
// room.service.js
if (roomVersion !== undefined && roomVersion <= room.roomVersion) {
    throw new Error('Room version is outdated.');
}
```

The frontend holds 100% of the responsibility for maintaining the chronological integrity of the `sceneVersion`.
