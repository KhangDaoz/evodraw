<img src="./apps/web/public/icon.png" alt="evodraw icon" width="48" />

# evodraw

Ứng dụng vẽ collaborative realtime cho phép nhiều người vẽ cùng lúc trên một canvas. Hỗ trợ web browser, Electron desktop app, và livestream màn hình.

## 🚀 Quick Start

### Điều kiện tiên quyết
- Node.js >= 16
- npm >= 8
- MongoDB (nếu sử dụng database)

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Cấu hình Environment

Tạo file `.env` trong thư mục `apps/server`:

```env
MONGO_URI=mongodb://localhost:27017/evodraw
PORT=3001
SOCKET_PORT=3002
JWT_SECRET=your-secret-key
```

### 3. Chạy toàn bộ ứng dụng

**Chạy cả 3 app (Web, Server, Desktop) cùng lúc:**

```bash
npm run dev
```

**Hoặc chạy từng app riêng biệt:**

```bash
# Terminal 1 - Backend
npm run dev:server

# Terminal 2 - Frontend Web
npm run dev:web

# Terminal 3 - Electron Desktop
npm run dev:desktop
```

## 📱 Các app

| App | Vị trí | Mô tả | Port |
|-----|--------|-------|------|
| **Web** | `apps/web` | React app - Người xem (browser) | 5173 |
| **Server** | `apps/server` | Node.js + Express + Socket.io | 3001 |
| **Desktop** | `apps/desktop` | Electron - Người trình bày | 3000 |

## 📚 Tài liệu

- [Cấu trúc dự án & Setup từ đầu](./docs/PROJECT_STRUCTURE.md) - Chi tiết cấu trúc thư mục và cách khởi tạo
- [Kiến trúc Sync Layer](./docs/sync_layer.md) - Cách đồng bộ canvas realtime
- [Screen Sharing](./docs/screen_sharing.md) - Tính năng livestream màn hình
- [Implementation Plan](./docs/implementation_plan.md) - Kế hoạch phát triển

## 🏗️ Cấu trúc monorepo

```
evodraw/
├── apps/
│   ├── web/          # React - Browser
│   ├── desktop/      # Electron - Desktop presenter
│   └── server/       # Node.js backend
├── packages/         # Shared code
├── docs/            # Documentation
└── package.json     # Root workspace
```

## 🔗 Quy trình hoạt động

1. **Desktop app** quay màn hình → gửi lên server
2. **Server** nhận canvas operations & broadcasts tới các client
3. **Web browsers** hiển thị canvas realtime
4. **Canvas sync** dùng Fabric.js + Socket.io + LWW conflict resolution

## 📖 Development

### Các lệnh hữu ích

```bash
# Chạy tests (nếu có)
npm test

# Build production
npm run build

# Lint code
npm run lint
```

### Các thư mục chính

- `apps/web/src/hooks/` - Custom React hooks (sync, chat, drawing)
- `apps/server/src/sockets/` - Socket.io event handlers
- `apps/server/src/services/` - Business logic & database
- `apps/web/src/utils/canvasSerializer.js` - Canvas serialization & conflict resolution

## 🐛 Troubleshooting

**Lỗi "port already in use":**
```bash
# Thay đổi PORT trong .env hoặc kill process
```

**MongoDB connection error:**
```bash
# Đảm bảo MongoDB đang chạy
mongod
```

**Dependencies không cài:**
```bash
npm install
npm install --workspaces
```

## 📝 License

MIT