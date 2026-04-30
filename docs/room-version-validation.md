# Room Version Validation Logic

When validating incoming room snapshots in `updateRoomService`, we use a specific logical condition to check the version number. This document explains why we use `!== undefined &&` instead of other approaches like `=== undefined ||`.

## The Current Implementation (Correct)

```javascript
// apps/server/src/services/room.service.js
if (roomVersion !== undefined && roomVersion <= room.roomVersion) {
    const error = new Error('Room version is outdated. Please refresh to get the latest room.');
    error.statusCode = 400;
    throw error;
}
```

This logic reads as: **"If the client *DID* provide a version, *AND* that version is older or equal, throw an error."**

This is the safest approach because:
1. **Validating Snapshots:** If the client sends a `roomVersion` (e.g., when saving a canvas snapshot), we securely validate it against the database to prevent race conditions and overwriting newer work with older data.
2. **Partial Updates:** If the client *doesn't* send a `roomVersion` (e.g., they only want to update the room's `status` or `appState` via an API request), `roomVersion !== undefined` evaluates to **false**. The statement immediately stops evaluating and safely allows the update to proceed without modifying or checking the version number.

---

## Why `=== undefined ||` Is Flawed

If we were to write the condition like this:

```javascript
// INCORRECT LOGIC
if (roomVersion === undefined || roomVersion <= room.roomVersion) {
    throw new Error('Room version is outdated.');
}
```

This logic reads as: **"If the client does NOT provide a version, *OR* if the version is older, throw an error."**

While this successfully blocks outdated versions, it introduces a critical bug: **It breaks partial updates.** 

If another part of the application makes an API request to simply update the room's status (e.g., closing the room) without sending a canvas snapshot, it won't include a `roomVersion` in the payload. Because of the `||` (OR) operator, the server would see `roomVersion === undefined` as **true** and immediately crash, throwing the "Room version is outdated" error for a completely unrelated request.

By using `!== undefined &&`, we ensure the server only validates the version strictly when a version is actually meant to be updated.
