<img src="./docs/icon.png" alt="evodraw icon" width="48" />

# evodraw

## Cấu trúc dự án

```text
evodraw/
├── apps/
│   ├── web/                          # React - Trình duyệt (người xem)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── services/             # Gọi REST API
│   │   │   ├── socket/               # Kết nối Socket.io, nhận tọa độ
│   │   │   ├── canvas/               # Vẽ lại tọa độ nhận được
│   │   │   └── main.jsx
│   │   └── package.json
│   │
│   ├── desktop/                      # Electron - Người trình bày
│   │   ├── src/
│   │   │   ├── main/                 # Main process (Electron)
│   │   │   │   ├── index.ts          # Entry point chính
│   │   │   │   ├── screenCapture.ts  # Quay màn hình (desktopCapturer)
│   │   │   │   └── ipc.ts            # IPC handlers
│   │   │   ├── renderer/             # Renderer process (UI)
│   │   │   │   ├── components/
│   │   │   │   ├── socket/           # Gửi tọa độ lên server
│   │   │   │   └── App.tsx
│   │   │   └── preload.ts
│   │   └── package.json
│   │
│   └── server/                       # Node.js + Express + Socket.io
│       ├── src/
│       │   ├── config/
│       │   │   └── db.ts
│       │   ├── controllers/
│       │   ├── models/
│       │   ├── routes/
│       │   ├── middlewares/
│       │   ├── socket/               # Xử lý realtime
│       │   │   ├── index.ts          # Khởi tạo Socket.io server
│       │   │   ├── drawHandler.ts    # Nhận/phát tọa độ vẽ
│       │   │   └── screenHandler.ts  # Nhận/phát stream màn hình
│       │   └── server.ts
│       └── package.json
│
├── packages/                         # Code dùng chung
│   ├── types/                        # TypeScript types/interfaces
│   │   ├── socket-events.ts          # Định nghĩa tên events Socket.io
│   │   └── drawing.ts                # Kiểu dữ liệu tọa độ, stroke...
│   └── utils/                        # Hàm dùng chung
│
├── pnpm-workspace.yaml
├── package.json                      # Root - chạy script toàn bộ
└── README.md
```

## How to create
## Bước 1 — Tạo root project

```bash
mkdir evodraw && cd evodraw
pnpm init
```

---

## Bước 2 — Tạo file `pnpm-workspace.yaml` thủ công

**Không dùng lệnh echo**, thay vào đó tạo file trực tiếp:

```bash
touch pnpm-workspace.yaml
```

Mở file vừa tạo và dán nội dung sau vào (dùng bất kỳ text editor nào — VSCode, Notepad...):

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

> ⚠️ Lưu ý: dùng **dấu ngoặc kép** `"`, không dùng dấu ngoặc đơn `'`

---

## Bước 3 — Sửa root `package.json`

Mở file `package.json` vừa được tạo, thay toàn bộ nội dung bằng:

```json
{
  "name": "evodraw",
  "private": true,
  "scripts": {
    "dev:web":     "pnpm --filter web dev",
    "dev:server":  "pnpm --filter server dev",
    "dev:desktop": "pnpm --filter desktop dev",
    "dev":         "pnpm --parallel --filter web --filter server --filter desktop dev"
  }
}
```

---

## Bước 4 — Tạo thư mục gốc

```bash
mkdir -p apps packages
```

---

## Bước 5 — Khởi tạo Web

```bash
pnpm create vite@latest apps/web -- --template react-ts
```

Tạo thêm thư mục:

```bash
mkdir -p apps/web/src/components
mkdir -p apps/web/src/pages
mkdir -p apps/web/src/hooks
mkdir -p apps/web/src/services
mkdir -p apps/web/src/socket
mkdir -p apps/web/src/canvas
```

---

## Bước 6 — Khởi tạo Desktop (Electron)

```bash
pnpm create @quick-start/electron@latest apps/desktop
```

Khi được hỏi, chọn:
- Framework: **React**
- Language: **TypeScript**

Tạo thêm thư mục và file:

```bash
mkdir -p apps/desktop/src/main
mkdir -p apps/desktop/src/renderer/components
mkdir -p apps/desktop/src/renderer/socket

touch apps/desktop/src/main/screenCapture.ts
touch apps/desktop/src/main/ipc.ts
```

---

## Bước 7 — Khởi tạo Server

```bash
mkdir -p apps/server/src/config
mkdir -p apps/server/src/controllers
mkdir -p apps/server/src/models
mkdir -p apps/server/src/routes
mkdir -p apps/server/src/middlewares
mkdir -p apps/server/src/socket
```

Tạo `apps/server/package.json` — mở file và dán vào:

```json
{
  "name": "server",
  "version": "1.0.0",
  "scripts": {
    "dev": "nodemon src/server.ts"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

Tạo các file:

```bash
touch apps/server/src/config/db.ts
touch apps/server/src/socket/index.ts
touch apps/server/src/socket/drawHandler.ts
touch apps/server/src/socket/screenHandler.ts
touch apps/server/src/server.ts
```

---

## Bước 8 — Khởi tạo Shared Packages

```bash
mkdir -p packages/types
mkdir -p packages/utils
```

Tạo `packages/types/package.json`:

```json
{
  "name": "@evodraw/types",
  "version": "1.0.0",
  "main": "index.ts"
}
```

Tạo `packages/utils/package.json`:

```json
{
  "name": "@evodraw/utils",
  "version": "1.0.0",
  "main": "index.ts"
}
```

Tạo các file:

```bash
touch packages/types/index.ts
touch packages/types/socket-events.ts
touch packages/types/drawing.ts
touch packages/utils/index.ts
```

---

## Bước 9 — Liên kết shared packages

```bash
pnpm add @evodraw/types --filter web
pnpm add @evodraw/types --filter server
pnpm add @evodraw/types --filter desktop
```

---

## Bước 10 — Cài dependencies

```bash
# Server
pnpm add express socket.io mongoose --filter server
pnpm add -D typescript ts-node nodemon @types/express @types/node --filter server

# Web
pnpm add socket.io-client --filter web

# Desktop
pnpm add socket.io-client --filter desktop
```

---

## Bước 11 — Cài tất cả

```bash
pnpm install
```

---

## Kiểm tra cấu trúc

```bash
# Linux/macOS
find . -not -path '*/node_modules/*' | sort

# Windows (PowerShell)
tree /f /a | findstr /v "node_modules"
```