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

RUN apk add --no-cache nginx \
  && addgroup -S caddy \
  && adduser -S caddy -G caddy \
  && mkdir -p /run/nginx /var/cache/nginx /var/log/nginx /repo/logs \
  && chown -R caddy:caddy /run/nginx /var/cache/nginx /var/log/nginx /repo

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/shared-api/package.json packages/shared-api/
COPY apps/api/package.json apps/api/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder --chown=caddy:caddy /repo/apps/api/dist apps/api/dist/
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --chown=caddy:caddy docker/combined-entrypoint.sh /usr/local/bin/combined-entrypoint.sh

RUN chmod +x /usr/local/bin/combined-entrypoint.sh \
  && chown -R caddy:caddy /usr/share/nginx/html /etc/nginx

USER caddy

EXPOSE 8080
CMD ["/usr/local/bin/combined-entrypoint.sh"]
