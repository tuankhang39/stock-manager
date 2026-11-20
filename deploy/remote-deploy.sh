#!/usr/bin/env bash
# Chạy trên VPS (GitHub Actions gọi qua SSH). Cần env: DEPLOY_PATH, IMAGE_REPO, IMAGE_TAG, GHCR_USER, GHCR_TOKEN.
# Chạy lại nhiều lần vẫn an toàn.
set -euo pipefail
cd "$DEPLOY_PATH"
test -f .env || { echo "Thiếu $DEPLOY_PATH/.env"; exit 1; }

# Ghi tag image của lần deploy này (để restart tay / rollback: sửa IMAGE_TAG rồi `docker compose -f docker-compose.prod.yml up -d`).
sed -i '/^IMAGE_REPO=/d;/^IMAGE_TAG=/d' .env
printf 'IMAGE_REPO=%s\nIMAGE_TAG=%s\n' "$IMAGE_REPO" "$IMAGE_TAG" >> .env

dc() { docker compose -f docker-compose.prod.yml "$@"; }

echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

echo "==> Pull image $IMAGE_TAG"
dc pull --quiet app

echo "==> Khởi động lại"
dc up -d --remove-orphans --wait --wait-timeout 180
dc ps
docker image prune -f >/dev/null

# Tên miền: Caddy chung (container thansohoc-caddy-1) import /opt/caddy-sites/*.caddy.
# Chỉ ghi file của dự án này; kiểm tra cấu hình trước, sai thì trả lại file cũ (Caddy vẫn chạy cấu hình cũ).
CADDY=thansohoc-caddy-1
SITES=/opt/caddy-sites
if [ -d "$SITES" ] && docker ps --format '{{.Names}}' | grep -qx "$CADDY"; then
  echo "==> Cập nhật Caddy ($SITES/xiaoxinstock.caddy)"
  cp -f "$SITES/xiaoxinstock.caddy" /tmp/xiaoxinstock.caddy.prev 2>/dev/null || true
  cp -f deploy/xiaoxinstock.caddy "$SITES/xiaoxinstock.caddy"
  if docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  else
    echo "Caddyfile không hợp lệ — trả lại bản cũ" >&2
    cp -f /tmp/xiaoxinstock.caddy.prev "$SITES/xiaoxinstock.caddy" 2>/dev/null || true
    exit 1
  fi
else
  echo "==> Bỏ qua Caddy (chưa có $SITES hoặc $CADDY không chạy)"
fi
