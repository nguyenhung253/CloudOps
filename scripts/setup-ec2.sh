#!/bin/bash
set -euo pipefail

echo "==> Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Docker
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "==> Docker installed. Log out and back in for group changes to take effect."
fi

# Docker Compose plugin
if ! docker compose version &>/dev/null; then
  echo "==> Installing Docker Compose plugin..."
  sudo apt install docker-compose-plugin -y
fi

# Node.js (for local Prisma migration if needed)
if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install nodejs -y
fi

# pnpm
if ! command -v pnpm &>/dev/null; then
  echo "==> Installing pnpm..."
  npm install -g pnpm
fi

# Clone repo if not exists
if [ ! -d ~/cloudops ]; then
  echo "==> Cloning repository..."
  echo "Enter repository URL (e.g. git@github.com:ORG/cloudops.git):"
  read -r REPO_URL
  git clone "$REPO_URL" ~/cloudops
else
  echo "==> Repository already exists at ~/cloudops"
fi

cd ~/cloudops

# Create .env.production from template
if [ ! -f .env.production ]; then
  cp .env.production.example .env.production
  echo "==> Created .env.production from template"
  echo ""
  echo "  ⚠  EDIT .env.production NOW with your actual secrets:"
  echo "     nano ~/cloudops/.env.production"
  echo ""
  echo "  Required: DATABASE_URL (Neon Cloud), JWT_SECRET, DOMAIN, CERTBOT_EMAIL"
  echo "  Optional: AWS keys, SMTP settings"
else
  echo "==> .env.production already exists, skipping template creation"
fi

echo ""
echo "✓ EC2 setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Edit .env.production: nano ~/cloudops/.env.production"
echo "  2. Run init-certbot:    bash ~/cloudops/scripts/init-certbot.sh"
echo "  3. Deploy:              bash ~/cloudops/scripts/deploy.sh"
