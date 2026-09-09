# Optional Homarr Dashboard

Homarr is an optional dashboard for linking to Caddy Manager and other
infrastructure services. It is intentionally not part of the default
`docker-compose.yml` because it is a separate user-facing dashboard and does
not belong in the Caddy Manager application dependency chain.

## Compose Service

Add this service to a local Compose override when Homarr is needed:

```yaml
services:
  homarr:
    image: ghcr.io/ajnart/homarr:latest
    restart: unless-stopped
    init: true
    ports:
      - "${HOMARR_PORT:-7575}:7575"
    volumes:
      - homarr_data:/appdata
    security_opt:
      - no-new-privileges:true
    networks:
      - web

volumes:
  homarr_data:

networks:
  web:
    external: true
```

If the Caddy Manager Compose project uses a generated network name, replace
`web` with the actual shared network name. Do not attach Homarr to the

## Start With the Stack

From the repository root:

```bash
docker compose up -d --build
docker compose -f docker-compose.yml -f docker-compose.homarr.yml up -d
```

The second command assumes the override is stored as
configuration in its named volume and do not reuse the PostgreSQL volume.

## Add Caddy Manager to Homarr

Create an application tile with:

- Name: `Caddy Manager`
- URL: `https://caddy-manager.example.com`
- Description: `Caddy server and route administration`
- Icon: Caddy Manager favicon or a network/infrastructure icon

Replace the hostname with the public hostname configured in the proxy
deployment tool. Do not point Homarr at the internal `api:3500` service.

## Proxying Homarr Through Caddy

If Homarr should have a public hostname, expose only the Homarr web service
through the proxy. The Caddy route should target the Docker service and port:

```json
{
  "@id": "homarr-web",
  "match": [{ "host": ["dashboard.example.com"] }],
  "handle": [
    {
      "handler": "reverse_proxy",
      "upstreams": [{ "dial": "homarr:7575" }]
    }
  ],
  "terminal": true
}
```

Use the deployment platform's existing TLS settings and replace the hostname
with the configured dashboard domain. Never expose the Docker socket or
Homarr's internal storage through a public route.

## Security Notes

- Protect Homarr with the authentication options supported by the installed version.
- Do not mount `/var/run/docker.sock` unless Docker discovery is explicitly required.
- If the Docker socket is mounted, treat Homarr as a privileged infrastructure tool.
- Use a separate Homarr volume and backup policy.
- Keep Caddy Manager API and PostgreSQL ports private.
