# ---- Build: giao diện (dist/) + server (server-dist/index.cjs) ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Chạy: chỉ cần Node + file đã build (server đã gói sẵn thư viện) ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    STATIC_DIR=/app/dist
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
CMD ["node", "server-dist/index.cjs"]
