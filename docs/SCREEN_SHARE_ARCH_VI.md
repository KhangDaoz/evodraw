# Tài Liệu Kỹ Thuật: Hệ Thống Screen Sharing Mới (LiveKit SFU & DOM Overlay)

Tài liệu này mô tả chi tiết những thay đổi gần đây để giải quyết vấn đề hiệu suất và đồng bộ màn hình (race condition) của tính năng Screen Sharing trong ứng dụng EvoDraw, cũng như cơ chế hoạt động chi tiết ở mức hệ thống (Technical Architecture).

## 1. Tóm Tắt Các Thay Đổi Chính (What We Have Changed)

Chúng ta đã tiến hành đại tu lại kiến trúc chia sẻ màn hình với các thay đổi trọng tâm:

1. **Gỡ bỏ WebRTC Mesh (P2P) cồng kềnh**: Chuyển đổi toàn bộ logic gọi video/chia sẻ màn hình sang kiến trúc **LiveKit SFU (Selective Forwarding Unit)**. Thay vì mỗi kết nối đều phải tự gửi tín hiệu SDP/ICE Candidates cho nhau, giờ đây mọi người sẽ kết nối đến một máy chủ LiveKit trung tâm.
2. **Quản lý Token (JWT) tập trung**: Phía Server thêm logic `livekit:get-token` (trong `chat.handler.js`) để cấp phát JWT cho các client dựa trên `roomId` và `username`.
3. **Cơ Chế Render 2 Lớp (DOM + Fabric Proxy)**: Loại bỏ cách vẽ từng frame video thủ công lên Canvas. Giờ đây video được đặt vào thẻ `<video>` HTML gốc ở lớp nền (DOM Layer) để tối ưu hoá bằng phần cứng, còn Fabric.js chỉ quản lý "khung tương tác ảo" (Proxy Rect) để đồng bộ khung hình chia sẻ.
4. **Đồng bộ hoá vị trí Proxy Rect qua Canvas Sync Pipeline**: Proxy Rect giờ đây được đối xử giống như bất kỳ đối tượng canvas nào khác — vị trí, kích thước, và trạng thái của nó được đồng bộ real-time qua WebSocket operations (`object:added`, `object:modified`, `object:removed`). Mọi người dùng đều thấy khung chia sẻ ở cùng một vị trí trên bảng vẽ.

---

## 2. Các Thành Phần Mới & Cơ Chế Hoạt Động (How It Works)

Hệ thống giờ đây được chia thành 4 thành tố rõ rệt phối hợp với nhau:

### A. Authentication & Signaling (`chat.handler.js`)
Trong backend WebSockets (Node.js), thay vì trao đổi tín hiệu P2P, chúng ta xây dựng API để client xin quyền truy cập vào LiveKit server. 
- Khi một người dùng yêu cầu (`livekit:get-token`), server sử dụng `LIVEKIT_API_KEY` và `LIVEKIT_API_SECRET` tạo ra một JWT token. 
- Token này chứa định danh duy nhất (`username-socketId`) cùng các quyền (Permissions) như `roomJoin`, `canPublish`, `canSubscribe`. Client dùng mã này để xác thực trực tiếp và an toàn với dịch vụ LiveKit SFU.

### B. Transport & Streaming Hooks (`useScreenShare.js`)
Hook này đảm nhận quản lý luồng sự kiện tách biệt theo mô hình Publish/Subscribe của LiveKit SDK:
- **Publishing (Người chia sẻ):** 
  Sử dụng Native Browser API (`navigator.mediaDevices.getDisplayMedia`) lấy video. Hook gọi API `room.localParticipant.publishTrack()` để đẩy MediaTrack lên LiveKit Server với định danh track là `shareId`. Một gói dữ liệu qua Socket.IO cơ bản (`screen:start`) vẫn được phát đi song song chỉ nhằm cập nhật giao diện (UI) danh sách đang chia sẻ.
- **Subscribing (Người xem):**
  Lắng nghe liên tục sự kiện `RoomEvent.TrackSubscribed` từ LiveKit. Ngay khi có track Video đi vào từ ai đó, trình duyệt biến nó thành MediaStream cục bộ, nhúng vào thẻ `<video>` trống và khởi chạy hàm tạo Overlay (`setupOverlay`).
- **Tái sử dụng Proxy Rect đã đồng bộ:**
  Trước khi tạo Overlay mới, `setupOverlay` gọi `findScreenShareRect(canvas, shareId)` để kiểm tra trên Canvas đã tồn tại Proxy Rect được đồng bộ từ WebSocket chưa. Nếu có, nó sẽ tái sử dụng Rect đó thay vì tạo Rect mới, đảm bảo vị trí hiển thị khớp với vị trí mà người chia sẻ (hoặc bất kỳ ai) đã đặt.

### C. Cơ Chế Kết Hợp DOM Overlay & Sync Position (`screenShareObject.js`)
Thay vì để luồng Video chèn lên Canvas (tốn kém tài nguyên Canvas API và khó quản lý z-index), chúng ta thiết kế mô hình phân lớp thông minh:
1. **Lớp Background Video (DOM Overlay):** Thẻ `<video>` được ném vào một thẻ `div` cha đặt sau lưng lớp nền của Fabric Canvas. CSS `pointer-events: none` được sử dụng để click xuyên qua.
2. **Lớp Fabric Proxy Rect:** Một hình chữ nhật ảo trong suốt (opacity siêu thấp 0.5%) với viền (border properties tiệp với màu của người chia sẻ) được sinh ra trên không gian của Fabric Canvas. Nó có vai trò hứng các sự kiện từ chuột/cảm ứng như kéo thả (Drag/Drop) hoặc tương tác tỉ lệ (Zoom/Resize).
3. **Bộ xử lý CSS Transform Mapper:** Bất cứ khi nào bạn tương tác với Proxy Rect trên Canvas (sự kiện `moving`, `scaling`) hoặc chính Canvas bị thay đổi góc nhìn camera (sự kiện `after:render` cho Pan & Zoom), hàm `syncOverlayPosition()` sẽ tự động chạy. Nó trích xuất tọa độ Scale/Translate của Canvas, nhân chia tỉ lệ và chuyển đổi thành thuộc tính `transform: translate(x, y)` CSS cho thẻ `<video>` ở dưới.
4. **Hỗ trợ Proxy Rect có sẵn (existingRect):** Hàm `createScreenShareOverlay` giờ nhận thêm tham số `existingRect`. Nếu phát hiện Rect đã tồn tại trên canvas (do WebSocket op đến trước LiveKit track), hàm sẽ bỏ qua bước tạo `fabric.Rect` mới, tái sử dụng Rect có sẵn với vị trí + kích thước đã được đồng bộ.

*Kết quả đột phá:* Ứng dụng vẽ có khả năng kết xuất Native Hardware Decoding cực kỳ mượt mà từ thẻ Video + Tương tác kéo thả màn hình như một object bình thường trên bảng vẽ + Hình nét vẽ và chữ luôn có khả năng xếp đè (overlay) hoàn hảo lên trên màn hình đang chiếu.

### D. Đồng Bộ Vị Trí Qua Canvas Sync Pipeline (`canvasSerializer.js`)
Đây là thay đổi quan trọng nhất so với thiết kế cũ. Trước đây, Proxy Rect bị **cô lập hoàn toàn** — mỗi người dùng tự đặt vị trí riêng. Giờ đây, Proxy Rect được tích hợp vào pipeline đồng bộ chuẩn:

- **Serialization Props:** `CUSTOM_PROPS` được mở rộng với `_evoScreenShare`, `_evoShareId`, `_evoShareUser`, `_evoShareColor` — đảm bảo metadata màn hình chia sẻ được truyền qua mạng.
- **Gỡ bỏ các rào chắn (guards):** Ba hàm `onAdded`, `onModified`, `onRemoved` trong `attachSerializer` không còn bỏ qua đối tượng `_evoScreenShare`. Khi presenter tạo hoặc di chuyển proxy rect, thao tác đó được broadcast cho tất cả peers.
- **LWW Reconciliation:** Sử dụng cơ chế Last-Write-Wins có sẵn (`shouldAcceptRemote`) để xử lý xung đột khi nhiều người cùng kéo thả khung chia sẻ.
- **Đồng bộ Peer-to-Peer:** `serializeCanvas()` nhận option `{ includeScreenShares }`. Server snapshots **không lưu** proxy rect (đối tượng tạm thời), nhưng khi peer gửi canvas state cho late joiner, proxy rect **được bao gồm** — đảm bảo người mới vào phòng nhận được đúng vị trí khung chia sẻ.
- **Deserialization:** `deserializeObject()` phục hồi đầy đủ metadata screen share (`_evoScreenShare`, `_evoShareId`, v.v.) khi nhận object từ remote.

### E. Dọn dẹp DOM Overlay khi ngắt kết nối
Khi một proxy rect bị xoá bởi remote canvas sync (ví dụ: presenter ngắt chia sẻ, op `object:removed` truyền đến), hook `useScreenShare` lắng nghe sự kiện `object:removed` trên Fabric canvas. Nếu đối tượng bị xoá mang cờ `_evoScreenShare`, DOM overlay tương ứng sẽ được dọn sạch tự động.

---

## 3. Luồng Dữ Liệu Chi Tiết (Data Flow)

### Presenter bắt đầu chia sẻ:
```
1. getDisplayMedia() → MediaStream
2. publishTrack() → LiveKit SFU
3. createScreenShareOverlay() → Proxy Rect (centered on presenter viewport, scene coords)
4. canvas.add(proxyRect) → fires object:added
5. attachSerializer → broadcasts {type: 'object:added', object: {...}} to all peers
```

### Viewer nhận video:
```
1. LiveKit RoomEvent.TrackSubscribed → MediaStream
2. setupOverlay() → findScreenShareRect(canvas, shareId)
3. Nếu Rect đã có (từ WebSocket op đến trước): reuse it
4. Nếu chưa có: tạo mới (fallback)
5. createScreenShareOverlay(videoEl, shareId, name, canvas, layer, existingRect)
6. DOM overlay được tạo → video hiển thị tại vị trí đồng bộ
```

### Bất kỳ ai di chuyển / resize khung:
```
1. User drag/resize proxy rect
2. attachSerializer.onModified → broadcasts {type: 'object:modified', ...}
3. All peers: applyRemoteOp → target.set(props) → setCoords()
4. canvas.requestRenderAll() → after:render → syncOverlayPosition()
5. DOM overlay di chuyển theo → mọi người thấy cùng vị trí
```

### Late Joiner:
```
1. Join room → request_snapshot từ server (KHÔNG chứa proxy rect)
2. Timeout → canvas_state_request từ peers (CÓ chứa proxy rect)
3. loadCanvasSnapshot() → proxy rect xuất hiện trên canvas
4. LiveKit TrackSubscribed → findScreenShareRect() → tìm thấy → bind video
```

---

## 4. Tổng Kết Các Ưu Điểm
- **Khả năng mở rộng mạnh mẽ (Scale):** Tối ưu với kiến trúc SFU chuyên dụng. Host chỉ gửi lên 1 luồng video lên LiveKit bất kể có bao nhiêu người tham gia. Tiết kiệm băng thông đáng kể so với P2P rẽ nhánh trước đây.
- **Tối ưu FPS (Hardware-accelerated):** Thay vì Render Video thành Fabric Image Object (sao chép mảng pixel liên tục tốn tài nguyên), giờ Video được xử lý và render tự nhiên (Native Decode) bởi Video Engine của hệ điều hành.
- **Trải nghiệm vẽ đồng tác cực tốt:** Hình vẽ (Canvas Layer) mặc định luôn nằm ở trên cùng của video, giúp team có thể brainstorm và vẽ phác thảo ghi chú dễ dàng, hỗ trợ trải nghiệm hợp tác (online collaboration) hoàn thiện hơn.
- **Trạng thái thống nhất (Consistent State):** Mọi người dùng nhìn thấy khung chia sẻ ở cùng một vị trí trên bảng vẽ. Bất kỳ ai cũng có thể kéo/resize và thay đổi sẽ đồng bộ cho tất cả.
- **Xử lý Late Joiner:** Người vào muộn nhận được vị trí chính xác từ peers đang online, không phải tự đoán vị trí.
