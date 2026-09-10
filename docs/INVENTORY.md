# Site Inventory

Site Inventory stores the desired state of dynamic sites and separates that
state from the sites currently observed in Caddy.

## Lifecycle

Dynamic inventory entries use these states:

```text
draft -> ready -> provisioning -> provisioned
                    |                 |
                    +-> failed        +-> disabled
                    +-> not_provisioned
```

- `draft`: the definition is incomplete or has not been approved for
  provisioning.
- `ready`: the definition is eligible for provisioning.
- `provisioning`: a Caddy update is in progress.
- `provisioned`: the route was applied successfully and the observed site is
  linked to the inventory entry.
- `failed`: the last provisioning attempt failed. Review the state detail and
  retry after correcting the problem.
- `not_provisioned`: the definition is not currently present in Caddy and can
  be retried.
- `disabled`: the definition is intentionally inactive. It can be provisioned
  again when needed.

The `Provision` action is available for `ready`, `failed`,
`not_provisioned`, and `disabled` entries. Disabling a provisioned dynamic
site removes its managed route and observed site before marking the inventory
entry `disabled`.

## Permanent Deletion

Only inventory entries that are not `provisioned` can be permanently deleted.
The UI asks for confirmation before deletion, and the API enforces the same
rule. Provisioned entries must be disabled first so deletion cannot leave an
active managed route behind.

Caddyfile-managed entries are read-only and cannot be permanently deleted from
Site Inventory.

## Reconciliation

The scheduled health cycle does not change Caddy routes. Housekeeping checks
for dynamic inventory entries whose observed site is missing and marks them
`not_provisioned` without removing any live route. These entries appear in the
`Needs reconciliation` view, where operators can select one or more sites and
request a dry-run preview. The preview identifies routes to create, update, or
leave unchanged, and reports conflicts before changes are applied. Applying a
preview revalidates each site immediately and returns an individual result for
every selected entry, so one failure does not hide the outcome of other sites.

The command-line `pnpm caddy:reconcile` command remains available for an
explicit full reconciliation.

Reconciliation actions are recorded in the audit trail, including the selected
site IDs and whether the operation completed successfully. The Audit page can
filter by action, entity, and result; site entity IDs link back to the site.

Inventory can be filtered by server and route ID, sorted by domain, state, or
last update, and paged in the UI. The `Updated` timestamp on each row is the
latest inventory change and is useful when investigating a housekeeping flag.

The API endpoint is:

```http
DELETE /api/site-inventory/:id
```

The endpoint requires an `admin` or `operator` role.

## Notifications

Long-running actions use stacked `react-hot-toast` notifications instead of a
blocking status dialog. Running notifications update when the action finishes;
separate operations remain visible independently. Position, duration, and
spacing are configured in `apps/web/src/config/notifications.ts`.
