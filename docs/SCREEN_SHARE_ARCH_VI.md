# Tài Liệu Kỹ Thuật: Hệ Thống Screen Sharing Mới (LiveKit SFU & DOM Overlay)

Tài liệu này mô tả chi tiết những thay đổi gần đây để giải quyết vấn đề hiệu suất và đồng bộ màn hình (race condition) của tính năng Screen Sharing trong ứng dụng EvoDraw, cũng như cơ chế hoạt động chi tiết ở mức hệ thống (Technical Architecture).

## 1. Tóm Tắt Các Thay Đổi Chính (What We Have Changed)

Chúng ta đã tiến hành đại tu lại kiến trúc chia sẻ màn hình với các thay đổi trọng tâm:

1. **Gỡ bỏ WebRTC Mesh (P2P) cồng kềnh**: Chuyển đổi toàn bộ logic gọi video/chia sẻ màn hình sang kiến trúc **LiveKit SFU (Selective Forwarding Unit)**. Thay vì mỗi kết nối đều phải tự gửi tín hiệu SDP/ICE Candidates cho nhau, giờ đây mọi người sẽ kết nối đến một máy chủ LiveKit trung tâm.
2. **Quản lý Token (JWT) tập trung**: Phía Server thêm logic `livekit:get-token` (trong `chat.handler.js`) để cấp phát JWT cho các client dựa trên `roomId` và `username`.
3. **Cơ Chế Render 2 Lớp (DOM + Fabric Proxy)**: Loại bỏ cách vẽ từng frame video thủ công lên Canvas. Giờ đây video được đặt vào thẻ `<video>` HTML gốc ở lớp nền (DOM Layer) để tối ưu hoá bằng phần cứng, còn Fabric.js chỉ quản lý "khung tương tác ảo" (Proxy Rect) để đồng bộ khung hình chia sẻ.
4. **Cô lập quá trình Serializer (Không đồng bộ Proxy State qua mạng)**: Cập nhật `canvasSerializer.js` để tự động bỏ qua (bypass) mọi thao tác thay đổi vị trí của màn hình chia sẻ (thông qua cờ `_evoScreenShare`). Khung hình được quản lý cục bộ ở mỗi đầu cuối.

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

### C. Cơ Chế Kết Hợp DOM Overlay & Sync Position (`screenShareObject.js`)
Thay vì để luồng Video chèn lên Canvas (tốn kém tài nguyên Canvas API và khó quản lý z-index), chúng ta thiết kế mô hình phân lớp thông minh:
1. **Lớp Background Video (DOM Overlay):** Thẻ `<video>` được ném vào một thẻ `div` cha đặt sau lưng lớp nền của Fabric Canvas. CSS `pointer-events: none` được sử dụng để click xuyên qua.
2. **Lớp Fabric Proxy Rect:** Một hình chữ nhật ảo trong suốt (opacity siêu thấp 0.5%) với viền (border properties tiệp với màu của người chia sẻ) được sinh ra trên không gian của Fabric Canvas. Nó có vai trò hứng các sự kiện từ chuột/cảm ứng như kéo thả (Drag/Drop) hoặc tương tác tỉ lệ (Zoom/Resize).
3. **Bộ xử lý CSS Transform Mapper:** Bất cứ khi nào bạn tương tác với Proxy Rect trên Canvas (sự kiện `moving`, `scaling`) hoặc chính Canvas bị thay đổi góc nhìn camera (sự kiện `after:render` cho Pan & Zoom), hàm `syncOverlayPosition()` sẽ tự động chạy. Nó trích xuất tọa độ Scale/Translate của Canvas, nhân chia tỉ lệ và chuyển đổi thành thuộc tính `transform: translate(x, y)` CSS cho thẻ `<video>` ở dưới.

*Kết quả đột phá:* Ứng dụng vẽ có khả năng kết xuất Native Hardware Decoding cực kỳ mượt mà từ thẻ Video + Tương tác kéo thả màn hình như một object bình thường trên bảng vẽ + Hình nét vẽ và chữ luôn có khả năng xếp đè (overlay) hoàn hảo lên trên màn hình đang chiếu.

### D. Giải Quyết Xung Đột Đồng Bộ - Race Condition (`canvasSerializer.js`)
Trước đây, WebSockets cố gắng thu thập thông tin thay đổi kích thước/vị trí của khung chia sẻ từ người dùng và broadcast vô tư lên toàn server. Điều đó làm các máy tranh giành vị trí đúng của khung chia sẻ (gây loạn giật vị trí liên tục - race condition).
- Ở thiết kế mới, hàm `createScreenShareOverlay` đã gài cờ đánh dấu `proxyRect._evoScreenShare = true`.
- Module `canvasSerializer.js` sẽ bỏ qua object này khỏi bộ nhớ lưu snapshot `serializeCanvas()`, đồng thời chặn hoàn toàn hành vi gửi dữ liệu kích thước qua mạng ở các hàm hook `onAdded`, `onModified`.
- Viewers khi nhận video track từ LiveKit sẽ tự dựng proxy object ngay chính giữa màn hình nội bộ của họ, cho phép mỗi thành viên có thể xếp đặt, phóng to, hay đẩy khung video ra các vị trí khác nhau để tối ưu hóa không gian làm việc cá nhân của mình, bất kể hành vi đặt vị trí của host như thế nào!

---

## 3. Tổng Kết Các Ưu Điểm
- **Khả năng mở rộng mạnh mẽ (Scale):** Tối ưu với kiến trúc SFU chuyên dụng. Host chỉ gửi lên 1 luồng video lên LiveKit bất kể có bao nhiêu người tham gia. Tiết kiệm băng thông đáng kể so với P2P rẽ nhánh trước đây.
- **Tối ưu FPS (Hardware-accelerated):** Thay vì Render Video thành Fabric Image Object (sao chép mảng pixel liên tục tốn tài nguyên), giờ Video được xử lý và render tự nhiên (Native Decode) bởi Video Engine của hệ điều hành.
- **Trải nghiệm vẽ đồng tác cực tốt:** Hình vẽ (Canvas Layer) mặc định luôn nằm ở trên cùng của video, giúp team có thể brainstorm và vẽ phác thảo ghi chú dễ dàng, hỗ trợ trải nghiệm hợp tác (online collaboration) hoàn thiện hơn.
