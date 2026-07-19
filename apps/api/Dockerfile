FROM node:18-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-contracts/package.json ./packages/shared-contracts/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @cloudops/api build

FROM node:18-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-contracts/package.json ./packages/shared-contracts/
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared-contracts/dist ./packages/shared-contracts/dist
EXPOSE 3000
CMD ["node", "apps/api/dist/main"]
