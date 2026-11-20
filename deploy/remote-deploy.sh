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
