# Docker Deployment

Caddy Manager runs as four Compose services:

- `db`: PostgreSQL persistence.
- `migrate`: applies Drizzle migrations and seeds the initial user.
- `api`: Fastify API and background health jobs.
- `web`: Nginx-hosted React application and `/api` reverse proxy.

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
SITE_HEALTH_ENABLED=true
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

The migration service runs after PostgreSQL is healthy. The API starts only
after migrations complete, and the web service starts after the API healthcheck
passes.

Open `http://localhost:${WEB_PORT:-80}` after the web container is healthy.

When enabled, the API runs one site health-check pass during startup before
starting the scheduled job. It then follows `SITE_CHECK_CRON` for subsequent
runs. Set `SITE_HEALTH_ENABLED=false` to disable both the startup pass and the
background cron job for site health checks, inventory housekeeping, and
missing-route reconciliation. Manual API actions and commands such as
`pnpm caddy:reconcile` remain available.

The API writes structured logs to `LOG_FILE`, which defaults to
`logs/caddy-manager.log`, and rotates that file daily. Rotated files are
retained for 30 days. `LOG_LEVEL` defaults to `info`; use standard Pino levels
such as `debug`, `warn`, `error`, or `fatal` when more or less detail is needed.
Compose persists the API log directory in the `api_logs` volume.

## Operations

```bash
# Follow service logs
docker compose logs -f api web

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

The active Dockerfiles are kept beside their applications:

- `apps/api/Dockerfile`
- `apps/api/Dockerfile.migrations`
- `apps/web/Dockerfile`

The API and migration runtime containers run as the unprivileged `caddy` user.
The web image uses the unprivileged Nginx Alpine runtime defaults.

## GitHub Actions

CI is defined in `.github/workflows/ci.yml` and runs typechecking, tests,
linting, and builds on pushes and pull requests targeting `main`.

Docker publishing is defined in `.github/workflows/docker.yml` and publishes
to GitHub Container Registry. It delegates each image build to the reusable workflow
`.github/workflows/docker-build-job.yml`, which uses the local composite action
`.github/actions/docker-build` for multi-architecture builds, metadata, layer
caching, SBOM generation, and provenance attestations.

The published image names retain their existing suffixes:

- `ghcr.io/<owner>/caddy-manager-api`
- `ghcr.io/<owner>/caddy-manager-web`
- `ghcr.io/<owner>/caddy-manager-migrate`

The workflow uses the built-in `GITHUB_TOKEN`; no Docker Hub credentials are
required. The package write permission is declared in the workflow. For private
GHCR packages, authenticate Docker on the deployment host with a GitHub token
that has package-read permission.
