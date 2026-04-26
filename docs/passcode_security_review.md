# Passcode Security Review and Improvement Plan

Date: 2026-04-25
Scope: Room creation, REST join, Socket.IO join, realtime events, invite links, file access

## 1. Executive Summary

Current implementation has a good base (bcrypt hash, format validation, double check at REST and socket join), but it is not secure enough for production yet.

Main risk: after initial join, many realtime socket events are not authorized by membership check, so an attacker can emit events to a target room if they know roomId.

## 2. Current Passcode Flow (End-to-End)

### 2.1 Room creation

1. Client calls POST /api/rooms
2. Server generates room code and passcode
3. Passcode is hashed with bcrypt and stored in DB
4. Plain passcode is returned once to client for sharing

Evidence:
- apps/server/src/services/room.service.js:26
- apps/server/src/services/room.service.js:27
- apps/server/src/services/room.service.js:31
- apps/server/src/controllers/room.controller.js:7

### 2.2 REST join validation

1. Client sends code + passcode to POST /api/rooms/join
2. Middleware validates format (code length 6, passcode 4 digits)
3. Service finds room by code and compares passcode with bcrypt

Evidence:
- apps/web/src/services/api.js:17
- apps/server/src/routes/room.routes.js:11
- apps/server/src/middlewares/room.middleware.js:5
- apps/server/src/middlewares/room.middleware.js:12
- apps/server/src/services/room.service.js:63

### 2.3 Socket join validation

1. Client connects socket and emits join_room with roomId + passcode
2. Server validates format and compares passcode with bcrypt
3. If valid, socket.join(roomId) and stores socket.data.roomId

Evidence:
- apps/web/src/hooks/useRoom.js:22
- apps/server/src/sockets/room.handler.js:24
- apps/server/src/sockets/room.handler.js:29
- apps/server/src/sockets/room.handler.js:36
- apps/server/src/sockets/room.handler.js:46
- apps/server/src/sockets/room.handler.js:47

### 2.4 Invite link flow

1. Client creates invite link by base64(roomCode:passcode)
2. Join page decodes token and calls joinRoom REST

Evidence:
- apps/web/src/components/SettingsPanel/SettingsPanel.jsx:104
- apps/web/src/components/SettingsPanel/SettingsPanel.jsx:105
- apps/web/src/pages/JoinPage/JoinPage.jsx:20
- apps/web/src/pages/JoinPage/JoinPage.jsx:25
- apps/web/src/pages/JoinPage/JoinPage.jsx:32

## 3. Security Findings

## 3.1 Critical - Missing authorization on many socket events

Description:
Many events trust payload.roomId without checking whether current socket is actually a member of that room.

Affected examples:
- draw_stroke, cursor_move, canvas_op, canvas_bg_change
- chat:message
- screen:start, screen:stop, screen:get_active
- update_username, leave_room (roomId comes from client payload)

Evidence:
- apps/server/src/sockets/draw.handler.js:6
- apps/server/src/sockets/draw.handler.js:12
- apps/server/src/sockets/draw.handler.js:19
- apps/server/src/sockets/chat.handler.js:6
- apps/server/src/sockets/screen.handler.js:6
- apps/server/src/sockets/screen.handler.js:41
- apps/server/src/sockets/room.handler.js:57
- apps/server/src/sockets/room.handler.js:72

Impact:
- Unauthorized drawing/chat/screen-share signaling injection to target room
- Potential data manipulation and denial of collaboration integrity

## 3.2 Critical - Snapshot read/write can bypass passcode

Description:
Socket snapshot handlers call service with passcode: '' and service logic skips passcode validation if passcode is empty string.

Evidence:
- apps/server/src/sockets/draw.handler.js:39
- apps/server/src/sockets/draw.handler.js:53
- apps/server/src/services/room.service.js:42
- apps/server/src/services/room.service.js:61
- apps/server/src/services/room.service.js:82
- apps/server/src/services/room.service.js:101

Impact:
- Unauthorized clients can attempt to read or write room snapshot when they know roomId

## 3.3 Critical - LiveKit token issuance is not room-authorized

Description:
livekit:get-token grants roomJoin token for requested roomId without verifying socket membership for that room.

Evidence:
- apps/server/src/sockets/chat.handler.js:31
- apps/server/src/sockets/chat.handler.js:53

Impact:
- Unauthorized access to room media channel (voice/screen) possible if roomId is known

## 3.4 High - Brute-force risk

Description:
- Passcode is only 4-digit numeric
- No explicit join rate-limit or lockout on REST/socket attempts

Evidence:
- apps/server/src/utils/codeGenerator.js:10
- apps/server/src/routes/room.routes.js:11
- apps/server/src/sockets/room.handler.js:24

Impact:
- Online guessing is feasible under sustained attempts

## 3.5 Medium - Invite token exposes passcode (only base64)

Description:
Invite token is not signed/encrypted. Anyone with link can decode roomCode and passcode directly.

Evidence:
- apps/web/src/components/SettingsPanel/SettingsPanel.jsx:104
- apps/web/src/pages/JoinPage/JoinPage.jsx:20

Impact:
- Link leakage equals credential leakage

## 3.6 Medium - Room file endpoints are not passcode-protected

Description:
- Upload/list files depend on roomId path parameter only
- Uploaded file is set public in storage

Evidence:
- apps/server/src/routes/file.routes.js:25
- apps/server/src/routes/file.routes.js:28
- apps/server/src/controllers/file.controller.js:49
- apps/server/src/controllers/file.controller.js:82

Impact:
- Unauthorized read/list/upload can happen if roomId is known

## 3.7 Attention Points and Updated Fix Direction (JWT-Based)

Use this as the updated map for implementation.

1. Issue room access JWT immediately after successful join (REST)
What to watch:
- Keep passcode verification at join time (do not remove this step).
Updated direction:
- After code + passcode are verified, server issues a short-lived room access JWT (15-60 minutes).
- JWT must include at least: roomId, role, tokenVersion, iat, exp.
- Never include passcode in JWT payload.
Where to edit:
- apps/server/src/controllers/room.controller.js
- apps/server/src/services/room.service.js

2. Enforce JWT on Socket.IO connection and room-scoped events
What to watch:
- Any event trusting payload.roomId is vulnerable.
Updated direction:
- Verify JWT at socket handshake and store claims in socket.data.auth.
- Add shared guard helper ensureAuthorizedRoom(socket, payloadRoomId).
- Canonical roomId is from verified claims/server state, not raw payload.
Where to edit:
- apps/server/src/sockets/index.js
- apps/server/src/sockets/draw.handler.js
- apps/server/src/sockets/chat.handler.js
- apps/server/src/sockets/screen.handler.js
- apps/server/src/sockets/room.handler.js

3. Remove snapshot bypass path
What to watch:
- Empty-passcode path currently bypasses verification.
Updated direction:
- Remove empty-passcode bypass from service layer.
- Snapshot read/write must require authorized membership from JWT/session context.
- If needed, create trusted internal methods that do not accept client passcode.
Where to edit:
- apps/server/src/services/room.service.js
- apps/server/src/sockets/draw.handler.js

4. Gate LiveKit token issuance with verified room membership
What to watch:
- Token issuance should never trust requested roomId alone.
Updated direction:
- livekit:get-token validates JWT claim roomId against requested roomId.
- Reject mismatch and unauthorized sockets.
Where to edit:
- apps/server/src/sockets/chat.handler.js

5. Add brute-force protection and stronger passcode entropy
What to watch:
- 4-digit passcode and no rate limits are weak.
Updated direction:
- Add REST rate-limit and socket join throttling.
- Increase passcode to at least 6 digits.
- Use crypto.randomInt instead of Math.random.
Where to edit:
- apps/server/src/routes/room.routes.js
- apps/server/src/sockets/room.handler.js
- apps/server/src/utils/codeGenerator.js

6. Replace invite format and secure file APIs
What to watch:
- base64(roomCode:passcode) leaks credentials.
- File routes trusting roomId are insufficient.
Updated direction:
- Replace invite link with server-signed invite token (short expiry, single purpose).
- File list/upload endpoints must require verified room access token.
- Prefer private storage + signed URLs over makePublic.
Where to edit:
- apps/web/src/components/SettingsPanel/SettingsPanel.jsx
- apps/web/src/pages/JoinPage/JoinPage.jsx
- apps/server/src/routes/room.routes.js
- apps/server/src/controllers/room.controller.js
- apps/server/src/routes/file.routes.js
- apps/server/src/controllers/file.controller.js

7. Recommended implementation order
1. Add JWT issue/verify path and socket guard helper.
2. Apply guard to all room-scoped socket events.
3. Remove snapshot bypass and gate LiveKit token.
4. Add brute-force protection and stronger passcode generation.
5. Replace invite format and harden file access.

## 4. Improvement Plan (Priority Based)

## P0 - Must do immediately

1. Keep current passcode join validation, then issue short-lived room access JWT.
2. Verify JWT at socket handshake and apply room guard to every room-scoped event.
3. Remove passcode-empty bypass in snapshot service path.
4. Authorize livekit:get-token only when JWT roomId matches requested room.

Implementation note:
- Never trust roomId from payload directly.
- Use canonical room from verified auth context (socket.data.auth.roomId).
- Reject mismatch where payload.roomId exists and differs from socket.data.auth.roomId.

## P1 - Strongly recommended

1. Add rate limiting and temporary lockout for join attempts.
2. Increase passcode entropy:
   - at least 6 digits
   - use crypto.randomInt instead of Math.random
3. Add JWT revocation strategy (tokenVersion per room or roomAuthVersion).
4. Replace base64 invite with signed short-lived invite token from server.
5. Add centralized payload validation (schema validation) for socket events.

## P2 - Defense in depth

1. Move to account-backed membership model (optional) while keeping anonymous fallback.
2. Make file access private with signed URLs, avoid makePublic by default.
3. Add audit logs and anomaly alerts for repeated failed joins.
4. Add key rotation policy for JWT signing secret.

## 5. Technical Checklist

- [ ] Add room access JWT issuer after successful join REST
- [ ] Add JWT verify middleware for REST protected endpoints
- [ ] Add JWT verify at socket handshake and store claims in socket.data.auth
- [ ] Add helper ensureAuthorizedRoom(socket, roomId)
- [ ] Apply helper to draw.handler events
- [ ] Apply helper to chat.handler events
- [ ] Apply helper to screen.handler events
- [ ] Validate update_username and leave_room using canonical roomId from auth context
- [ ] Remove service behavior that skips passcode when passcode is empty
- [ ] Create dedicated internal service for trusted member operations if needed
- [ ] Gate livekit:get-token by verified room membership and room match
- [ ] Add REST rate limit for /api/rooms/join
- [ ] Add socket join attempt throttling
- [ ] Upgrade passcode generation to crypto-grade and increase length
- [ ] Replace base64 invite with server-signed invite token and expiry
- [ ] Add authorization layer for file upload/list via verified room token
- [ ] Stop using public object access unless explicitly required
- [ ] Add tokenVersion strategy and invalidation on passcode rotation

## 6. Suggested Test Plan

## 6.1 Positive tests

1. Valid code + passcode can join REST and socket.
2. Successful join returns room access JWT with valid exp.
3. Joined socket can draw/chat/screen/share snapshot normally.
4. LiveKit token issued only for joined room.
5. File list/upload works with valid room JWT.

## 6.2 Negative tests

1. Socket not joined tries draw_stroke with random roomId -> rejected.
2. Socket joined room A tries emit to room B -> rejected.
3. request_snapshot with known roomId but no membership -> rejected.
4. save_snapshot with no membership -> rejected.
5. livekit:get-token for non-member -> rejected.
6. Expired JWT on socket handshake -> rejected.
7. REST file endpoint with missing/invalid JWT -> rejected.
8. Brute force repeated /join attempts triggers rate-limit.

## 6.3 Regression tests

1. Existing room collaboration still works under normal path.
2. Disconnect/reconnect still rejoins correctly.
3. Invite flow still works with new signed token format.
4. Passcode rotation invalidates old tokenVersion.

## 7. Acceptance Criteria

Security baseline is acceptable when all points below are true:

1. No room-scoped socket event can be executed without verified membership.
2. Snapshot read/write cannot bypass passcode through empty string path.
3. LiveKit token cannot be minted for unauthorized room access.
4. Join endpoint is protected against brute-force attempts.
5. Invite mechanism does not expose passcode in reversible client token.
6. File APIs require verified room access token.
7. Expired or revoked room JWT cannot access socket/API resources.

## 8. Notes for Future Iteration

- If product needs high security, move away from shared passcode model to account-based membership with per-user authorization.
- If product needs anonymous flow, keep passcode but bind successful join to short-lived JWT/session token and enforce on all APIs/sockets.
