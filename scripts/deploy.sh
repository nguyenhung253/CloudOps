#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

COMPOSE_FILE="infra/docker/docker-compose.prod.yml"

echo "==> Pulling latest changes..."
git pull origin "$(git rev-parse --abbrev-ref HEAD)"

echo "==> Building all images..."
docker compose -f "$COMPOSE_FILE" build --no-cache

echo "==> Building web static files..."
docker compose -f "$COMPOSE_FILE" run --rm web-builder

echo "==> Starting services..."
docker compose -f "$COMPOSE_FILE" up -d redis api worker nginx

echo "==> Waiting for api to be ready..."
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T api node -e "process.exit(0)" 2>/dev/null; then
    break
  fi
  echo "  Waiting... ($i/30)"
  sleep 3
done

echo "==> Running database migrations..."
docker compose -f "$COMPOSE_FILE" exec -T api \
  npx prisma migrate deploy --schema=prisma/schema.prisma

echo ""
echo "✓ Deployed successfully!"
if [ -f .env.production ]; then
  source .env.production
  echo "  https://${DOMAIN:-your-domain.com}"
fi
