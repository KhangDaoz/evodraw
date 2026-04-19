# Tính năng Chia sẻ Màn hình — Tài liệu Kỹ thuật

> **Nhánh**: `web`
> **Cập nhật lần cuối**: 19-04-2026

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc hệ thống - Native DOM Overlay](#2-kiến-trúc-hệ-thống---native-dom-overlay)
3. [Chi tiết tính năng](#3-chi-tiết-tính-năng)
   - 3.1 [Chiến lược Native Video Overlay + Fabric Proxy](#31-chiến-lược-native-video-overlay--fabric-proxy)
   - 3.2 [Nhiều người dùng chia sẻ đồng thời](#32-nhiều-người-dùng-chia-sẻ-đồng-thời)
   - 3.3 [Điều khiển độ phân giải](#33-điều-khiển-độ-phân-giải)
   - 3.4 [Điều khiển tốc độ khung hình (FPS)](#34-điều-khiển-tốc-độ-khung-hình-fps)
   - 3.5 [Chia sẻ âm thanh hệ thống](#35-chia-sẻ-âm-thanh-hệ-thống)
   - 3.6 [Cách ly Undo/Redo tĩnh](#36-cách-ly-undo-redo-tĩnh)
   - 3.7 [Tối ưu hiệu năng & Quản lý Z-Index](#37-tối-ưu-hiệu-năng--quản-lý-z-index)
4. [Tham chiếu tệp mã nguồn](#4-tham-chiếu-tệp-mã-nguồn)
5. [Giao thức sự kiện Socket.io](#5-giao-thức-sự-kiện-socketio)
6. [Tích hợp WebRTC](#6-tích-hợp-webrtc)
7. [Mô hình đối tượng Proxy trên Canvas](#7-mô-hình-đối-tượng-proxy-trên-canvas)
8. [Giao diện điều khiển (Đã tách Component)](#8-giao-diện-điều-khiển-đã-tách-component)
9. [Vòng đời & Dọn dẹp tài nguyên](#9-vòng-đời--dọn-dẹp-tài-nguyên)
10. [Hạn chế đã biết](#10-hạn-chế-đã-biết)

---

## 1. Tổng quan

Tính năng Chia sẻ Màn hình trong EvoDraw đã được nâng cấp lên kiến trúc **Native DOM Video Overlay**, cho phép đạt hiệu suất phát lại video chất lượng cao (mượt mà như Discord) trong khi vẫn duy trì khả năng tương tác và chú thích. 

Luồng chia sẻ được hiển thị trong một lớp DOM phía dưới bảng vẽ Fabric.js minh bạch, mang lại trải nghiệm ưu việt, hỗ trợ thay đổi thứ tự lớp, di chuyển và phóng to/thu nhỏ như các đối tượng vẽ thông thường nhưng với hiệu suất phần cứng giải mã video tối đa.

### Các khả năng chính

| Khả năng | Mô tả |
|---|---|
| **Hiển thị Native DOM Overlay** | Sử dụng thẻ `<video>` bản địa của trình duyệt đảm bảo FPS và độ phân giải tối ưu nhất. |
| **Bảo lưu Z-Index chú thích** | Các nét vẽ và ghi chú tồn tại trên lớp `canvas` nằm nổi phía trên lớp video, giúp người xem vẽ đè lên hình ảnh chia sẻ màn hình. |
| **Nhiều người chia sẻ** | Đa luồng chia sẻ đồng thời, mỗi luồng được nhận diện, theo dõi và mã hóa bởi màu viền riêng biệt. |
| **Điều khiển linh hoạt** | Chuyển đổi giữa 720p HD, 1080p FHD, 4K UHD hoặc 15/30/60 FPS một cách trơn tru giữa chừng thông qua `track.applyConstraints`. |
| **Hỗ trợ âm thanh** | Tùy chọn thu âm thanh hệ thống hoặc tab phát kèm theo kết nối luồng video. |
| **Đồng bộ hóa không gian** | Tạo một đối tượng `fabric.Rect` ảo ẩn trên Canvas để xử lý tương tác kéo/thả và tự động ánh xạ ma trận biến đổi (pan/zoom/scale) xuống thẻ video thực thụ bên dưới. |

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

## 3. Chi tiết tính năng

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

### 3.3 Điều khiển độ phân giải

Tính năng cho phép đổi phân giải linh hoạt ngay cả trong phiên chia sẻ không dây nhờ hàm `changeResolution()`.
Giao thức này sẽ thăm dò tốc độ đọc FPS mới nhất từ API WebRTC thông qua mã `track.getSettings().frameRate` rồi áp cấu hình mới xuống `.applyConstraints(constraints)`. 
Băng thông khi ấy được bảo toàn; thiết lập độ phân giải 720p HD, 1080p FHD, hay 4K UHD đều phụ thuộc vào kết quả phần cứng trình chiếu từ hệ máy của người thuyết trình.

### 3.4 Điều khiển tốc độ khung hình (FPS)

Người dùng cũng có thể ép mức khung hình 15, 30 hoặc 60 FPS trong cửa sổ công cụ qua `changeFrameRate(newFps)`.
**Tối ưu hệ thống hiện tại:** Nhờ xóa bỏ thắt cổ chai của hàm `requestAnimationFrame` giới hạn ở mức 24fps cũ kia, các video DOM có thể chạy đến 60 khung hình/giây tự nhiên của phần cứng (Hardware GPU Video Decoding Engine của trình duyệt web) - lý do chính đem lại một trải nghiệm mượt mà chân thực không bóng ma.

### 3.5 Chia sẻ âm thanh hệ thống

Hợp nhất tài nguyên với hook `useVoiceChat.js`, thay vì mở thêm nhiều cổng P2P. Âm thanh chia sẻ màn hình, và Audio trò chuyện (Mic) đều dùng chung một bộ kết nối `RTCPeerConnection`.
Để giải quyết việc Node React đè lẫn trạng thái lên nhau trong State Management, khóa nhận diện theo công thức sau được ứng dụng:
`` `${targetSocketId}_${stream.id}` ``
Cách lập trình này cho phép tách bạch đường tiếng voice khác hẳn đường tiếng hệ thống, người nghe ở đầu cầu bên kia có thể tuỳ ý can thiệp một trong hai phần tử nhạc mà không ảnh hưởng tới âm thanh người trò chuyện.

### 3.6 Cách ly Undo/Redo tĩnh

Trong bộ máy Lịch Sử Hệ Thống (`hooks/useHistory.js`), mã nguồn sẽ thường xuyên quét bộ cờ `_evoScreenShare = true` đối với từng đối tượng nhận được trong event Canvas (`onAdded`, `onRemoved`, `onModified`, `onBeforeModify`). Bằng cách Return ngắt luồng ngay khi mã phát hiện Flag màn hình chia sẻ - đối tượng này không bao giờ xâm nhập được vào Array History Snapshot.
Người dùng có thể thao tác với Object chia sẻ màn hình thoải mái rôi bấm "Hoàn tác Ctrl+Z" thao tác hình vẽ, mà không ảnh hưởng đến vị trí hiện hành của Screen Shared.

### 3.7 Tối ưu hiệu năng & Quản lý Z-Index

* **Triệt Tiêu Tearing (Bẻ Khung Hình) canvas:** Mảng luồng được giải phóng khỏi canvas context (`ctx.drawImage`), hệ thống HTML5 đảm nhận kết xuất ảnh pixel tự động, kéo giảm 70% tài nguyên CPU tải cho App.
* **Xếp chồng Z-index chuyên nghiệp (Proper Z-ordering):** Layer Native Video thông qua CSS class `.screen-share-layer` nằm lót bên dưới tệp hình ảnh PNG/vector của lớp tương tác minh bạch `canvas .draw-surface`. Bút, màu mực, sticky note hoàn toàn nằm đè (overlap) tinh tế bên trên và không cản trở góc nhìn trực diện đối với video.

---

## 4. Tham chiếu tệp mã nguồn

Dự án được mô đun hóa (refactor) để đạt tiêu chí mở rộng, bảo trì, cấu trúc đã sửa đổi chi tiết nhằm giảm thiểu sự cồng kềnh cho Toolbar truyền thống:

| Tệp / Thành phần | Vai trò cốt lõi |
|---|---|
| `apps/web/src/hooks/useScreenShare.js` | React Hook điều phối hệ sinh thái chia sẻ (vòng đời logic, Peer RTC Connection, quản lý DOM node cấp thấp và Proxy Canvas ảo). |
| `apps/web/src/utils/screenShareObject.js` | Thư viện lõi chứa hàm khởi tạo thẻ video DOM vật lý (`createScreenShareOverlay`) và tính toán ma trận Transform Đồng bộ không gian (`syncOverlayPosition`). |
| `apps/web/src/components/Canvas/Canvas.jsx` | Ánh xạ HTML Layout: Cấu trúc bộ Node Z-index, nơi lớp div video nằm khít sau tấm `fabricCanvas` bao trùm. |
| `apps/web/src/components/Toolbar/Toolbar.jsx` | Container tổng điều hướng linh hoạt cho danh mục công cụ chính yếu. |
| `apps/web/src/components/Toolbar/ScreenShareOptions.jsx` | **[MỚI]** Component xử lý tách rời hệ thống nút và tuỳ chọn UI thiết lập Độ phẩn giải, FPS, và check-box Audio Share để giảm gánh nặng của Toolbar. |
| `apps/web/src/hooks/useHistory.js` | Cơ sở cấu hình loại rời Fabric Proxy tĩnh khỏi luồng tính state báo cáo Undo/Redo. |
| `apps/server/src/sockets/screen.handler.js` | Server node trung gian phân tích bản tin Websocket để cấp báo người tham gia mới đối với mọi sự kiện phát sinh. |

---

## 5. Giao thức sự kiện Socket.io

### Lệnh Phát (Client → Máy chủ)
- `screen:start` (`{ roomId, shareId }`) - Nhận định phiên video bắt đầu cấp luồng.
- `screen:stop` (`{ roomId, shareId }`) - Xóa xổ hoàn toàn định dạng luồng Video.
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
