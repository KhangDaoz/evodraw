# LiveKit SFU Migration Plan & Screen Share Canvas Sync

## Phần 1: LiveKit SFU Migration

### Tổng Quan Vấn Đề

Hiện tại, EvoDraw sử dụng **Peer-to-Peer (P2P) Mesh network** cho Voice Chat và Screen Sharing. Kiến trúc này kết nối trực tiếp từng user đến nhau, dẫn đến:

- **Tăng trưởng kết nối theo cấp số nhân**: $N*(N-1)/2$ connections
- **CPU & Bandwidth suy giảm nặng** cho rooms > 4-5 người
- **Không mở rộng được**

### Giải Pháp: LiveKit Selective Forwarding Unit (SFU)

Thay vì P2P Mesh, users sẽ kết nối tới **LiveKit Server** duy nhất:

```
P2P Mesh (Cũ):                    SFU (Mới):
User A ←→ User B                  User A ╲
User A ←→ User C                         → LiveKit Server
User B ←→ User C                  User B ╱
User C ←→ ... (O(N²))                    ↓
                                 Mọi users nhận stream
                                 (O(N) - Linear)
```

**Lợi ích:**
- ✅ Mở rộng tuyến tính (Linear scaling)
- ✅ CPU/Bandwidth ổn định regardless of room size
- ✅ Giảm 70% bandwidth so với P2P mesh
- ✅ Hỗ trợ HD/4K video dễ dàng

### Deployment Decision

> [!IMPORTANT]
> **Recommended:** Sử dụng **LiveKit Cloud (Free Tier)** để tránh DevOps overhead.
> - Node.js server & React frontend vẫn giữ nguyên vị trí hiện tại
> - LiveKit Cloud chỉ được dùng cho media routing
> 
> **Alternative:** Self-hosted LiveKit với Docker (nếu yêu cầu on-premise)

---

## Phần 2: Proposed Changes

### Backend (Node.js Server)

#### [MODIFY] `apps/server/package.json`
Thêm dependency:
```json
{
  "dependencies": {
    "livekit-server-sdk": "^0.7.0"
  }
}
```

#### [MODIFY] `apps/server/src/sockets/chat.handler.js`

**Remove:**
- Xóa WebRTC signaling events: `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`

**Add:**
```javascript
import { AccessToken } from 'livekit-server-sdk';

// Mới: Generate LiveKit JWT token
socket.on('livekit:get-token', async ({ roomId, username }, callback) => {
    try {
        const token = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET
        );
        
        token.addGrant({
            roomJoin: true,
            room: roomId,
            canPublish: true,
            canPublishData: true,
            canSubscribe: true,
        });
        
        token.identity = `${username}-${socket.id}`;
        const jwt = await token.toJwt();
        
        callback({ token: jwt, url: process.env.LIVEKIT_URL });
    } catch (err) {
        callback({ error: err.message });
    }
});
```

#### [ADD] `.env` (Server)
```
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret
LIVEKIT_URL=https://livekit-instance.livekit.cloud
```

---

### Frontend (React Web App)

#### [MODIFY] `apps/web/package.json`
Thêm dependencies:
```json
{
  "dependencies": {
    "livekit-client": "^0.11.0",
    "@livekit/components-react": "^0.9.0"
  }
}
```

#### [DELETE] `apps/web/src/hooks/useVoiceChat.js` / `useScreenShare.js`
- Xóa custom WebRTC logic
- Thay thế bằng LiveKit components (xem bên dưới)

#### [MODIFY] `apps/web/src/components/Canvas/Canvas.jsx`
```javascript
import { LiveKitRoom, VideoConference } from '@livekit/components-react';

export default function Canvas() {
  const [token, setToken] = useState('');
  const [liveKitUrl, setLiveKitUrl] = useState('');
  const roomId = useParams().roomId;
  
  useEffect(() => {
    // Yêu cầu token từ server
    socket.emit('livekit:get-token', 
      { roomId, username: 'User' },
      ({ token, url }) => {
        setToken(token);
        setLiveKitUrl(url);
      }
    );
  }, [roomId]);

  if (!token) return <div>Connecting...</div>;

  return (
    <LiveKitRoom
      video={true}
      audio={true}
      token={token}
      serverUrl={liveKitUrl}
      onParticipantsChange={(p) => console.log(p)}
    >
      <VideoConference />
    </LiveKitRoom>
  );
}
```

---

## Phần 3: Screen Share Canvas Sync Integration

Hiện tại, **khung proxy screen share bị cô lập** khỏi Canvas Sync để tránh Race Condition (LiveKit tạo trùng lặp object). Kết quả: khung không đồng bộ giữa các users.

**Mục tiêu:** Khôi phục đồng bộ hoá đầy đủ mà KHÔNG gây race condition.

### 3.1 Tích Hợp Proxy Rect vào Canvas Serializer

#### [MODIFY] `apps/web/src/utils/canvasSerializer.js`

**Add:**
```javascript
// Thêm screen share metadata vào serialization
const CUSTOM_PROPS = [
  '_evoId', 
  '_evoVersion', 
  '_evoNonce', 
  '_evoScreenShare',      // ← NEW
  '_evoShareId',          // ← NEW
  '_evoShareUser',        // ← NEW
  '_evoShareColor'        // ← NEW
];
```

**Remove blocks:**
```javascript
// TRƯỚC (trong attachSerializer):
const onAdded = ({ target }) => {
    if (state._applying) return;
    if (target._evoDrawing) return;
    if (target._evoScreenShare) return;  // ← DELETE
    bumpVersion(target);
    // ...
};

// SAU:
const onAdded = ({ target }) => {
    if (state._applying) return;
    if (target._evoDrawing) return;
    // Screen share objects ĐƯỢC PHÉP đi vào sync
    bumpVersion(target);
    // ...
};
```

**Thay đổi serializeCanvas:**
```javascript
export function serializeCanvas(canvas, { includeScreenShares = false } = {}) {
  const objects = canvas.getObjects()
    // Server snapshots: loại bỏ proxy (tạm thời)
    // Peer snapshots: giữ proxy (để late joiners nhận vị trí)
    .filter(obj => includeScreenShares || !obj._evoScreenShare)
    .map(serializeObject)
  return { objects }
}
```

### 3.2 Thiết Kế Lại DOM Overlay Manager

#### [MODIFY] `apps/web/src/utils/screenShareObject.js`

**Add function:**
```javascript
export function findScreenShareRect(canvas, shareId) {
  return canvas.getObjects()
    .find(obj => obj._evoScreenShare && obj._evoShareId === shareId);
}
```

**Modify createScreenShareOverlay:**
```javascript
export function createScreenShareOverlay(
  videoEl, 
  shareId, 
  username, 
  canvas,
  layer,
  existingRect = null  // ← NEW parameter
) {
  // Step 1: Kiểm tra đã có proxy rect từ WebSocket không
  let proxyRect = existingRect || findScreenShareRect(canvas, shareId);
  
  if (!proxyRect) {
    // Step 2: Nếu không có, tạo mới (fallback)
    proxyRect = new fabric.Rect({
      left: canvas.width / 2 - 320,
      top: canvas.height / 2 - 180,
      width: 640,
      height: 360,
      fill: 'rgba(0, 0, 0, 0.005)',
      stroke: getSharerColor(username),
      strokeWidth: 2,
      lockRotation: true,
      _evoScreenShare: true,
      _evoShareId: shareId,
      _evoShareUser: username,
      _evoShareColor: getSharerColor(username),
    });
    canvas.add(proxyRect);
  }

  // Step 3: Tạo DOM overlay tại vị trí của proxy
  const overlay = document.createElement('div');
  overlay.className = 'screen-share-overlay';
  
  // CSS Transform dựa trên proxy position
  syncOverlayPosition(proxyRect, overlay, canvas);
  
  // Step 4: Gắn listeners
  const onModified = () => syncOverlayPosition(proxyRect, overlay, canvas);
  const onAfterRender = () => syncOverlayPosition(proxyRect, overlay, canvas);
  
  proxyRect.on('modified', onModified);
  canvas.on('after:render', onAfterRender);
  
  // Step 5: Xóa khi proxy bị remove
  const onObjectRemoved = (e) => {
    if (e.target === proxyRect) {
      overlay.remove();
      proxyRect.off('modified', onModified);
      canvas.off('after:render', onAfterRender);
    }
  };
  canvas.on('object:removed', onObjectRemoved);
  
  layer.appendChild(overlay);
  overlay.appendChild(videoEl);
  
  return { overlay, proxyRect, cleanup: () => onObjectRemoved({ target: proxyRect }) };
}
```

### 3.3 Cập Nhật useScreenShare Hook

#### [MODIFY] `apps/web/src/hooks/useScreenShare.js`

```javascript
import { findScreenShareRect, createScreenShareOverlay } from '../utils/screenShareObject.js';

const onTrackSubscribed = async (track, participant) => {
  if (track.kind !== 'video') return;
  
  const videoEl = document.createElement('video');
  videoEl.autoplay = true;
  videoEl.muted = true;
  videoEl.playsinline = true;
  videoEl.srcObject = new MediaStream([track]);
  
  const shareId = participant.metadata?.shareId || track.sid;
  const username = participant.name;
  
  // Step 1: Kiểm tra đã có Proxy Rect từ Canvas Sync không
  const existingRect = findScreenShareRect(canvas, shareId);
  
  // Step 2: Tạo overlay
  const { overlay, proxyRect, cleanup } = createScreenShareOverlay(
    videoEl,
    shareId,
    username,
    canvas,
    screenShareLayerRef.current,
    existingRect  // ← Truyền rect có sẵn nếu tồn tại
  );
  
  // Step 3: Lưu cleanup function
  screenSharesRef.current.set(shareId, cleanup);
};

const onTrackUnsubscribed = (track) => {
  const cleanup = screenSharesRef.current.get(track.sid);
  if (cleanup) {
    cleanup();
    screenSharesRef.current.delete(track.sid);
  }
};
```

---

## Phần 4: Open Questions & Decisions

> [!CAUTION]
> **Quyền Điều Khiển Screen Share Box**
> 
> Khi Proxy Rect được tích hợp vào Canvas Sync, **bất cứ ai** cũng có thể kéo/resize/di chuyển khung của host.
> 
> **3 Tùy chọn:**
> 1. **Cho phép tất cả** (Collaborative) - Mọi người có thể tương tác với bất kỳ object nào
> 2. **Chỉ presenter** - Lock proxy rect cho những người không phải presenter
> 3. **Hybrid** - Cho phép tương tác nhưng có undo/restore
>
> **Lựa chọn khuyên dùng:** Option 1 (Collaborative) - Phù hợp với spirit của bảng vẽ cộng tác

---

## Phần 5: Verification Plan

### 5.1 Local Testing
```bash
# 1. Start server
npm run dev:server

# 2. Start web
npm run dev:web

# 3. Open multiple browsers
# - http://localhost:5173/room/TEST123
# - http://localhost:5173/room/TEST123 (incognito)

# 4. Verify:
# ✅ Users connect to LiveKit room
# ✅ Audio/Video stream works
# ✅ Screen share works
# ✅ Proxy rect syncs between users
# ✅ Drawing works on top of video
```

### 5.2 Stress Testing (Scale)
```javascript
// Open 6+ tabs/windows cùng room
// Monitor:
// ✅ CPU usage stable (<40%)
// ✅ Network usage linear (not exponential)
// ✅ Video quality không giảm
// ✅ Latency < 500ms
```

### 5.3 Canvas Sync Verification
```
Scenario: User A moves screen share box to position (100, 200)
Expected: 
  - Proxy rect trên canvas của User B di chuyển đến (100, 200)
  - DOM video overlay của User B theo proxy rect
  - Late joiner (User C) vào → nhận Proxy Rect ở (100, 200)
```

---

## Phần 6: Implementation Checklist

- [ ] LiveKit Cloud account setup (lấy API key/secret)
- [ ] Update `.env` server với LiveKit credentials
- [ ] Install dependencies (livekit-server-sdk, livekit-client, @livekit/components-react)
- [ ] Implement token generator (`livekit:get-token`)
- [ ] Remove old WebRTC signaling code
- [ ] Update frontend components (Canvas.jsx, VideoConference)
- [ ] Integrate Proxy Rect vào Canvas Serializer
- [ ] Test: Connect 2 users → Verify voice/video
- [ ] Test: Screen share sync
- [ ] Test: Drawing on top of video
- [ ] Test: Late joiner recovery
- [ ] Stress test: 6+ users simultaneously
- [ ] Deploy to production

---

## File References

| File | Action | Priority |
|------|--------|----------|
| `apps/server/package.json` | Add livekit-server-sdk | High |
| `apps/server/src/sockets/chat.handler.js` | Add token generator | High |
| `apps/server/.env` | Add LiveKit credentials | High |
| `apps/web/package.json` | Add LiveKit React SDK | High |
| `apps/web/src/components/Canvas/Canvas.jsx` | Replace WebRTC with LiveKit | High |
| `apps/web/src/utils/canvasSerializer.js` | Integrate screen share metadata | Medium |
| `apps/web/src/utils/screenShareObject.js` | Update DOM overlay logic | Medium |
| `apps/web/src/hooks/useScreenShare.js` | Update to use FindScreenShareRect | Medium |
| `apps/web/src/hooks/useVoiceChat.js` | Delete (replaced by LiveKit) | Medium |
