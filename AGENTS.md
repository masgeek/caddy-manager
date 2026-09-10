# Agent Instructions

## Tooling

- Use Node.js 20+ and pnpm 9; the repository pins pnpm `9.15.4` in `package.json`.
- Install from the lockfile with `pnpm install --frozen-lockfile`.
- This is a pnpm workspace managed by Turbo: applications are in `apps/*`, reusable code is in `packages/*`.

## Structure

- `apps/web` is the React/Vite frontend; its dev server runs on port 3000 and proxies `/api` to `localhost:3500`.
- `apps/api` is the Fastify backend; `src/index.ts` starts it on port 3500 and `src/app.ts` defines the `/api` routes.
- `packages/db` owns the Drizzle schema, repositories, migrations, and seeds. `packages/config` loads the repository-root `.env` and supplies shared configuration.
- `packages/shared-types`, `packages/shared-api`, and `packages/ui` contain shared contracts, the typed API client, and React UI primitives respectively.
- Workspace packages intentionally expose TypeScript source rather than `dist`; the API build bundles `@caddy-manager/*` dependencies.

## Commands

- Full local checks, matching CI order: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.
- Run one package with `pnpm --filter @caddy-manager/api <script>` or `pnpm --filter @caddy-manager/web <script>`; both packages use Vitest.
- Run a focused test with `pnpm --filter @caddy-manager/api test -- src/path/to/file.test.ts` or the equivalent web command. Vitest uses `jsdom` for web tests.
- Start both development servers with `pnpm dev`; stop the usual ports with `pnpm dev:kill`.
- Run formatting with `pnpm format` and check it with `pnpm format:check`. Prettier has no custom options beyond its defaults.

## Environment And Database

- Copy `.env.example` to the repository root as `.env`; the shared config searches upward for that file. Do not commit `.env`.
- Database commands need a reachable PostgreSQL instance and `DB_PASSWORD`; seed commands additionally require `SEED_PASSWORD`.
- `pnpm seed:admin` runs database migrations, backfills site inventory, then creates the initial admin user. Use `pnpm db:migrate` for migrations only.
- When changing `packages/db/src/schema.ts`, generate and commit a Drizzle migration with `pnpm db:generate`; do not silently rely on `db:push` for persisted environments.
- `pnpm db:seed:demo` and `pnpm db:purge:demo` change demo data; use them only when that data is intended.

## Docker And Caddy

- `docker compose up -d --build` starts PostgreSQL, the migration/seed job, and the combined API/web container in dependency order. The Caddy server remains external.
- Compose requires `DB_PASSWORD`, `JWT_SECRET`, `SEED_PASSWORD`, and `CADDY_ALLOWED_HOSTS`; attach external Caddy containers to the Compose internal network when needed.
- `CADDY_ALLOWED_HOSTS` is an exact hostname/IP allowlist. Set `ALLOW_PRIVATE_OUTBOUND=true` only when private-network Caddy or health targets are required.
- The API background health and housekeeping cron is configured in the database from the Dashboard; route reconciliation is manual from Site Inventory or `pnpm caddy:reconcile`; `pnpm caddy:housekeep` remains available.
