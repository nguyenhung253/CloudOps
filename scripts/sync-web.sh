#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "==> Building web frontend..."
pnpm --filter @cloudops/web build

echo "==> Uploading to EC2..."
rsync -avz --delete apps/web/dist/ ubuntu@<EC2_IP>:~/CloudOps/infra/nginx/web-dist/

echo "✓ Web frontend synced to EC2"
