# Tính năng Chia sẻ Màn hình — Tài liệu Kỹ thuật

> **Nhánh**: `web` (gộp từ `sang/feat/screen-share`)  
> **Cập nhật lần cuối**: 19-04-2026

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Chi tiết tính năng](#3-chi-tiết-tính-năng)
   - 3.1 [Chia sẻ màn hình trực tiếp trên Canvas](#31-chia-sẻ-màn-hình-trực-tiếp-trên-canvas)
   - 3.2 [Nhiều người dùng chia sẻ đồng thời](#32-nhiều-người-dùng-chia-sẻ-đồng-thời)
   - 3.3 [Điều khiển độ phân giải](#33-điều-khiển-độ-phân-giải)
   - 3.4 [Điều khiển tốc độ khung hình (FPS)](#34-điều-khiển-tốc-độ-khung-hình-fps)
   - 3.5 [Chia sẻ âm thanh hệ thống](#35-chia-sẻ-âm-thanh-hệ-thống)
   - 3.6 [Cách ly Undo/Redo](#36-cách-ly-undoredo)
   - 3.7 [Tối ưu hiệu năng](#37-tối-ưu-hiệu-năng)
4. [Tham chiếu tệp mã nguồn](#4-tham-chiếu-tệp-mã-nguồn)
5. [Giao thức sự kiện Socket.io](#5-giao-thức-sự-kiện-socketio)
6. [Tích hợp WebRTC](#6-tích-hợp-webrtc)
7. [Mô hình đối tượng Fabric.js trên Canvas](#7-mô-hình-đối-tượng-fabricjs-trên-canvas)
8. [Giao diện điều khiển](#8-giao-diện-điều-khiển)
9. [Vòng đời & Dọn dẹp tài nguyên](#9-vòng-đời--dọn-dẹp-tài-nguyên)
10. [Hạn chế đã biết](#10-hạn-chế-đã-biết)

---

## 1. Tổng quan

Tính năng Chia sẻ Màn hình cho phép bất kỳ người dùng nào trong phòng vẽ cộng tác có thể chia sẻ màn hình (hoặc một cửa sổ ứng dụng/tab trình duyệt cụ thể) dưới dạng **đối tượng tương tác trực tiếp trên canvas Fabric.js**. Khác với các công cụ chia sẻ màn hình truyền thống (video hiển thị trong một panel cố định), EvoDraw hiển thị luồng chia sẻ trực tiếp trên bề mặt vẽ — người dùng có thể **di chuyển, thay đổi kích thước và sắp xếp lớp** cùng với các đối tượng vẽ khác.

### Các khả năng chính

| Khả năng | Mô tả |
|---|---|
| **Hiển thị trực tiếp trên Canvas** | Luồng chia sẻ là đối tượng `fabric.Rect` với hàm `_render` tùy chỉnh để vẽ các khung hình video trực tiếp |
| **Nhiều người chia sẻ đồng thời** | Nhiều người dùng có thể chia sẻ cùng lúc; mỗi luồng chia sẻ được đánh dấu bằng viền màu riêng biệt |
| **Chọn độ phân giải** | 720p HD, 1080p FHD, 4K UHD — có thể thay đổi trước hoặc trong khi đang chia sẻ |
| **Điều chỉnh FPS** | 15, 30, hoặc 60 fps — có thể thay đổi trực tiếp qua `track.applyConstraints()` |
| **Âm thanh hệ thống** | Tùy chọn thu âm thanh hệ thống/tab cùng với luồng video |
| **Cách ly Undo/Redo** | Các đối tượng chia sẻ màn hình được loại trừ khỏi lịch sử undo/redo của canvas |
| **Kết xuất bộ đệm ngoài màn hình** | Khung hình video được vẽ trước vào canvas ẩn để tối ưu hiệu suất |
| **Hỗ trợ người tham gia muộn** | Người dùng tham gia phòng sau khi chia sẻ đã bắt đầu vẫn sẽ thấy luồng chia sẻ |

---

## 2. Kiến trúc hệ thống

```
┌──────────────────────────────────────────────────────────────────┐
│                   NGƯỜI TRÌNH BÀY (Client A)                     │
│                                                                  │
│  getDisplayMedia() ──► MediaStream ──► RTCPeerConnection.addTrack│
│         │                                       │                │
│         ▼                                       ▼                │
│  <video> cục bộ ──► screenShareObject.js    WebRTC → Peer xa     │
│         │           (bộ đệm ngoài màn hình)                     │
│         ▼                                                        │
│  fabric.Rect._render() ──► Canvas                                │
└──────────────────────────────────────────────────────────────────┘
                              │
                   Tín hiệu qua Socket.io
                   (screen:start, screen:stop)
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                  MÁY CHỦ (screen.handler.js)                     │
│                                                                  │
│  activeShares: Map<roomId, Map<shareId, {socketId, username}>>   │
│  Sự kiện: screen:start → screen:started                          │
│           screen:stop  → screen:stopped                          │
│           screen:get_active → screen:active_list                 │
│           disconnect → tự động dọn dẹp                           │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                   NGƯỜI XEM (Client B)                            │
│                                                                  │
│  RTCPeerConnection.ontrack ──► sự kiện evodraw:remote_video_track│
│         │                                                        │
│         ▼                                                        │
│  <video> từ xa ──► screenShareObject.js ──► fabric.Rect          │
│                    (bộ đệm ngoài màn hình)     trên Canvas       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Chi tiết tính năng

### 3.1 Chia sẻ màn hình trực tiếp trên Canvas

**Cách hoạt động:**

1. Người trình bày nhấn nút chia sẻ màn hình trên Thanh công cụ (Toolbar).
2. API `getDisplayMedia()` của trình duyệt được gọi để thu hình màn hình, cửa sổ hoặc tab.
3. Một phần tử `<video>` ẩn được tạo và gắn với `MediaStream` đã thu.
4. `createScreenShareImage()` tạo một `fabric.Rect` với:
   - Một **bộ đệm `<canvas>` ngoài màn hình** để kết xuất khung hình trước.
   - Một **hàm `_render()` tùy chỉnh** sao chép bộ đệm lên ngữ cảnh canvas của Fabric.
5. `startFrameLoop()` chạy vòng lặp `requestAnimationFrame` để sao chép khung hình video vào bộ đệm ở tốc độ ~24 fps và gọi `canvas.requestRenderAll()`.
6. Video track được thêm vào tất cả các `RTCPeerConnection` hiện có, và quá trình tái thương lượng SDP được kích hoạt để các peer từ xa nhận được luồng.

**Tệp mã nguồn:**
- `apps/web/src/hooks/useScreenShare.js` — React hook quản lý vòng đời chia sẻ
- `apps/web/src/utils/screenShareObject.js` — Nhà máy đối tượng Fabric và vòng lặp kết xuất

---

### 3.2 Nhiều người dùng chia sẻ đồng thời

Nhiều người dùng có thể chia sẻ màn hình cùng một lúc trong cùng một phòng. Mỗi luồng chia sẻ được theo dõi độc lập.

**Định danh:**
- Mỗi luồng chia sẻ nhận một **`shareId` duy nhất** được tạo theo định dạng: `share-{timestamp}-{5_ký_tự_ngẫu_nhiên}`
- Máy chủ duy trì một bộ ghi nhớ trong bộ nhớ: `Map<roomId, Map<shareId, { socketId, username }>>`
- Mỗi người chia sẻ được gán một **màu viền riêng biệt** từ bảng 8 màu luân phiên

**Bảng màu:**
```
#e03131 (Đỏ)      #1971c2 (Xanh dương)  #2f9e44 (Xanh lá)   #f76707 (Cam)
#7048e8 (Tím)      #c2255c (Hồng)        #f59f00 (Vàng)       #0ca678 (Xanh ngọc)
```

**Luồng xử lý người tham gia muộn:**
1. Khi người dùng mới kết nối, client gửi sự kiện `screen:get_active`.
2. Máy chủ phản hồi với `screen:active_list` chứa tất cả các mục `{ shareId, socketId, username }` đang hoạt động.
3. Client lắng nghe sự kiện `evodraw:remote_video_track` từ tầng WebRTC và ghép nối video track nhận được với shareId đã biết thông qua socketId.
4. Nếu video track đến *trước* metadata của luồng chia sẻ, nó được lưu tạm dưới khóa `pending-{socketId}` và thử lại khi `activeShares` được cập nhật.

---

### 3.3 Điều khiển độ phân giải

Người dùng có thể cấu hình độ phân giải video **trước khi bắt đầu** chia sẻ hoặc **trong khi đang chia sẻ**.

| Tùy chọn | Chiều rộng | Chiều cao | Loại ràng buộc |
|--------|-------|--------|-----------------|
| 720p HD | 1280 | 720 | `{ ideal, max }` |
| 1080p FHD | 1920 | 1080 | `{ ideal, max }` |
| 4K UHD | 3840 | 2160 | `{ ideal, max }` |

**Cách triển khai:**

- **Trước khi bắt đầu:** Độ phân giải đã chọn được truyền vào `navigator.mediaDevices.getDisplayMedia({ video: { width, height, ... } })`.
- **Trong khi đang chia sẻ:** `track.applyConstraints()` được gọi trên video track đang hoạt động với các ràng buộc độ phân giải mới. Trình duyệt điều chỉnh độ phân giải thu hình mà không làm gián đoạn luồng.
- **Bảo toàn FPS:** Khi thay đổi độ phân giải, FPS hiện tại được đọc từ `track.getSettings().frameRate` và được giữ nguyên trong bộ ràng buộc mới thông qua `buildVideoConstraints(res, fps)`.

**Mã nguồn:** `useScreenShare.js` → `changeResolution()`, `buildVideoConstraints()`

---

### 3.4 Điều khiển tốc độ khung hình (FPS)

Người dùng có thể đặt tốc độ khung hình thu hình là **15, 30, hoặc 60 fps**.

**Cách triển khai:**

- **Trước khi bắt đầu:** Giá trị FPS được đưa vào ràng buộc của `getDisplayMedia` dưới dạng `frameRate: { ideal: fps, max: fps }`.
- **Trong khi đang chia sẻ:** `changeFrameRate(newFps)` gọi `track.applyConstraints({ frameRate: { ideal, max } })` trên video track đang hoạt động.

> **Lưu ý:** *Vòng lặp kết xuất* trong `screenShareObject.js` chạy ở tốc độ cố định 24 fps bất kể FPS thu hình. Điều này là có chủ đích — FPS thu hình kiểm soát số khung hình trình duyệt thu từ nguồn, trong khi vòng lặp kết xuất kiểm soát tần suất Fabric vẽ lại. FPS thu hình cao hơn mang lại chuyển động mượt hơn ngay cả ở tốc độ kết xuất 24 fps nhờ các khung hình mới hơn.

**Mã nguồn:** `useScreenShare.js` → `changeFrameRate()`, `buildVideoConstraints()`

---

### 3.5 Chia sẻ âm thanh hệ thống

Người dùng có thể tùy chọn bao gồm âm thanh hệ thống/tab trong luồng chia sẻ màn hình.

**Cách triển khai:**

- Một checkbox "Share System Audio" (Chia sẻ âm thanh hệ thống) có sẵn trong menu tùy chọn chia sẻ màn hình.
- Khi được bật, `getDisplayMedia()` được gọi với `audio: true` thay vì `audio: false`.
- Audio track thu được sẽ:
  1. Được thêm vào tất cả các `RTCPeerConnection` hiện có cùng với video track.
  2. Được thêm vào các kết nối peer mới thông qua trình xử lý sự kiện `evodraw:peer_created`.
  3. Được gỡ bỏ đúng cách khỏi tất cả kết nối peer khi dừng chia sẻ, sử dụng khớp track chính xác (`tracksToRemove.includes(sender.track)`).

**Xử lý xung đột luồng âm thanh:**

Do voice chat và âm thanh chia sẻ màn hình đều truyền qua cùng một `RTCPeerConnection`, hook `useVoiceChat.js` đánh chỉ mục các luồng âm thanh đến bằng `${targetSocketId}_${stream.id}` (thay vì chỉ `targetSocketId`) để ngăn âm thanh chia sẻ màn hình ghi đè lên âm thanh voice chat trong state React.

> **Hỗ trợ trình duyệt:** Thu âm thanh hệ thống chỉ được hỗ trợ trên các trình duyệt dựa trên Chromium. Firefox và Safari sẽ bỏ qua ràng buộc `audio: true` một cách im lặng. Âm thanh tab yêu cầu người dùng tích chọn rõ ràng "Share tab audio" (Chia sẻ âm thanh tab) trong hộp thoại chọn của trình duyệt.

**Mã nguồn:** `useScreenShare.js` → `startSharing()`, `useVoiceChat.js` → trình xử lý `ontrack`

---

### 3.6 Cách ly Undo/Redo

Các đối tượng chia sẻ màn hình được **loại trừ hoàn toàn** khỏi hệ thống lịch sử undo/redo của canvas. Điều này ngăn chặn tình huống nhấn Ctrl+Z vô tình xóa hoặc sửa đổi một luồng chia sẻ màn hình đang hoạt động.

**Cách triển khai:**

Hook `useHistory.js` kiểm tra cờ `_evoScreenShare` trong bốn trình xử lý sự kiện:

| Trình xử lý sự kiện | Kiểm tra được thêm |
|---|---|
| `onAdded` | `if (... \|\| target._evoScreenShare) return` |
| `onRemoved` | `if (... \|\| target._evoScreenShare) return` |
| `onModified` | `if (... \|\| target._evoScreenShare) return` |
| `onBeforeModify` | `if (... \|\| e.target._evoScreenShare) return` |

Điều này có nghĩa:
- Thêm luồng chia sẻ màn hình vào canvas **không** đẩy vào ngăn xếp undo.
- Di chuyển/thay đổi kích thước luồng chia sẻ **không** tạo mục lịch sử.
- Xóa luồng chia sẻ màn hình **không** đẩy vào ngăn xếp undo.

**Mã nguồn:** `apps/web/src/hooks/useHistory.js` — dòng 28, 43, 52, 68

---

### 3.7 Tối ưu hiệu năng

Đường ống kết xuất đã được tối ưu để giảm thiểu độ trễ khi các luồng chia sẻ màn hình hoạt động cùng với các thao tác vẽ.

#### Bộ đệm Canvas ngoài màn hình

```
Phần tử Video ──drawImage──► Bộ đệm <canvas> ẩn ──drawImage──► Fabric _render()
   (giải mã)                 (khung hình vẽ sẵn)               (tổng hợp canvas)
```

- Khung hình video được giải mã và vẽ vào phần tử `<canvas>` ẩn trong vòng lặp kết xuất, **bên ngoài** đường ống tổng hợp của Fabric.
- Hàm `_render()` tùy chỉnh của Fabric chỉ đơn giản sao chép bộ đệm đã vẽ sẵn — một thao tác sao chép canvas-sang-canvas rẻ.
- Ngữ cảnh bộ đệm được tạo với `{ alpha: false }`, cho phép trình duyệt sử dụng đường tổng hợp nhanh hơn.

#### Kết xuất gộp (Coalesced Rendering)

- Sử dụng `canvas.requestRenderAll()` thay vì `canvas.renderAll()`.
- `requestRenderAll` gộp nhiều lời gọi thành **một lần vẽ duy nhất** tại khung hình hoạt ảnh tiếp theo của trình duyệt. Điều này ngăn chặn việc vẽ lại toàn bộ canvas không cần thiết khi có nhiều luồng chia sẻ đang hoạt động.

#### Cờ Dirty (Dirty Flag)

- Chỉ đối tượng chia sẻ màn hình được đánh dấu `fabricObj.dirty = true` trước khi yêu cầu vẽ lại, báo cho Fabric rằng chỉ cần tổng hợp lại đối tượng cụ thể đó thay vì tính toán lại toàn bộ khung cảnh.

#### Điều chỉnh thời gian khung hình với sửa lỗi trôi (Drift Correction)

```javascript
lastTime = now - (elapsed % FRAME_INTERVAL)
```

Thay vì đặt `lastTime = now` (gây ra trôi thời gian tích lũy), công thức sửa lỗi tính toán thời gian vượt quá, duy trì nhịp khung hình ổn định.

#### Tự động thay đổi kích thước bộ đệm

Nếu độ phân giải video thay đổi giữa chừng (ví dụ qua `changeResolution()`), canvas bộ đệm tự động được điều chỉnh kích thước cho phù hợp:

```javascript
if (bufferCanvas.width !== videoEl.videoWidth || bufferCanvas.height !== videoEl.videoHeight) {
  bufferCanvas.width = videoEl.videoWidth
  bufferCanvas.height = videoEl.videoHeight
}
```

---

## 4. Tham chiếu tệp mã nguồn

| Tệp | Vai trò |
|---|---|
| `apps/web/src/hooks/useScreenShare.js` | Hook React chính — vòng đời chia sẻ, quản lý track WebRTC, tín hiệu Socket.io |
| `apps/web/src/utils/screenShareObject.js` | Nhà máy đối tượng Fabric.js, bộ đệm ngoài màn hình, vòng lặp kết xuất |
| `apps/web/src/hooks/useHistory.js` | Undo/redo canvas — sửa đổi để loại trừ đối tượng `_evoScreenShare` |
| `apps/web/src/hooks/useVoiceChat.js` | Pool kết nối peer WebRTC — dùng chung với chia sẻ màn hình, đánh khóa luồng âm thanh |
| `apps/web/src/components/Toolbar/Toolbar.jsx` | Giao diện — nút chia sẻ màn hình, popup tùy chọn độ phân giải/FPS/âm thanh |
| `apps/web/src/pages/RoomPage/RoomPage.jsx` | Trang — quản lý state cho độ phân giải, FPS, âm thanh; kết nối hook với Toolbar |
| `apps/server/src/sockets/screen.handler.js` | Máy chủ — chuyển tiếp tín hiệu, bộ ghi luồng chia sẻ đang hoạt động, dọn dẹp khi ngắt kết nối |

---

## 5. Giao thức sự kiện Socket.io

### Client → Máy chủ

| Sự kiện | Dữ liệu gửi kèm | Mô tả |
|---|---|---|
| `screen:start` | `{ roomId, shareId }` | Người trình bày thông báo cho phòng rằng một luồng chia sẻ mới đã bắt đầu |
| `screen:stop` | `{ roomId, shareId }` | Người trình bày thông báo cho phòng rằng luồng chia sẻ đã dừng |
| `screen:get_active` | `{ roomId }` | Người tham gia muộn yêu cầu danh sách các luồng chia sẻ đang hoạt động |

### Máy chủ → Client

| Sự kiện | Dữ liệu gửi kèm | Mô tả |
|---|---|---|
| `screen:started` | `{ socketId, shareId, username }` | Phát tới phòng (trừ người gửi) khi luồng chia sẻ bắt đầu |
| `screen:stopped` | `{ shareId }` | Phát tới phòng khi luồng chia sẻ dừng (bao gồm tự động dừng khi ngắt kết nối) |
| `screen:active_list` | `{ shares: [{ shareId, socketId, username }] }` | Phản hồi cho `screen:get_active` với tất cả luồng chia sẻ hiện tại |

### Trạng thái máy chủ

```javascript
// Bộ ghi trong bộ nhớ (không lưu trữ vĩnh viễn)
const activeShares = new Map()  // roomId → Map<shareId, { socketId, username }>
```

- Khi `disconnect`: tất cả luồng chia sẻ thuộc về socket bị ngắt kết nối sẽ tự động được dọn dẹp và sự kiện `screen:stopped` được phát cho mỗi luồng.

---

## 6. Tích hợp WebRTC

Chia sẻ màn hình tái sử dụng **cùng một pool `RTCPeerConnection`** được quản lý bởi `useVoiceChat.js`. Điều này tránh tạo các kết nối trùng lặp.

### Pool kết nối Peer dùng chung

```
peersRef = useRef({})  // { socketId: RTCPeerConnection }
```

Cả `useVoiceChat` lẫn `useScreenShare` đều thêm/gỡ track trên cùng các kết nối. Sự phối hợp đạt được thông qua:

1. **Sự kiện `evodraw:peer_created`** — Được phát bởi `useVoiceChat` khi một `RTCPeerConnection` mới được tạo. `useScreenShare` lắng nghe sự kiện này để thêm video track (và audio track) vào peer mới.
2. **Sự kiện `evodraw:remote_video_track`** — Được phát bởi `useVoiceChat.ontrack` khi nhận được video track. `useScreenShare` lắng nghe sự kiện này để tạo đối tượng canvas.

### Quản lý Track

| Hành động | Track được thêm | Tái thương lượng |
|---|---|---|
| Bắt đầu chia sẻ (chỉ video) | 1 video track | Có — chu kỳ SDP offer/answer qua Socket.io |
| Bắt đầu chia sẻ (có âm thanh) | 1 video + 1 audio track | Có |
| Dừng chia sẻ | Gỡ tất cả track từ `localStreamRef.current` | Có |
| Peer mới kết nối | Thêm video + audio track hiện có | Xử lý bởi `evodraw:peer_created` |

### Xử lý xung đột luồng âm thanh

Voice chat và âm thanh chia sẻ màn hình cùng tồn tại trên một kết nối peer. Để ngăn xung đột state trong React:

```javascript
// useVoiceChat.js — trình xử lý ontrack
if (track.kind === 'audio') {
  setStreams(prev => ({
    ...prev,
    [`${targetSocketId}_${stream.id}`]: stream  // Khóa duy nhất cho mỗi luồng
  }))
}
```

Mỗi luồng âm thanh (voice vs âm thanh màn hình) có `stream.id` khác nhau, nên chúng được lưu trữ riêng biệt và hiển thị dưới dạng các phần tử `<audio>` độc lập.

---

## 7. Mô hình đối tượng Fabric.js trên Canvas

### Các thuộc tính đối tượng

Mỗi luồng chia sẻ màn hình là một `fabric.Rect` với các thuộc tính tùy chỉnh sau:

| Thuộc tính | Kiểu | Mô tả |
|---|---|---|
| `_evoScreenShare` | `boolean` | Luôn là `true` — xác định đối tượng là một luồng chia sẻ màn hình |
| `_evoShareId` | `string` | Mã định danh duy nhất của luồng chia sẻ (ví dụ: `share-1713456789-ab3k2`) |
| `_evoShareUser` | `string` | Tên hiển thị của người chia sẻ |
| `_evoShareColor` | `string` | Màu viền được gán từ bảng màu |
| `_videoEl` | `HTMLVideoElement` | Tham chiếu đến phần tử video ẩn |
| `_bufferCanvas` | `HTMLCanvasElement` | Bộ đệm kết xuất ngoài màn hình |
| `_bufferCtx` | `CanvasRenderingContext2D` | Ngữ cảnh 2D của bộ đệm (alpha: false) |

### Cấu hình Fabric

| Cài đặt | Giá trị | Lý do |
|---|---|---|
| `objectCaching` | `false` | Ngăn Fabric lưu đệm đối tượng dưới dạng ảnh bitmap tĩnh |
| `lockUniScaling` | `true` | Giữ nguyên tỷ lệ khung hình khi thay đổi kích thước |
| `lockRotation` | `true` | Luồng chia sẻ màn hình không nên bị xoay |
| `hasRotatingPoint` | `false` | Ẩn tay cầm xoay |
| `selectable` | `true` | Người dùng có thể chọn, di chuyển và thay đổi kích thước luồng chia sẻ |
| `fill` | `'#000'` | Màu đen dự phòng trước khi khung hình video được tải |

---

## 8. Giao diện điều khiển

Các tùy chọn chia sẻ màn hình có thể truy cập thông qua **Thanh công cụ (Toolbar)** — cụ thể là nút chia sẻ màn hình ở phía dưới thanh công cụ bên trái.

### Các thao tác tương tác

| Thao tác | Kết quả |
|---|---|
| **Nhấp chuột trái** | Bất/tắt chia sẻ màn hình |
| **Nhấp chuột phải** | Mở popup tùy chọn (độ phân giải, FPS, âm thanh) |
| **Nhấp đúp** | Mở popup tùy chọn (thay thế cho nhấp chuột phải) |

### Popup tùy chọn

Popup chứa ba phần:

#### Độ phân giải (Resolution)
Ba nút chuyển đổi (bố cục dọc):
- **720p HD** — 1280×720
- **1080p FHD** — 1920×1080 (mặc định)
- **4K UHD** — 3840×2160

#### Tốc độ khung hình (Frame Rate)
Ba nút chuyển đổi (bố cục ngang):
- **15** fps
- **30** fps (mặc định)
- **60** fps

#### Âm thanh hệ thống (System Audio)
Một checkbox:
- **Share System Audio** — mặc định tắt

> **Lưu ý:** Thay đổi độ phân giải và FPS có hiệu lực ngay lập tức nếu luồng chia sẻ đang hoạt động (qua `track.applyConstraints`). Cài đặt âm thanh chỉ có hiệu lực khi bắt đầu một luồng chia sẻ **mới**, vì thu âm thanh `getDisplayMedia` không thể bật/tắt giữa chừng.

### Chỉ báo huy hiệu (Badge)

Khi người dùng khác trong phòng đang chia sẻ màn hình nhưng người dùng hiện tại thì không, một huy hiệu số xuất hiện trên nút chia sẻ màn hình cho biết số lượng luồng chia sẻ từ xa đang hoạt động.

---

## 9. Vòng đời & Dọn dẹp tài nguyên

### Luồng bắt đầu chia sẻ

```
Người dùng nhấn "Share Screen"
  → handleScreenShareToggle()
    → startSharing(resolution, audio, fps)
      → getDisplayMedia({ video: constraints, audio })
        → MediaStream được thu
          → Tạo shareId
          → Thêm video+audio track vào tất cả RTCPeerConnection
          → Tái thương lượng SDP với mỗi peer
          → Phát 'screen:start' qua Socket.io
          → Tạo phần tử <video> ẩn
          → createScreenShareImage() → fabric.Rect
          → startFrameLoop() → vòng lặp requestAnimationFrame
```

### Luồng dừng chia sẻ

```
Người dùng nhấn "Stop" HOẶC nút "Dừng chia sẻ" trên thanh trình duyệt
  → stopSharing()
    → Dừng tất cả track của MediaStream
    → Gỡ track khỏi tất cả RTCPeerConnection (khớp chính xác)
    → Tái thương lượng SDP với mỗi peer
    → stopFrameLoop(shareId) → cancelAnimationFrame
    → Gỡ fabric.Rect khỏi canvas
    → Dọn dẹp phần tử <video>
    → Phát 'screen:stop' qua Socket.io
```

### Dọn dẹp khi ngắt kết nối (Máy chủ)

```
Socket bị ngắt kết nối
  → screen.handler.js trình lắng nghe 'disconnect'
    → Tìm tất cả luồng chia sẻ của socket này
    → Xóa khỏi Map activeShares
    → Phát 'screen:stopped' cho mỗi luồng bị xóa
```

### Dọn dẹp khi gỡ component (Client)

```
RoomPage bị gỡ (unmount)
  → useScreenShare cleanup effect
    → Dừng tất cả media track
    → stopAllFrameLoops()
    → Gỡ tất cả phần tử <video> ẩn
```

---

## 10. Hạn chế đã biết

| Hạn chế | Mô tả |
|---|---|
| **Hỗ trợ âm thanh hệ thống** | Thu âm thanh hệ thống/tab chỉ hoạt động trên trình duyệt dựa trên Chromium (Chrome, Edge). Firefox và Safari bỏ qua `audio: true` trong `getDisplayMedia` một cách im lặng. |
| **Bật/tắt âm thanh giữa chừng** | Checkbox "Share System Audio" chỉ có hiệu lực khi bắt đầu luồng chia sẻ *tiếp theo*. Âm thanh không thể thêm vào hoặc gỡ khỏi luồng chia sẻ đang hoạt động vì `getDisplayMedia` phải được gọi lại từ đầu. |
| **FPS vòng lặp kết xuất ≠ FPS thu hình** | Vòng lặp kết xuất Fabric chạy ở tốc độ cố định 24 fps bất kể cài đặt FPS thu hình. FPS thu hình cao hơn đảm bảo các khung hình mới hơn có sẵn nhưng không tăng tốc độ vẽ lại canvas. |
| **Không lưu trữ vĩnh viễn** | Các đối tượng chia sẻ màn hình là tạm thời — chúng không được tuần tự hóa vào trạng thái canvas của máy chủ. Chúng chỉ tồn tại dưới dạng luồng trực tiếp. |
| **Một video track mỗi peer** | Nếu người dùng dừng chia sẻ và ngay lập tức bắt đầu luồng mới, việc gỡ track cũ và thêm track mới có thể gây ra độ trễ tái thương lượng ngắn trên các kết nối peer. |
| **Hiệu suất 4K** | Chia sẻ ở độ phân giải 4K với 60 fps yêu cầu tài nguyên CPU/GPU đáng kể ở cả phía người trình bày và người xem. Quá trình thu hình có thể bị trình duyệt tự động giảm độ phân giải nếu phần cứng không đáp ứng được yêu cầu. |
