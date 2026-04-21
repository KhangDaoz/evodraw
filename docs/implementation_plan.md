# Đồng Bộ Hoá Vị Trí Screen Share Box (LiveKit + Canvas Sync)

Dựa trên yêu cầu của bạn: *"tôi muốn trạng thái của mọi vật ở trên canvas giữa các người dùng luôn ở trạng thái thống nhất"* đối với các khung hình chia sẻ màn hình. 

Vấn đề hiện tại xảy ra là các khung proxy (viền màn hình được kéo thả) bị gỡ bỏ khỏi luồng Canvas Sync để tránh Race Condition do LiveKit tạo trùng lặp vật thể. Do đó, hiện tại nó mặc định nằm ở vị trí trung tâm màn hình của từng người và hoạt động cục bộ.

Để giải quyết, thay vì cô lập chúng cục bộ, chúng ta sẽ **tích hợp sâu 2 đầu cuối: Video Stream của LiveKit và Bounding Box của CanvasSerializer**.

## Phương Án Triển Khai (Proposed Changes)

Mọi khung hình chia sẻ màn hình (`proxyRect`) sẽ lại được chạy qua đường ống đồng bộ hoá chuẩn qua WebSockets (tương tự như các khối hình chữ nhật khác). Tuy nhiên để tránh Race Condition và lỗi xé bóng (2 object tạo đè lên nhau), chúng ta sẽ ánh xạ ID đặc biệt.

---

### 1. Nhanh chóng đưa Proxy Rect vào lại Bộ Lưu Trữ (Canvas Serializer)

Sửa đổi quy trình tuần tự hoá để chấp nhận vật thể `_evoScreenShare`.

#### [MODIFY] [canvasSerializer.js](file:///f:/TTCS/evodraw/apps/web/src/utils/canvasSerializer.js)
- Thêm thuộc tính nhận diện phiên livestream vào mảng serialize mặc định:
  ```javascript
  const CUSTOM_PROPS = ['_evoId', '_evoVersion', '_evoNonce', '_evoScreenShare', '_evoShareId', '_evoShareUser', '_evoShareColor']
  ```
- Xoá hoàn toàn block check lọc phần tử trong các hook:
  - Bỏ `if (target._evoScreenShare) return` trong `onAdded`, `onModified`, và `onRemoved`.
  - Bỏ bộ lọc `!obj._evoScreenShare` bên trong hàm lấy snapshot `serializeCanvas()`.
- Nhờ vậy, ngay khi host bật stream, một bản thể Proxy sẽ đồng bộ cho tất cả Viewers kể cả khi luồng video chưa tới nơi.

---

### 2. Thiết Kế Lại Thuật Toán Chèn DOM Overlay (Screen Share Manager)

Thay đổi thuật toán nhúng Video DOM để hoạt động hài hoà với Bounding Box đã được tạo ra từ WebSocket (thay vì tự sinh ra một Rectangle vô hồn khác).

#### [MODIFY] [screenShareObject.js](file:///f:/TTCS/evodraw/apps/web/src/utils/screenShareObject.js)
- Tại hàm `createScreenShareOverlay`, trước khi khởi tạo `fabric.Rect` ảo, hàm sẽ dò trên Canvas có tồn tại một vật thể nào chứa thuộc tính `o._evoShareId === shareId` hay không:
  - **Nếu Có (Có thể WebSocket đến sớm hơn đường LiveKit):** Bỏ qua bước tạo `fabric.Rect`, tái sử dụng trúng vật thể đó và nhúng khung hình `<video>` vào.
  - **Nếu Không:** Khởi tạo local placeholder `fabric.Rect`, NHƯNG gán định danh tuyệt đối `proxyRect._evoId = shareId;`. Khi WebSocket báo cáo thông tin chuẩn chậm một nhịp, cơ chế LWW (Last-Write-Wins) của canvas sẽ cập nhật chính xác lại các toạ độ cuối cùng đè lên placeholder đó.
- Bắt sự kiện Canvas `after:render` trên tập quản lý. Khi proxy box có biến đổi từ mạng network, CSS Transforms sẽ dịch chuyển Video lớp đáy khớp 100%.
- Bắt bổ sung sự kiện phòng hờ: Nếu host ngắt chia sẻ màn hình `proxyRect` bị vô hiệu hóa qua Socket `object:removed`, thì hook sẽ loại bỏ luôn DOM Video Layer để tránh thẻ DOM bị nằm lại hệ thống.

---

## User Review Required

> [!CAUTION]
> Chức năng này đồng nghĩa với việc: **Bất cứ ai** trong phòng cũng có quyền kéo, phóng to/thu nhỏ, nhấc khung hình đang chia sẻ của host vứt đi ra chỗ khác. Liệu đây có đúng thực sự là trải nghiệm bạn muốn bảo toàn (Mọi vật thể trên bảng đều công khai để mọi người tương tác chung)?

Nếu bạn đồng ý với kế hoạch khôi phục toàn vẹn thuật toán đồng bộ hoá này, vui lòng Approve để tôi bắt đầu code.
