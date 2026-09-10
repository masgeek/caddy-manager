# Docker Deployment

Caddy Manager runs as three Compose services:

- `db`: PostgreSQL persistence.
- `migrate`: applies Drizzle migrations and seeds the initial user.
- `api`: Combined Fastify API and React application served by Fastify.

The Caddy server itself remains external. The API connects to it using the
configured Caddy Admin API endpoint.

## Requirements

- Docker Engine with Compose v2.
- A running Caddy instance with its Admin API enabled.
- A `.env` file based on `.env.example`.

## Required Configuration

Set these values before starting the stack:

```env
DB_PASSWORD=replace-me
JWT_SECRET=replace-with-a-long-random-secret
SEED_PASSWORD=replace-me
CADDY_ALLOWED_HOSTS=caddy,host.docker.internal
LOG_LEVEL=info
LOG_FILE=logs/caddy-manager.log
IMAGE_REGISTRY=ghcr.io/masgeek
```

Add the Caddy hostname to the same Docker network as the stack when Caddy is
running in another container. When Caddy runs on the host, use
`host.docker.internal` where supported and set `ALLOW_PRIVATE_OUTBOUND=true`
only when the Caddy endpoint requires private-network access.

## Start

```bash
docker compose up -d --build
```

The migration service runs after PostgreSQL is healthy. The combined
application starts only after migrations complete and exposes the web
application on port 80; the API and frontend use the same origin.

Open `http://localhost` after the application container is healthy.

To run the deployment smoke checks against a running container, use
`SMOKE_BASE_URL=http://localhost pnpm smoke`. The checks verify frontend
serving, `/api/health`, and that protected API routes reject unauthenticated
requests. The `api` service depends on the migration job completing
successfully before it starts.

When enabled in the persisted health settings, the API runs inventory
housekeeping and API-managed site health checks during startup, then follows
the database-configured schedule for subsequent cycles.
Route reconciliation is manual from Site Inventory or `pnpm caddy:reconcile`.
Manual API actions and commands such as `pnpm caddy:reconcile` remain available.

The dashboard can pause and resume the scheduler and persist its enabled state.
The schedule and health tuning values are also edited there and survive
container restarts.
On a new installation, the database defaults are enabled, `*/5 * * * *`, a
5-second timeout, five concurrent checks, two retries, and a 250ms retry delay.
Health checks use the configured timeout, concurrency, retry count, and retry
delay. Check results include latency, consecutive failures, and the last-run
summary exposed by the API.

The API writes structured logs to `LOG_FILE`, which defaults to
`logs/caddy-manager.log`, and rotates that file daily. Rotated files are
retained for 30 days. `LOG_LEVEL` defaults to `info`; use standard Pino levels
such as `debug`, `warn`, `error`, or `fatal` when more or less detail is needed.
Compose persists the API log directory in the `api_logs` volume.

For a full local Compose build, migration, startup, and smoke sequence, run
`pnpm smoke:compose`. This starts the stack with `docker compose up -d --build`,
runs the smoke checks, and removes the containers with `docker compose down`.

## Operations

```bash
# Follow application logs
docker compose logs -f api

# Inspect persisted API log files
docker compose exec api sh -c 'tail -f /repo/logs/caddy-manager.log'

# Check service status
docker compose ps

# Stop the stack without deleting database data
docker compose down

# Stop and remove database data
docker compose down -v
```

## Image Layout

The combined application image uses:

- `Dockerfile`
- `apps/api/Dockerfile.migrations`

The combined application runtime serves the frontend through Fastify and runs
as the unprivileged `caddy` user. The migration runtime also runs as the
unprivileged `caddy` user.

## GitHub Actions

CI is defined in `.github/workflows/ci.yml` and runs typechecking, tests,
linting, and builds on pushes and pull requests targeting `main`.

Docker publishing is defined in `.github/workflows/docker.yml` and publishes
the combined application image and migration image to GitHub Container Registry.
It delegates each image build to the reusable workflow
`.github/workflows/docker-build-job.yml`, which uses the local composite action
`.github/actions/docker-build` for multi-architecture builds, metadata, layer
caching, SBOM generation, and provenance attestations.

The published image names retain their existing suffixes:

- `ghcr.io/<owner>/caddy-manager-api` (combined API and web)
- `ghcr.io/<owner>/caddy-manager-migrate`

The workflow uses the built-in `GITHUB_TOKEN`; no Docker Hub credentials are
required. The package write permission is declared in the workflow. For private
GHCR packages, authenticate Docker on the deployment host with a GitHub token
that has package-read permission.
