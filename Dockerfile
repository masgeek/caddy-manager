# Build context: monorepo root

FROM node:24-alpine AS builder
WORKDIR /repo

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/shared-api/package.json packages/shared-api/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/api/ apps/api/
COPY apps/web/ apps/web/

RUN pnpm --filter @caddy-manager/api build
RUN pnpm --filter @caddy-manager/web build

FROM node:24-alpine AS runtime
WORKDIR /repo

RUN addgroup -S caddy \
  && adduser -S caddy -G caddy \
  && mkdir -p /repo/logs \
  && chown -R caddy:caddy /repo

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/shared-api/package.json packages/shared-api/
COPY apps/api/package.json apps/api/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder --chown=caddy:caddy /repo/apps/api/dist apps/api/dist/
COPY --from=builder --chown=caddy:caddy /repo/apps/web/dist apps/web/dist/

USER caddy

EXPOSE 3500
CMD ["node", "apps/api/dist/index.js"]
