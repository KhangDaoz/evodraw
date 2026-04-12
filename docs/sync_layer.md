# Tài liệu Kỹ thuật: Hệ thống Đồng bộ Cộng tác (Sync Layer)

Tài liệu này ghi chú chi tiết về những thay đổi kiến trúc và tính năng đã được thực hiện trên nhánh `sang/feat/sync-layer`, bao gồm giải thích cách hoạt động cũng như cơ sở của các quyết định kỹ thuật được áp dụng cho EvoDraw.

## Tổng quan (Overview)
Mục tiêu cốt lõi của nhánh này là chuyển đổi EvoDraw từ một bảng vẽ cá nhân (hoặc realtime cơ bản) thành một **Hệ thống cộng tác (collaborative system) mạnh mẽ**, có khả năng xử lý va chạm dữ liệu khi có nhiều người cùng chỉnh sửa, đồng thời hỗ trợ lưu trữ tệp tin nhị phân (hình ảnh) tối ưu hóa.

## 1. Đồng bộ Canvas & Thuật toán LWW (Last-Writer-Wins)

### Đã làm gì?
- Triển khai serialization dữ liệu của Fabric.js thông qua một tập tin tiện ích `canvasSerializer.js`.
- Bổ sung cơ chế giải quyết xung đột bằng thuật toán **Last-Writer-Wins (LWW)** ở cấp độ phần tử (element-level).

### Cách hoạt động
- Mỗi đối tượng (object/stroke) vẽ ra trên Fabric.js được gán một ID duy nhất (`_evoId`), cùng với hai metadata quan trọng:
  - `_evoVersion`: Bộ đếm phiên bản của object.
  - `_evoNonce`: Mã ngẫu nhiên.
- Mỗi khi có sự thay đổi tại máy client (thêm mới, chỉnh sửa tọa độ, thay đổi màu sắc,...), `_evoVersion` sẽ được tăng lên (bump version) và một `_evoNonce` mới được tự động sinh ra trước khi gửi broadcast cho những người khác.
- Khi nhận được dữ liệu cập nhật từ socket từ một client khác, hệ thống dùng hàm `shouldAcceptRemote` để xác định:
  - Nếu bản remote có `_evoVersion` cao hơn -> **Chấp nhận (Ghi đè)**.
  - Nếu `_evoVersion` bằng nhau -> **Dùng `_evoNonce` để phân định deterministic** (Nonce nhỏ hơn sẽ thắng).
  - Ngược lại -> **Từ chối cập nhật** (giữ lại bản local hiện tại vì nó mới hơn).

### Tại sao lại chọn cách này?
- Thay vì cài đặt các giải pháp OT (Operational Transformation) hay CRDTs (Conflict-free Replicated Data Types) rất phức tạp và hao tốn tài nguyên xử lý trên trình duyệt, kiến trúc LWW với "Element-level versioning" rất nhẹ nhàng, đủ để ngăn hiện tượng "race conditions" (ghi đè ngược trạng thái cũ lên trạng thái mới) - một lỗi cực kỳ phổ biến trong các ứng dụng whiteboard realtime.

## 2. Dán Ảnh & Lưu Trữ Firebase (Firebase Storage Integration)

### Đã làm gì?
- Hỗ trợ dán trực tiếp ảnh từ bộ nhớ đệm (Clipboard) vào bảng vẽ bằng thao tác (Ctrl+V) thông qua hook mới `useImagePasting.js`.
- Cấu hình tải các luồng tệp tin hình ảnh lên **Firebase Storage** (tích hợp qua module `file.controller.js` ở backend).
- Đảm bảo hình ảnh được render lên Canvas sau khi upload thành công trên mọi thiết bị tham gia chung phòng.

### Cách hoạt động
1. Bắt sự kiện `paste` trên window. Nếu phát hiện tệp định dạng hình ảnh, hook sẽ gọi API `uploadFile` lên backend.
2. Backend nhận file (Nodejs) và proxy đẩy thẳng lên Firebase Storage bucket, sau đó trả về một Public URL (`imgUrl`).
3. Frontend dùng URL này khởi tạo `fabric.FabricImage` và nhúng nó vào chính giữa màn hình viewport đang hiển thị.

### Tại sao lại chọn cách này? (Hybrid Storage)
- **Tránh lưu chuỗi Base64 trên DB**: Base64 làm kích thước file JSON bị chình ình lên 30%, làm MongoDB hoạt động chậm chạp khi lưu snapshot của Room, dễ dẫn đến nghẽn cổ chai mạng (BSON Size limit).
- **Kiến trúc Hybrid (MongoDB + Firebase)**:
  - MongoDB cực kỳ xuất sắc để lưu *Room Snapshot (json)* và *Metadata* người dùng (nhỏ gọn, query lẹ).
  - Firebase Storage làm tốt chức năng lưu object binary tĩnh và tận dụng được nền tảng CDN toàn cầu, làm quá trình tải ảnh xuống nhanh hơn rất nhiều, chia sẻ được gánh nặng băng thông với Server Nodejs.

## 3. Quản lý Tool và Canvas Modular (Refactoring)

### Đã làm gì?
- Tổ chức lại mã nguồn Canvas bị phình to (Monolithic Component) bằng cách chia nhỏ logic thành các hooks: `useCanvasSync`, `useDrawingTools`...
- Bổ sung `Toolbar` component cho phép người dùng tùy chọn bút, màu sắc, cỡ nét, nét đứt nét liền.
- Phân tách và tối ưu hóa logic backend (Mongoose Models đối với `Room`), tính năng trỏ chuột theo thời gian thực (Remote cursors).

### Tại sao lại chọn cách này?
- Đảm bảo tính mở rộng của mã nguồn (Scalability), tách biệt hoàn toàn giữa việc **Vẽ (Drawing Logic)** và **Đồng Bộ (Sync Logic)** ra khỏi thành phần hiển thị (UI Components). Quá trình này rất quan trọng để đảm bảo việc debug các packet gửi/nhận thời gian thực không bị nhầm lẫn vào logic Render React.

---
> [!NOTE]
> **Tổng kết (Conclusion):** Nhánh này đã biến EvoDraw thành một hệ thống Client-Authoritative. Backend lúc này đóng vai trò như một bộ Router chuyển tiếp Message và Lưu trạng thái Room định kỳ, trong khi đó bộ não phân xử logic xung đột nằm ở chính các trình duyệt Clients thông qua cơ chế `_evoVersion` rất hiệu quả. Đoạn mã đã xử lý trọn vẹn những điểm khó nhất của công nghệ Collaborative Whiteboard hiện tại.
