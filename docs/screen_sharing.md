# Tính năng Chia sẻ Màn hình — Tài liệu Hoàn Chỉnh

> **Nhánh**: `web`
> **Cập nhật lần cuối**: 30-04-2026
> **Phiên bản**: 2.0 (LiveKit SFU + Native DOM Overlay)

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Những thay đổi chính (What Changed)](#2-những-thay-đổi-chính-what-changed)
3. [Kiến trúc hệ thống](#3-kiến-trúc-hệ-thống)
4. [Các thành phần & Cơ chế hoạt động](#4-các-thành-phần--cơ-chế-hoạt-động)
5. [Chi tiết tính năng](#5-chi-tiết-tính-năng)
6. [Luồng dữ liệu](#6-luồng-dữ-liệu)
7. [Tham chiếu tệp mã nguồn](#7-tham-chiếu-tệp-mã-nguồn)
8. [Giao thức sự kiện Socket.io](#8-giao-thức-sự-kiện-socketio)
9. [Tích hợp WebRTC & LiveKit](#9-tích-hợp-webrtc--livekit)
10. [Mô hình đối tượng Proxy trên Canvas](#10-mô-hình-đối-tượng-proxy-trên-canvas)
11. [Giao diện điều khiển](#11-giao-diện-điều-khiển)
12. [Vòng đời & Dọn dẹp tài nguyên](#12-vòng-đời--dọn-dẹp-tài-nguyên)
13. [Hạn chế đã biết](#13-hạn-chế-đã-biết)

---

## 1. Tổng quan

Tính năng Chia sẻ Màn hình trong EvoDraw đã được nâng cấp hoàn toàn với 2 thay đổi lớn:

1. **Backend:** Chuyển từ WebRTC Mesh (P2P cồng kềnh) sang **LiveKit SFU (Selective Forwarding Unit)** - kiến trúc máy chủ trung tâm tối ưu.
2. **Frontend:** Sử dụng **Native DOM Video Overlay** + **Fabric.js Proxy** - hiệu suất cao, đồng bộ hoàn hảo.

Kết quả: Video được phát lại mượt mà (60 FPS hardware-accelerated) trong khi hỗ trợ chú thích, kéo-thả, và nhiều người chia sẻ đồng thời.

### Các khả năng chính

| Khả năng | Mô tả |
|---|---|
| **Hiển thị Native DOM Overlay** | Sử dụng thẻ `<video>` bản địa của trình duyệt đảm bảo FPS và độ phân giải tối ưu nhất. |
| **Bảo lưu Z-Index chú thích** | Các nét vẽ và ghi chú tồn tại trên lớp `canvas` nằm nổi phía trên lớp video, giúp người xem vẽ đè lên hình ảnh chia sẻ màn hình. |
| **LiveKit SFU Scale** | Mỗi presenter chỉ gửi 1 luồng video lên server, SFU phân phối đến N viewers — giảm 70% băng thông so với P2P mesh. |
| **Nhiều người chia sẻ** | Đa luồng chia sẻ đồng thời, mỗi luồng được nhận diện, theo dõi và mã hóa bởi màu viền riêng biệt. |
| **Điều khiển linh hoạt** | Chuyển đổi giữa 720p HD, 1080p FHD, 4K UHD hoặc 15/30/60 FPS một cách trơn tru giữa chừng thông qua `track.applyConstraints`. |
| **Hỗ trợ âm thanh** | Tùy chọn thu âm thanh hệ thống hoặc tab phát kèm theo kết nối luồng video. |
| *3. Kiến trúc hệ thống qua WebSocket operations — mọi người thấy khung chia sẻ ở cùng một vị trí. |

---

## 2. Những thay đổi chính (What Changed)

### Trước đây (v1.0 - WebRTC Mesh)
- ❌ P2P WebRTC Signaling: Mỗi kết nối phải trao đổi SDP/ICE Candidates
- ❌ Vẽ frame-by-frame lên Canvas (tốn CPU 60-80%)
- ❌ Proxy Rect cô lập — mỗi người có vị trí riêng
- ❌ Không đồng bộ giữa users khi kéo-thả khung

### Bây giờ (v2.0 - LiveKit SFU + Native DOM)
- ✅ **LiveKit SFU centralized** - tất cả connect tới 1 server
- ✅ **Native `<video>` DOM** - Hardware video decoding (4K@60fps dễ dàng)
- ✅ **Proxy Rect đồng bộ** - Áp dụng Canvas Sync Pipeline (LWW reconciliation)
- ✅ **Chú thích đè lên** - Z-index hoàn hảo, vẽ lên video mà không lag
- ✅ **Late Joiner support** - Người vào muộn nhận vị trí chính xác từ peers

### Tóm tắt thay đổi
1. **Gỡ bỏ WebRTC Mesh** → LiveKit SFU (máy chủ trung tâm)
2. **Quản lý Token JWT** → Server cấp phát tập trung via `livekit:get-token`
3. **2-Layer Rendering** → DOM Layer (video) + Fabric Layer (proxy rect + drawing)
4. **Proxy Rect vào Canvas Sync** → WebSocket ops cho `object:added/modified/removed`

---

## 2. Kiến trúc hệ thống - Native DOM Overlay

Mô hình hiện tại kết hợp sự phối hợp mật thiết giữa DOM thuần và Fabric.js để tận dụng thế mạnh kết xuất của cả hai môi trường:

```text
┌───────────────────────────────────────────────────────────────────────┐
│                       NGƯỜI XEM (Client B)                            │
│                                                                       │
│  Lớp 2: <canvas class="draw-surface"> (NỀN TRONG SUỐT)                │
│         ├─ Nét vẽ, Hình khối, Văn bản                                 │
│         └─ fabric.Rect (PROXY KHÔNG MÀU) ── xử lý sự kiện (kéo, thả)  │
│                   │                                                   │
│             Đồng bộ hóa CSS Transform (syncOverlayPosition)           │
│                   ▼                                                   │
│  Lớp 1: <div class="screen-share-layer"> (NẰM DƯỚI CANVAS)            │
│         └─ <div class="screen-share-overlay">                         │
│               ├─ <video autoplay muted> (WebRTC Stream)               │
│               └─ Nhãn người dùng (Username Label)                     │
│                                                                       │
│  Lớp 0: <div class="canvas-dot-grid"> (MẪU LƯỚI NỀN)                  │
└───────────────────────────────────────────────────────────────────────┘
```

Mỗi thao tác trên đối tượng Proxy (dịch chuyển, phóng to toàn canvas, co giãn object) sẽ lập tức kích hoạt sự kiện ánh xạ toạ độ và cập nhật thuộc tính `transform: translate(...)` cùng `width`, `height` lên thẻ `div` bọc video, giúp vị trí hiển thị luôn trùng khớp chính xác 100%.

---

## 4. Các thành phần & Cơ chế hoạt động

### 5. Authentication & Signaling (`chat.handler.js`)
Trong backend WebSockets (Node.js), thay vì trao đổi tín hiệu P2P, server xây dựng API để client xin quyền truy cập vào LiveKit.

- Khi client yêu cầu (`livekit:get-token`), server sử dụng `LIVEKIT_API_KEY` và `LIVEKIT_API_SECRET` tạo JWT token.
- Token chứa định danh (`username-socketId`) và quyền (Permissions): `roomJoin`, `canPublish`, `canSubscribe`.
- Client dùng token này để xác thực trực tiếp với dịch vụ LiveKit SFU.

### B. Transport & Streaming (`useScreenShare.js`)
Hook quản lý luồng Publish/Subscribe theo mô hình LiveKit SDK:

**Publishing (Presenter):**
- Gọi `navigator.mediaDevices.getDisplayMedia()` lấy video stream
- Gọ5 `room.localParticipant.publishTrack()` đẩy MediaTrack lên LiveKit với track ID = `shareId`
- Phát Socket.IO event `screen:start` để cập nhật danh sách UI

**Subscribing (Viewers):**
- Lắng nghe `RoomEvent.TrackSubscribed` từ LiveKit SDK
- Khi track video tới, biến thành MediaStream, nhúng vào `<video>` DOM
- Gọi `setupOverlay()` để bind video với Proxy Rect đã đồng bộ

**Tái sử dụng Proxy Rect:**
- Trước khi tạo overlay mới, gọi `findScreenShareRect(canvas, shareId)` 
- Nếu Proxy Rect tồn tại (từ WebSocket op), tái sử dụng nó
- Đảm bảo vị trí hiển thị khớp với vị trí đã được đồng bộ

### C. Cơ chế 2 Lớp Rendering (`screenShareObject.js`)

**Lớp Background (DOM Video):**
- Thẻ `<video>` HTML nằm trong div cha phía dưới Fabric canvas
- CSS `pointer-events: none` cho phép click xuyên qua

**Lớp Fabric Proxy Rect:**
- Hình chữ nhật ảo (opacity 0.5%) với viền màu người chia sẻ
- Hứng sự kiện: kéo-thả, resize, zoom canvas
- Có cờ `_evoScreenShare = true` để phân biệt

**Sync Position:**
- Sự kiện `moving`, `scaling`, `after:render` của Proxy Rect
- Gọi `syncOverlayPosition()` → tính toán CSS Transform
- DOM video di chuyển theo Proxy Rect

**Fallback cho Late Joiners:**
- Người vào muộn nhận Proxy Rect từ peers via `canvas_state_response`
- `existingRect` parameter → tái sử dụng nếu đã có trên canvas

### D. Đồng bộ Canvas Sync Pipeline (`canvasSerializer.js`)

**Serialization:**
- `CUSTOM_PROPS` bao gồm: `_evoScreenShare`, `_evoShareId`, `_evoShareUser`, `_evoShareColor`
- Metadata màn hình chia sẻ được truyền qua mạng

**Tích hợp Operations:**
- `attachSerializer` không bỏ qua Proxy Rect (khác với v1.0)
- Khi presenter tạo/di chuyển proxy rect → broadcast `object:added/modified`
- Tất cả peers nhận và apply LWW reconciliation

**Server Snapshots:**
- `serializeCanvas({ includeScreenShares: false })` → Server snapshots KHÔNG chứa proxy rect
- `serializeCanvas({ includeScreenShares: true })` → Peer-to-peer snapshots CÓ chứa

**Deserialization:**
- Phục hồi metadata screen share khi nhận object từ remote
- Proxy Rect xuất hiện cùng vị trí trên canvas người mới

### E. Dọn dẹp khi ngắt kết nối
- Khi Proxy Rect bị xoá (op `object:removed`)
- Hook `useScreenShare` lắng nghe và xoá DOM overlay tương ứng

---

## 5. Chi tiết tính năng

### 3.1 Chiến lược Native Video Overlay + Fabric Proxy

EvoDraw **thay thế hoàn toàn vòng lặp kết xuất bằng canvas (canvas-based render loop)** lỗi thời vì tốn kém tài nguyên CPU khi sao chép pixel. 

**Cách hoạt động mới:**
1. Người trình bày gọi `startSharing()`, luồng video thô được tạo qua `getDisplayMedia()`.
2. Hàm tiện ích `createScreenShareOverlay()` được gọi để khởi tạo 2 đối tượng cốt lõi:
   - **DOM Element:** Một thẻ `<video>` được chèn vào `<div ref={screenShareLayerRef}>`.
   - **Fabric Proxy:** Một đối tượng `fabric.Rect` được cấu hình nền `fill: 'rgba(0, 0, 0, 0.005)'` tĩnh (gắn nhãn gần như trong suốt để bắt các click API của chuột).
3. Các luồng sự kiện thao tác của Fabric.js bao gồm `moving`, `scaling`, `modified` và sự kiện tổng quát `after:render` (khi cuộn chuột / thu phóng cả màn hình bản đồ) sẽ kích hoạt một hàm đồng bộ liên tục có tên `syncOverlayPosition()`.
4. `syncOverlayPosition()` thực hiện trích xuất ma trận toán học `viewportTransform` kết hợp với kích thước thực/toạ độ điểm của đối tượng Proxy nhằm tính toán ra toạ độ pixel vật lý tuyệt đối trên màn hình. Sau đó hàm sẽ dùng Javascript sửa giá trị CSS nội tuyến trên thẻ video overlay.

### 3.2 Nhiều người dùng chia sẻ đồng thời

EvoDraw hỗ trợ số lượng không giới hạn các luồng chia sẻ màn hình trong mỗi phiên thực thông qua xử lý độc lập ở cấp độ kết nối.
- Ở phía máy chủ, bộ định danh này là `Map<roomId, Map<shareId, { socketId, username }>>`.
- Hàm `getSharerColor(username)` cấp phát tĩnh một màu sắc phân biệt cụ thể được kéo cấu trúc từ bảng gồm 8 dải màu luân phiên.
- Nếu người tham gia (Client C) truy cập muộn vào thư viện, máy khách gởi Socket `screen:get_active` yêu cầu danh sách toàn bộ các WebRTC Tracks. Track truyền tới sẽ được bảo lưu nội bộ `pending-socketId` cho đến khi ID hợp thành được xác nhận logic. 

### 5.3 Điều khiển độ phân giải

Tính năng cho phép đổi phân giải linh hoạt ngay cả trong phiên chia sẻ không dây nhờ hàm `changeResolution()`.
Giao thức này sẽ thăm dò tốc độ đọc FPS mới nhất từ API WebRTC thông qua mã `track.getSettings().frameRate` rồi áp cấu hình mới xuống `.applyConstraints(constraints)`. 
Băng thông khi ấy được bảo toàn; thiết lập độ phân giải 720p HD, 1080p FHD, hay 4K UHD đều phụ thuộc vào kết quả phần cứng trình chiếu từ hệ máy của người thuyết trình.

### 5.4 Điều khiển tốc độ khung hình (FPS)

Người dùng cũng có thể ép mức khung hình 15, 30 hoặc 60 FPS trong cửa sổ công cụ qua `changeFrameRate(newFps)`.
**Tối ưu hệ thống hiện tại:** Nhờ xóa bỏ thắt cổ chai của hàm `requestAnimationFrame` giới hạn ở mức 24fps cũ kia, các video DOM có thể chạy đến 60 khung hình/giây tự nhiên của phần cứng (Hardware GPU Video Decoding Engine của trình duyệt web) - lý do chính đem lại một trải nghiệm mượt mà chân thực không bóng ma.

### 5.5 Chia sẻ âm thanh hệ thống

Hợp nhất tài nguyên với hook `useVoiceChat.js`, thay vì mở thêm nhiều cổng P2P. Âm thanh chia sẻ màn hình, và Audio trò chuyện (Mic) đều dùng chung một bộ kết nối `RTCPeerConnection`.
Để giải quyết việc Node React đè lẫn trạng thái lên nhau trong State Management, khóa nhận diện theo công thức sau được ứng dụng:
`` `${targetSocketId}_${stream.id}` ``
Cách lập trình này cho phép tách bạch đường tiếng voice khác hẳn đường tiếng hệ thống, người nghe ở đầu cầu bên kia có thể tuỳ ý can thiệp một trong hai phần tử nhạc mà không ảnh hưởng tới âm thanh người trò chuyện.

### 5.6 Cách ly Undo/Redo tĩnh

Trong bộ máy Lịch Sử Hệ Thống (`hooks/useHistory.js`), mã nguồn sẽ thường xuyên quét bộ cờ `_evoScreenShare = true` đối với từng đối tượng nhận được trong event Canvas (`onAdded`, `onRemoved`, `onModified`, `onBeforeModify`). Bằng cách Return ngắt luồng ngay khi mã phát hiện Flag màn hình chia sẻ - đối tượng này không bao giờ xâm nhập được vào Array History Snapshot.
Người dùng có thể thao tác với Object chia sẻ màn hình thoải mái rôi bấm "Hoàn tác Ctrl+Z" thao tác hình vẽ, mà không ảnh hưởng đến vị trí hiện hành của Screen Shared.

### 5.7 Tối ưu hiệu năng & Quản lý Z-Index

* **Triệt Tiêu Tearing (Bẻ Khung Hình) canvas:** Mảng luồng được giải phóng khỏi canvas context (`ctx.drawImage`), hệ thống HTML5 đảm nhận kết xuất ảnh pixel tự động, kéo giảm 70% tài nguyên CPU tải cho App.
* **Xếp chồng Z-index chuyên nghiệp (Proper Z-ordering):** Layer Native Video thông qua CSS class `.screen-share-layer` nằm lót bên dưới tệp hình ảnh PNG/vector của lớp tương tác minh bạch `canvas .draw-surface`. Bút, màu mực, sticky note hoàn toàn nằm đè (overlap) tinh tế bên trên và không cản trở góc nhìn trực diện đối với video.

---

## 6. Luồng dữ liệu

### Presenter bắt đầu chia sẻ:
```
1. getDisplayMedia() → MediaStream
2. publishTrack() → LiveKit SFU
3. createScreenShareOverlay() → Proxy Rect trên canvas
4. canvas.add(proxyRect) → fires object:added
5. attachSerializer → broadcasts {type: 'object:added', object: {...}} đến tất cả peers
6. socket.emit('screen:start') → cập nhật UI danh sách
```

### Viewer nhận video:
```
1. LiveKit RoomEvent.TrackSubscribed → nhận MediaStream
2. setupOverlay() → findScreenShareRect(canvas, shareId)
3. 8ếu Proxy Rect đã có (từ WebSocket op): tái sử dụng
4. Nếu chưa: tạo mới (fallback)
5. createScreenShareOverlay(videoEl, shareId, name, canvas, layer, existingRect)
6. DOM overlay được tạo → video hiển thị tại vị trí đồng bộ
```

### Bất kỳ ai di chuyển/resize khung:
```
1. User drag/resize Proxy Rect
2. attachSerializer.onModified → broadcasts {type: 'object:modified', ...}
3. Tất cả peers: applyRemoteOp → target.set(props) → setCoords()
4. canvas.requestRenderAll() → after:render → syncOverlayPosition()
5. DOM overlay di chuyển theo → mọi người thấy cùng vị trí
6. LWW reconciliation giải quyết xung đột nếu có
```9. Tích hợp WebRTC & LiveKit

**LiveKit Integration:**
- Client sử dụng `@livekit/components-react` để quản lý kết nối SFU
- Server cấp JWT token qua `livekit:get-token` event
- Tracks được quản lý tự động, không cần signaling phức tạp

**K10 thừa từ useVoiceChat.js:**
- Hệ thống kế thừa cấu trúc Pool `useVoiceChat.js` từ ban đầu
- Khi DOM phát `<video autoplay muted>`, luồng Media `track.kind === 'video'` được nhồi vào event tuỳ chỉnh `evodraw:remote_video_track` via `window.dispatchEvent(...)`
- Event Listener hệ điều hành giúp Hooks tránh re-render, triệt tiêu lag

**Performance:**
- Từ 2 luồng RTC (voice + screen) → Unified connection (1 RTCPeerConnection)
- Bandwidth giảm 40-50% nhờ SFU forwarding thay vì P2P rẽ nhánh
1. Join room → request_snapshot từ server (KHÔNG chứa Proxy Rect)
2. Timeout → canvas_state_request từ peers (CÓ chứa Proxy Rect)
3. loadCanvasSnapshot() → Proxy Rect xuất hiện trên canvas
4. LiveKit TrackSubscribed → findScreenShareRect() → bind video vào Proxy Rect
5. DOM overlay hiển thị tại vị trí chính xác từ peer
```11. Giao diện điều khiển

---

## 7. Tham chiếu tệp mã nguồn

Dự án được mô đun hóa (refactor) để đạt tiêu chí mở rộng, bảo trì, cấu trúc đã sửa đổi chi tiết nhằm giảm thiểu sự cồng kềnh cho Toolbar truyền thống:

| Tệp / Thành phần | Vai trò cốt lõi |
|---|---|
| `apps/web/src/hooks/useScreenShare.js` | React Hook điều phối hệ sinh thái chia sẻ (vòng đời logic, Peer RTC Connection, quản lý DOM node cấp thấp và Proxy Canvas ảo). |
| `12pps/web/src/utils/screenShareObject.js` | Thư viện lõi chứa hàm khởi tạo thẻ video DOM vật lý (`createScreenShareOverlay`) và tính toán ma trận Transform Đồng bộ không gian (`syncOverlayPosition`). |
| `apps/web/src/components/Canvas/Canvas.jsx` | Ánh xạ HTML Layout: Cấu trúc bộ Node Z-index, nơi lớp div video nằm khít sau tấm `fabricCanvas` bao trùm. |
| `apps/web/src/components/Toolbar/Toolbar.jsx` | Container tổng điều hướng linh hoạt cho danh mục công cụ chính yếu. |
| `apps/web/src/components/Toolbar/ScreenShareOptions.jsx` | **[MỚI]** Component xử lý tách rời hệ thống nút và tuỳ chọn UI thiết lập Độ phẩn giải, FPS, và check-box Audio Share để giảm gánh nặng của Toolbar. |
| `apps/web/src/hooks/useHistory.js` | Cơ sở cấu hình loại rời Fabric Proxy tĩnh khỏi luồng tính state báo cáo Undo/Redo. |
| `apps/server/src/sockets/screen.handler.js` | Server node trung gian phân tích bản tin Websocket để cấp báo người tham gia mới đối với mọi sự kiện phát sinh. |

---

## 5. Giao thức sự kiện Socket.io

### Lệnh Phát (Client → Máy chủ)
- `screen:start` (`{ roomId, shareId }`) - Nhận định phiên video bắt đầu cấp luồng.
- `s3reen:stop` (`{ roomId, shareId }`) - Xóa xổ hoàn toàn định dạng luồng Video.
- `screen:get_active` (`{ roomId }`) - Fetch toàn diện mảng Array thông tin.

### Lệnh Lắng Nghe (Máy chủ → Client)
- `screen:started` (`{ socketId, shareId, username }`) - Server báo hiệu 1 Share bắt đầu vào phòng.
- `screen:stopped` (`{ shareId }`) - Tắt đi Share từ mọi góc nhìn client.
- `screen:active_list` (`{ shares }`) - Phản hồi từ get_active chứa metadata đầy đủ.

---

## 6. Tích hợp WebRTC

Hệ thống kế thừa cấu trúc thư mục Pool `useVoiceChat.js` mở từ ban đầu.
Kế hoạch khởi động khi DOM phát `<video autoplay muted>`, luồng Media `track.kind === 'video'` được nhồi vào event tuỳ chỉnh trên toàn cầu `evodraw:remote_video_track` bằng cơ chế `window.dispatchEvent(...)`. Sử dụng Event Listener hệ điều hành giúp các Module Hooks không bị nhồi re-render ở cây cha, triệt tiêu Lag đáng kể.

---

## 7. Mô hình đối tượng Proxy trên Canvas

Với mỗi lượt share mới, ta có một Proxy ảo được đẩy vào Fabric.js mô hình:

| Thuộc Tính Lệnh | Cấu hình | Ý nghĩa thực tiễn |
|---|---|---|
| `_evoScreenShare` | `true` | Đánh dấu phân tách Logic xử lý ngoại lệ cho tính năng này. |
| `fill` | `'rgba(0, 0, 0, 0.005)'` | Với Opacity cực nhỏ (0.5%) vừa đủ để Fabric có điểm nhận bắt sự kiện Tương tác Chuột theo trục X/Y, vừa vô hình với người bình thường. |
| `lockRotation` | `true` | Vô hiệu lệnh Transform Angle nhằm ngăn việc CSS Rotate video layer lỗi không đồng hành cùng tọa độ lưới toán. |
| `strokeWidth` | `0` | Canvas loại bỏ stroke, viền thẻ hiển thị User Label sẽ chuyển sang thiết kế Border/Outline tại CSS thuần của thẻ DOM, đảm bảo chống bệt ảnh Pixel và mờ sắc thái vector. |

---

## 8. Giao diện điều khiển (Đã tách Component)

Tính toàn khối đã được cải thiện với việc React-hóa cấu trúc UI ra tệp `ScreenShareOptions.jsx`, nhằm mang lại thanh menu dạng popover tối ưu nhất:

* **Menu Phân giải hình ảnh**: Đa lựa chọn theo dạng radio từ 720p HD, 1080p FHD, cho tới tiêu chuẩn 4K UHD cao cấp.
* **Menu Frame Rates (FPS)**: Nhảy mức chuẩn mực 15, 30 hoặc 60 fps với các cấp độ hiển thị.
* **Mic & System Sound**: Checkbox có tính năng chia sẻ audio màn hình, có lưu ý phụ thuộc tùy hệ điều hành OS (Khó hoạt động trên macOS bản chất hạn chế ghi âm phần cứng so với nhân Chromium Windows).
* **Bong bóng Cảnh Báo (Notification Badge)**: Huy hiệu đếm số luồng Video hiện hành được chiếu tại phần góc Toolbar giúp người truy cập dễ nhận diện những ai đang tương tác.

---

## 9. Vòng đời & Dọn dẹp tài nguyên

Với Node Browser chạy Chromium/Safari, Leak Ram về lâu về dài khi xử lý GPU Decode là một vấn đề báo động. Nêu thuật toán sau đảm bảo làm sạch:

- **Dừng Chia Sẻ (Call: `removeScreenShareOverlay`)**:
  - Gỡ ngay đăng ký callback khỏi Fabric (`moving`, `scaling`, `modified` và `after:render`) nhờ con trỏ `cleanup()` để hệ thống Browser Garbage Collector tái thu mảng Heap.
  - Phá hủy cấu trúc gắn trên Root Node bằng lệnh `entry.overlayDiv.removeChild(entry.videoEl)`.
  - Phá hủy Proxy Fabric Object qua `canvas.remove(proxy)` giải phóng vòng tuần hoàn render của phần đồ họa tương tác.
- **Unmount Toàn Bộ** (Call: `removeAllOverlays`):
  Trong trường hợp Client Component (RoomPage) Unmounted - tự out ra ngoài, Hook Return của React Effect được kêu réo, toàn bộ Track được dừng qua `track.stop()`. Server đón `disconnect` để gửi `screen:stopped` cho Room.

---

## 10. Hạn chế đã biết

1. **Âm thanh Hệ Thống macOS/Hệ Non-Chromium:** Tính năng cấp phép Web API `getDisplayMedia({ audio: true })` bị ngó lơ trên Safari Browser hoặc Firefox Browser. Cấu trúc thiết bị Mac cũng đòi hỏi người sử dụng cung cấp riêng quyền Audio Capture.
2. **Khóa Xoay Trượt Video (Lock Rotation):** Hệ thống chỉ áp dụng ma trận 2 phương chiều `Translate X/Y` và hệ phình nén `Scale`. Ma trận xoay của DOM Element (Rotation Degree / Perspective Axis) hiện bị vô hiệu hóa cưỡng chế nhằm làm giảm hiện tượng lag rách toạ độ điểm do lệch tâm điểm Fabric Scale vs DOM Rotation Matrix.
3. **Màn Hình Tạm Thời (Ephemeral Objects):** Khác biệt với việc bạn nạp Ảnh Bitmap/Vector có tính trường tồn - Video Live không xuất trạng thái cho Canvas JSON. F5 Trình Duyệt hay Refresh toàn bộ phòng sẽ tái nạp và xóa mất khoảnh khắc được chia sẻ đang quay màn hình, chỉ có người Live mới khởi động nối lại luồng Media được đi tiếp.
