# EvoDraw Server Backend

## 📋 Tổng Quan

EvoDraw Backend là một server Node.js được xây dựng với **Express** và **Socket.IO**, cung cấp các API REST và real-time communication cho ứng dụng vẽ cộng tác **EvoDraw**. Server quản lý phòng vẽ, lưu trữ dữ liệu canvas, xử lý chat, và đồng bộ hóa vẽ giữa các users trong thời gian thực.

---

## 🏗️ Cấu Trúc Thư Mục

```
server/
├── src/
│   ├── server.js                 # Entry point - khởi tạo Express & Socket.IO
│   ├── config/
│   │   └── db.js                 # Kết nối MongoDB
│   ├── models/
│   │   ├── Room.js               # Schema phòng vẽ
│   │   └── File.js               # Schema file/ảnh trong phòng
│   ├── controllers/
│   │   └── room.controller.js    # Logic xử lý API rooms
│   ├── routes/
│   │   └── room.routes.js        # Định nghĩa REST API routes
│   ├── middlewares/
│   │   └── room.middleware.js    # Validation middleware
│   ├── sockets/
│   │   ├── index.js              # Socket.IO initialization
│   │   ├── room.handler.js       # Xử lý room events
│   │   ├── draw.handler.js       # Xử lý vẽ real-time
│   │   └── chat.handler.js       # Xử lý chat messages
│   └── utils/
│       ├── codeGenerator.js      # Generate room codes & passcodes
│       └── roomActivity.js       # Theo dõi hoạt động phòng
├── .env                          # Biến môi trường (không commit)
├── .env.example                  # Template biến môi trường
├── package.json                  # Dependencies
└── README.md                     # Tài liệu này
```

---

## 📦 Yêu Cầu Hệ Thống

- **Node.js**: v18+ (khuyến nghị v20+)
- **npm**: v9+
- **MongoDB**: v5.0+ (local hoặc Atlas)

---

## ⚙️ Cài Đặt

### 1. Cài đặt Dependencies

```bash
cd apps/server
npm install
```

### 2. Cấu Hình Biến Môi Trường

Tạo file `.env` từ template `.env.example`:

```bash
cp .env.example .env
```

Chỉnh sửa `.env` với thông tin của bạn:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/evodraw
# Hoặc dùng MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/evodraw

# CORS Configuration
CLIENT_URL=http://localhost:5173
```

---

## 🚀 Chạy Server

### Mode Development (với auto-reload)

```bash
npm run dev
```

Nodemon sẽ tự động khởi động lại server khi bạn thay đổi file.

### Mode Production

```bash
npm start
```

### Kiểm Tra Server

Khi server chạy thành công, bạn sẽ thấy:

```
MongoDB connected: localhost
Server running on http://localhost:3000
Socket.IO initialized globally
```

Kiểm tra API bằng browser hoặc curl:

```bash
curl http://localhost:3000
# Response: { "message": "EvoDraw API Server Operations Normal" }
```

---

## 🗄️ Database Models

### 1. Room (Phòng Vẽ)

```javascript
{
  _id: ObjectId,                    // ID Mongo
  code: String,                     // Mã phòng 6 ký tự (VD: "A1B2C3")
  passcode: String,                 // Passcode hash (bcrypt)
  roomVersion: Number,              // Version cho tracking changes
  elements: Array,                  // Mảng elements vẽ trên canvas
  appState: Object,                 // Theme, zoom, settings...
  status: String,                   // "active" hoặc "archived"
  createdAt: Date,
  updatedAt: Date
}
```

### 2. File (File/Ảnh trong Phòng)

```javascript
{
  _id: ObjectId,
  fileId: String,                   // Unique file ID
  roomId: String,                   // ID phòng chứa file
  mimeType: String,                 // "image/png", "image/jpeg"...
  dataURL: String,                  // URL trên cloud storage
  size: Number,                     // Kích thước file (bytes)
  created: Date,
  lastRetrieved: Date               // Lần cuối truy cập
}
```

---

## 🌐 REST API Endpoints

### 1. Tạo Phòng Mới

**POST** `/api/rooms`

```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "code": "A1B2C3",
    "passcode": "1234"
  }
}
```

### 2. Tham Gia Phòng

**POST** `/api/rooms/join`

```bash
curl -X POST http://localhost:3000/api/rooms/join \
  -H "Content-Type: application/json" \
  -d '{
    "code": "A1B2C3",
    "passcode": "1234"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "code": "A1B2C3",
    "elements": [...],
    "appState": {...}
  }
}
```

### 3. Cập Nhật Dữ Liệu Phòng

**PUT** `/api/rooms/update`

```bash
curl -X PUT http://localhost:3000/api/rooms/update \
  -H "Content-Type: application/json" \
  -d '{
    "code": "A1B2C3",
    "elements": [...],
    "appState": {...}
  }'
```

---

## 🔌 Real-time WebSocket Events

### Room Events

#### `join-room`
User tham gia phòng
```javascript
socket.emit('join-room', { roomCode: 'A1B2C3', userId: 'user123' });
```

#### `leave-room`
User rời khỏi phòng
```javascript
socket.emit('leave-room', { roomCode: 'A1B2C3' });
```

#### `room-updated`
Nhận thông báo phòng được cập nhật (broadcast)
```javascript
socket.on('room-updated', (data) => {
  // data: { roomCode, elements, appState, version }
});
```

### Drawing Events

#### `draw`
Gửi hành động vẽ
```javascript
socket.emit('draw', {
  roomCode: 'A1B2C3',
  action: 'line',
  data: { x: 100, y: 200, color: '#000000' }
});
```

#### `remote-draw`
Nhận hành động vẽ từ users khác (broadcast)
```javascript
socket.on('remote-draw', (data) => {
  // data: { action, data, userId }
});
```

#### `undo`
Hoàn tác hành động vẽ
```javascript
socket.emit('undo', { roomCode: 'A1B2C3' });
```

#### `redo`
Lặp lại hành động vẽ
```javascript
socket.emit('redo', { roomCode: 'A1B2C3' });
```

### Chat Events

#### `send-message`
Gửi tin nhắn chat
```javascript
socket.emit('send-message', {
  roomCode: 'A1B2C3',
  message: 'Hello team!',
  userId: 'user123'
});
```

#### `receive-message`
Nhận tin nhắn chat (broadcast)
```javascript
socket.on('receive-message', (data) => {
  // data: { message, userId, timestamp }
});
```

### Cursor Events

#### `cursor-move`
Cập nhật vị trí con trỏ chuột
```javascript
socket.emit('cursor-move', {
  roomCode: 'A1B2C3',
  x: 150,
  y: 250,
  userId: 'user123'
});
```

#### `remote-cursors`
Nhận vị trí con trỏ từ users khác (broadcast)
```javascript
socket.on('remote-cursors', (data) => {
  // data: { userId, x, y, color }
});
```

---

## 🛠️ Utilities

### codeGenerator.js

Sinh mã phòng và passcode ngẫu nhiên:

```javascript
// Sinh mã phòng 6 ký tự (VD: "A1B2C3")
const roomCode = generateRoomCode();

// Sinh passcode 4 chữ số (VD: "1234")
const passcode = generateRoomPassCode();
```

### roomActivity.js

Theo dõi và quản lý hoạt động trong phòng (active members, last activity...).

---

## 🔒 Security

### Authentication
- Phòng được bảo vệ bằng **room code** (6 ký tự) + **passcode** (4 chữ số)
- Passcode được hash bằng **bcrypt** trước khi lưu vào database

### CORS
- Cấu hình CORS để chỉ cho phép requests từ `CLIENT_URL` (mặc định: `http://localhost:5173`)

### Error Handling
- Global error handler xử lý và trả về response lỗi có format nhất quán
- Middleware validation để kiểm tra dữ liệu đầu vào

---

## 📝 Middleware

### validateRoom
Kiểm tra `code` và `passcode` hợp lệ:

```javascript
// Bắt buộc: code, passcode
router.post('/join', validateRoom, joinRoom);
```

### validateUpdateRoom
Kiểm tra dữ liệu cập nhật phòng:

```javascript
// Bắt buộc: code, elements, appState
router.put('/update', validateUpdateRoom, updateRoom);
```

---

## 🐛 Development & Debugging

### Logs
Server output các log chi tiết cho mỗi sự kiện:

```
✓ Client connected: abc123def456
✓ Room joined: A1B2C3
✓ Drawing action: line
✓ Message received: "Hello"
✓ Client disconnected: abc123def456
```

### MongoDB Connection Issues

Nếu kết nối MongoDB thất bại:

1. Kiểm tra `MONGODB_URI` trong `.env`
2. Kiểm tra MongoDB service chạy: `mongo --version`
3. Kiểm tra firewall cho port 27017
4. Kiểm tra MongoDB Atlas IP whitelist (nếu dùng cloud)

### Port Already in Use

Nếu port 3000 đã được sử dụng:

```bash
# Thay đổi port trong .env
PORT=3001
```

---

## 📚 Liên Kết Hữu Ích

- [Express.js Docs](https://expressjs.com/)
- [Socket.IO Docs](https://socket.io/docs/)
- [Mongoose Docs](https://mongoosejs.com/)
- [MongoDB Docs](https://docs.mongodb.com/)
- [Bcrypt Docs](https://www.npmjs.com/package/bcrypt)

---

## 📞 Support & Contribution

Nếu có vấn đề hoặc muốn đóng góp:

1. Kiểm tra issue có sẵn
2. Tạo issue mới với mô tả chi tiết
3. Submit pull request với mô tả thay đổi

---

## 📄 License

Xem file [LICENSE](../../LICENSE)

---

**Phiên bản**: 1.0.0  
**Cập nhật lần cuối**: April 2026
