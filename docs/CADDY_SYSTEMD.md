# Caddy systemd Setup

This unit starts Caddy from its autosaved JSON configuration. That is required
when Caddy Manager changes routes through the Caddy Admin API. The default
`caddy.service` starts from `/etc/caddy/Caddyfile`, which overwrites API-managed
routes after a restart.

## Requirements

- A Linux host using systemd.
- Caddy installed at `/usr/bin/caddy`.
- Caddy running as the `caddy` user and group.
- The Caddy Admin API available to Caddy Manager.
- An existing autosave, or a current JSON configuration ready to save.

## Install

Copy the unit from this repository to the systemd unit directory:

```bash
sudo install -m 0644 deploy/systemd/caddy.service /etc/systemd/system/caddy.service
```

The unit uses these persistent paths for Caddy's user:

```text
/var/lib/caddy/.config/caddy/autosave.json
/var/lib/caddy/.local/share/caddy/
```

Confirm that the autosave exists before restarting:

```bash
sudo -u caddy test -s /var/lib/caddy/.config/caddy/autosave.json
```

If that command fails, save the currently running Admin API configuration first.
This preserves the routes currently loaded in Caddy:

```bash
curl --fail --silent --show-error \
  http://127.0.0.1:2019/config/ \
  > /tmp/caddy-current.json

sudo caddy reload \
  --config /tmp/caddy-current.json \
  --adapter json

sudo -u caddy test -s /var/lib/caddy/.config/caddy/autosave.json
```

If the Admin API requires authentication, add the appropriate authorization
header to the `curl` command.

Apply and start the replacement unit:

```bash
sudo systemctl daemon-reload
sudo systemctl enable caddy
sudo systemctl restart caddy
sudo systemctl status caddy --no-pager
```

## Verify

Check that Caddy resumed successfully and that the dynamic route container is
still present:

```bash
curl --fail http://127.0.0.1:2019/config/
curl --fail http://127.0.0.1:2019/id/dynamic-sites
curl --fail http://127.0.0.1:2019/id/dynamic-site-router
```

Check the service log if startup fails:

```bash
journalctl -u caddy -n 100 --no-pager
```

## Operations

Use the Caddy Admin API or Caddy Manager to change the running JSON config.
Do not use the old Caddyfile-based reload command:

```bash
sudo caddy reload --config /etc/caddy/Caddyfile --force
```

That command can replace the autosaved JSON with the Caddyfile configuration.
After a Caddy Manager change, the autosave should be updated automatically.
Keep a backup before major changes:

```bash
sudo cp \
  /var/lib/caddy/.config/caddy/autosave.json \
  /var/lib/caddy/.config/caddy/autosave.json.backup
```

## Rollback

To restore the original Caddyfile-based service:

```bash
sudo cp /usr/lib/systemd/system/caddy.service /etc/systemd/system/caddy.service
sudo systemctl daemon-reload
sudo systemctl restart caddy
```

Note that rollback intentionally returns to Caddyfile behavior, so API-managed
dynamic routes will no longer survive restarts.
