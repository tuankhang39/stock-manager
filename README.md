# XiaoxinStock

Ứng dụng tồn kho BHLĐ. Dữ liệu lưu trên **PostgreSQL**, đăng nhập bằng 1 tài khoản dùng chung; nhiều máy mở web cùng thấy một kho.

```
Trình duyệt  ──/api──▶  Server Node (server/)  ──▶  PostgreSQL
```

## Chạy bằng Docker (dùng thật)

1. Sao chép `.env.example` thành `.env`, điền mật khẩu DB, tài khoản đăng nhập, `SESSION_SECRET`.
2. Chạy:

```bash
docker compose up -d --build
```

3. Mở http://localhost:8080 (máy khác trong mạng LAN: `http://<IP máy này>:8080`).

Dữ liệu nằm trong volume Docker `pgdata` — `docker compose down` vẫn giữ dữ liệu, **`docker compose down -v` sẽ XÓA hết dữ liệu**.

Sao lưu DB: `docker compose exec db pg_dump -U xiaoxin xiaoxin > backup.sql`
(vẫn xuất được backup JSON trong Cài đặt như trước).

## Deploy lên VPS (GitHub Actions)

Push lên nhánh `main` → [.github/workflows/deploy.yml](.github/workflows/deploy.yml) chạy test, build image lên GHCR, rồi SSH vào VPS (user `deploy`) chạy `deploy/remote-deploy.sh` với `docker-compose.prod.yml` trong `/opt/xiaoxinstock`. Có thể chạy tay ở tab Actions → Deploy → Run workflow.

- Secret của repo (Settings → Secrets and variables → Actions): `VPS_HOST`, `VPS_USER` (= `deploy`), `VPS_SSH_KEY` (private key; public key tương ứng nằm trong `/home/deploy/.ssh/authorized_keys` của VPS).
- `/opt/xiaoxinstock/.env` trên VPS giữ mật khẩu DB, tài khoản, `SESSION_SECRET` — không nằm trong git.
- Tên miền https://nhuhodethuong.duckdns.org: Caddy chung của VPS (container `thansohoc-caddy-1`) import `/opt/caddy-sites/*.caddy`; deploy copy [deploy/xiaoxinstock.caddy](deploy/xiaoxinstock.caddy) vào đó rồi reload Caddy. Không sửa Caddyfile của thansohoc.
- Backup: script chung `/usr/local/bin/backup-postgres-all.sh` (8:30 hằng ngày) dump DB vào `/root/db-backups/<ngày>/xiaoxinstock.dump`, giữ 14 ngày + bản sao R2.
- Quay về bản cũ: trên VPS sửa `IMAGE_TAG` trong `.env` thành commit cũ rồi `docker compose -f docker-compose.prod.yml up -d`.

## Chạy khi phát triển

```bash
npm install
npm run db:up        # chỉ chạy PostgreSQL trong Docker (cổng 5433)
npm run dev:server   # API ở http://127.0.0.1:3001
npm run dev          # giao diện ở http://127.0.0.1:5173 (gọi /api qua proxy)
npm test
```

## Chuyển dữ liệu cũ

- Lần đầu đăng nhập khi DB còn trống, dữ liệu cũ trong trình duyệt (IndexedDB / localStorage) được tự đưa lên PostgreSQL.
- Máy / trình duyệt khác còn dữ liệu cũ: Cài đặt → "Nạp dữ liệu cũ của trình duyệt này" (ghi đè dữ liệu trên server).
- File backup JSON cũ: Cài đặt → "Khôi phục backup".

## Ghi chú

- Mỗi thay đổi được lưu ngay lên server; thanh bên hiện trạng thái "Đã lưu / Đang lưu / Chưa lưu được". Còn thay đổi chưa lưu thì trình duyệt sẽ hỏi trước khi đóng tab.
- Hai máy sửa cùng lúc: máy lưu sau sẽ được báo và tải lại dữ liệu mới nhất (không ghi đè lên nhau).
- Chạy sau HTTPS thì đặt `COOKIE_SECURE=true`.
- `scripts/generate-keys.mjs` và `src/license-keys.json` thuộc cơ chế mã kích hoạt cũ, nay không còn dùng.
