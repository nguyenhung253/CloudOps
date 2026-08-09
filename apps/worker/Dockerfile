FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared-contracts/package.json ./packages/shared-contracts/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @cloudops/worker build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared-contracts/package.json ./packages/shared-contracts/
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/packages/shared-contracts/dist ./packages/shared-contracts/dist
RUN addgroup -S cloudops && adduser -S cloudops -G cloudops
USER cloudops
CMD ["node", "apps/worker/dist/main"]
