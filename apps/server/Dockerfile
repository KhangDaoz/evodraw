# ============================================================
# Stage 1: Builder — Cài dependencies
# ============================================================
# Docker context = repo root (.), nên mọi đường dẫn COPY
# phải tương đối từ root repo, ví dụ: apps/server/...
FROM node:20-slim AS builder

WORKDIR /app

# Copy CHỈ package.json của server (không phải root package.json
# vì root có "workspaces" sẽ khiến npm tìm apps/* và crash).
COPY apps/server/package.json ./

# Cài production dependencies
RUN npm install --omit=dev

# ============================================================
# Stage 2: Runner — Image production
# ============================================================
FROM node:20-slim

WORKDIR /app

# Copy node_modules đã cài từ builder
COPY --from=builder /app/node_modules ./node_modules

# Copy CHỈ source code server (không copy toàn bộ repo)
COPY apps/server/ .

EXPOSE 4000

CMD ["node", "src/server.js"]