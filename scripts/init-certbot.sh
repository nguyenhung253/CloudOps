#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

source .env.production

if [ -z "${DOMAIN:-}" ]; then
  echo "ERROR: DOMAIN not set in .env.production"
  exit 1
fi

if [ -z "${CERTBOT_EMAIL:-}" ]; then
  echo "ERROR: CERTBOT_EMAIL not set in .env.production"
  exit 1
fi

COMPOSE_FILE="infra/docker/docker-compose.prod.yml"
NGINX_CONF="infra/nginx/nginx.conf"
NGINX_INIT="infra/nginx/nginx-init.conf"

# Step 1: Start nginx with HTTP-only init config (no SSL yet)
echo "==> Starting nginx with bootstrap config for certbot challenge..."
cp "$NGINX_INIT" "$NGINX_CONF"

# Create empty web-dist folder so nginx doesn't error
mkdir -p infra/nginx/web-dist
echo "<html><body>OK</body></html>" > infra/nginx/web-dist/index.html

docker compose -f "$COMPOSE_FILE" up -d nginx
sleep 3

# Step 2: Run certbot via the compose profile to obtain certificate
echo "==> Obtaining SSL certificate for ${DOMAIN}..."
docker compose -f "$COMPOSE_FILE" \
  --profile certbot \
  run --rm certbot-init

# Step 3: Generate production nginx config from template
echo "==> Generating production nginx config..."
sed "s|<DOMAIN>|${DOMAIN}|g" "infra/nginx/nginx.conf.template" > "$NGINX_CONF"

# Step 4: Restart nginx with production config
echo "==> Restarting nginx with SSL..."
docker compose -f "$COMPOSE_FILE" restart nginx

echo ""
echo "✓ SSL certificate obtained and nginx configured for https://${DOMAIN}"
echo ""
echo "  Set up auto-renewal cron (runs every Sunday at 3am):"
echo "  0 3 * * 0 cd ~/cloudops && docker compose -f infra/docker/docker-compose.prod.yml --profile certbot run --rm certbot-renew && docker compose -f infra/docker/docker-compose.prod.yml exec nginx nginx -s reload"
