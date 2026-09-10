import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import Select from "react-select";
import { PageHeader } from "@caddy-manager/ui";
import type { SiteGroup, SiteInventory } from "@caddy-manager/shared-types";
import { api } from "../api/client";
import OperationToast, {
  type OperationState,
} from "../components/OperationToast";

export default function SiteInventory() {
  const navigate = useNavigate();
  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();
  const queryClient = useQueryClient();
  const [
    feedback,
    setFeedback,
  ] = useState<{
    message: string;
    kind: "success" | "danger" | "warning" | "info";
  } | null>(null);
  const [
    newGroupName,
    setNewGroupName,
  ] = useState("");
  const [
    newGroupServerId,
    setNewGroupServerId,
  ] = useState("");
  const [
    routeIdFilter,
    setRouteIdFilter,
  ] = useState("");
  const [
    serverFilter,
    setServerFilter,
  ] = useState("");
  const [
    sortBy,
    setSortBy,
  ] = useState<"domain" | "state" | "updatedAt">("domain");
  const [
    page,
    setPage,
  ] = useState(1);
  const [
    selectedInventoryIds,
    setSelectedInventoryIds,
  ] = useState<string[]>([]);
  const [
    reconcilePreview,
    setReconcilePreview,
  ] = useState<Awaited<ReturnType<typeof api.previewReconcileSites>> | null>(
    null,
  );
  const [
    operation,
    setOperation,
  ] = useState<OperationState | null>(null);
  const viewParam = searchParams.get("view");
  const inventoryView =
    viewParam === "caddyfile"
      ? "caddyfile"
      : viewParam === "reconcile"
        ? "reconcile"
        : "dynamic";
  const ensureMutation = useMutation({
    mutationFn: () => api.ensureDynamicInfrastructure(),
    onSuccess: (result) =>
      setFeedback({
        message: `Dynamic infrastructure is ready for ${result.serverBlocks} Caddy server block${result.serverBlocks === 1 ? "" : "s"}.`,
        kind: "success",
      }),
    onError: (error) =>
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : "Failed to ensure dynamic infrastructure",
        kind: "danger",
      }),
  });
  const query = useQuery({
    queryKey: [
      "site-inventory",
    ],
    queryFn: () => api.getSiteInventory(),
    refetchInterval: 30_000,
  });
  const groupsQuery = useQuery({
    queryKey: [
      "site-groups",
    ],
    queryFn: () => api.getSiteGroups(),
  });
  const serversQuery = useQuery({
    queryKey: [
      "servers",
    ],
    queryFn: () => api.getServers(),
  });

  const createGroupMutation = useMutation({
    mutationFn: () =>
      api.createSiteGroup({ serverId: newGroupServerId, name: newGroupName }),
    onSuccess: () => {
      setNewGroupName("");
      queryClient.invalidateQueries({
        queryKey: [
          "site-groups",
        ],
      });
    },
    onError: (error) =>
      setFeedback({
        message:
          error instanceof Error ? error.message : "Failed to create group",
        kind: "danger",
      }),
  });
  const assignGroupMutation = useMutation({
    mutationFn: ({ id, groupId }: { id: string; groupId: string | null }) =>
      api.updateSiteInventory(id, { groupId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [
          "site-inventory",
        ],
      }),
    onError: (error) =>
      setFeedback({
        message:
          error instanceof Error ? error.message : "Failed to assign group",
        kind: "danger",
      }),
  });
  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => api.deleteSiteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          "site-groups",
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "site-inventory",
        ],
      });
    },
    onError: (error) =>
      setFeedback({
        message:
          error instanceof Error ? error.message : "Failed to delete group",
        kind: "danger",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "ready" | "provision" | "disable" | "delete";
    }) => {
      if (action === "ready")
        return api.markInventoryReady(id).then(() => undefined);
      if (action === "provision")
        return api.provisionInventory(id).then(() => undefined);
      if (action === "delete") return api.deleteSiteInventory(id);
      return api.disableInventory(id).then(() => undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          "site-inventory",
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "sites",
        ],
      });
    },
    onError: (error) =>
      setFeedback({
        message:
          error instanceof Error ? error.message : "Inventory action failed",
        kind: "danger",
      }),
  });

  const reconcileMutation = useMutation({
    mutationFn: (siteIds: string[]) => api.reconcileSites(siteIds),
    onSuccess: () => {
      setSelectedInventoryIds([]);
      queryClient.invalidateQueries({
        queryKey: [
          "site-inventory",
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "sites",
        ],
      });
      setOperation({
        title: "Sites reconciled",
        message: "The selected sites were reconciled with Caddy.",
        status: "success",
      });
    },
    onError: (error) =>
      setOperation({
        title: "Reconciliation failed",
        message:
          error instanceof Error ? error.message : "Failed to reconcile sites",
        status: "error",
      }),
  });

  const previewMutation = useMutation({
    mutationFn: (siteIds: string[]) => api.previewReconcileSites(siteIds),
    onSuccess: setReconcilePreview,
    onError: (error) =>
      setOperation({
        title: "Preview failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to preview reconciliation",
        status: "error",
      }),
  });

  const runEnsure = () => {
    setOperation({
      title: "Ensuring Caddy setup",
      message:
        "Checking every configured Caddy server block and creating missing dynamic route containers.",
      status: "running",
    });
    ensureMutation.mutate(undefined, {
      onSuccess: (result) =>
        setOperation({
          title: "Caddy setup complete",
          message: `Checked ${result.serverBlocks} Caddy server block${result.serverBlocks === 1 ? "" : "s"}.`,
          status: "success",
        }),
      onError: (error) =>
        setOperation({
          title: "Caddy setup failed",
          message:
            error instanceof Error ? error.message : "Caddy setup failed",
          status: "error",
        }),
    });
  };

  const rows = (query.data ?? []).filter((row) => {
    const matchesView =
      inventoryView === "caddyfile"
        ? row.managementType === "caddyfile"
        : inventoryView === "reconcile"
          ? row.managementType === "dynamic" &&
            [
              "failed",
              "not_provisioned",
            ].includes(row.state)
          : row.managementType === "dynamic";
    const routeId = row.routeId ?? "";
    return (
      matchesView &&
      (!serverFilter || row.serverId === serverFilter) &&
      (!routeIdFilter ||
        routeId.toLowerCase().includes(routeIdFilter.toLowerCase()))
    );
  });
  const sortedRows = [
    ...rows,
  ].sort((a, b) =>
    sortBy === "updatedAt"
      ? String(b[sortBy]).localeCompare(String(a[sortBy]))
      : String(a[sortBy]).localeCompare(String(b[sortBy])),
  );
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const visibleRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);
  const reconciliationCount = (query.data ?? []).filter(
    (row) =>
      row.managementType === "dynamic" &&
      [
        "failed",
        "not_provisioned",
      ].includes(row.state),
  ).length;
  const routeIdOptions = [
    ...new Set(
      (query.data ?? [])
        .map((row) => row.routeId)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();

  const changeInventoryView = (view: "dynamic" | "caddyfile" | "reconcile") => {
    if (view !== "reconcile") setReconcilePreview(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", view);
    setSearchParams(nextParams);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Desired state"
        title={
          inventoryView === "dynamic"
            ? "Dynamic site inventory"
            : inventoryView === "caddyfile"
              ? "Caddyfile-managed inventory"
              : "Sites needing reconciliation"
        }
        description={
          inventoryView === "dynamic"
            ? "Desired-state definitions provisioned through the Caddy Admin API."
            : inventoryView === "caddyfile"
              ? "Definitions discovered from Caddyfile configuration and kept read-only."
              : "Dynamic sites flagged by housekeeping after their observed site went missing."
        }
        actions={
          <div className="d-flex gap-2 align-items-center">
            <button
              className="btn btn-outline-success"
              onClick={runEnsure}
              disabled={ensureMutation.isPending}
              title="Create dynamic-sites and dynamic-site-router when missing"
            >
              <i className="bi bi-shield-check me-1"></i>
              {ensureMutation.isPending ? "Ensuring..." : "Ensure Caddy setup"}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/sites/new")}
            >
              <i className="bi bi-plus-lg me-1"></i>Add site
            </button>
          </div>
        }
        signal={
          <>
            <strong>{rows.length} definitions</strong>
            <span className="ms-auto">
              {rows.filter((row) => row.state === "provisioned").length}{" "}
              provisioned
            </span>
          </>
        }
      />

      <nav className="site-view-tabs mb-3" aria-label="Inventory views">
        <button
          type="button"
          className={inventoryView === "dynamic" ? "active" : ""}
          onClick={() => changeInventoryView("dynamic")}
          aria-current={inventoryView === "dynamic" ? "page" : undefined}
        >
          <i className="bi bi-cloud-check me-2"></i>
          Dynamic{" "}
          <span>
            {query.data?.filter((row) => row.managementType === "dynamic")
              .length ?? 0}
          </span>
        </button>
        <button
          type="button"
          className={inventoryView === "caddyfile" ? "active" : ""}
          onClick={() => changeInventoryView("caddyfile")}
          aria-current={inventoryView === "caddyfile" ? "page" : undefined}
        >
          <i className="bi bi-file-earmark-code me-2"></i>
          Caddyfile-managed{" "}
          <span>
            {query.data?.filter((row) => row.managementType === "caddyfile")
              .length ?? 0}
          </span>
        </button>
        <button
          type="button"
          className={inventoryView === "reconcile" ? "active" : ""}
          onClick={() => changeInventoryView("reconcile")}
          aria-current={inventoryView === "reconcile" ? "page" : undefined}
        >
          <i className="bi bi-arrow-repeat me-2"></i>
          Needs reconciliation <span>{reconciliationCount}</span>
        </button>
      </nav>

      <section className="card p-3 mb-3 inventory-filter-panel">
        <div className="inventory-filter-bar">
          <label htmlFor="inventory-server-filter">Server</label>
          <select
            id="inventory-server-filter"
            className="form-select inventory-route-filter"
            value={serverFilter}
            onChange={(event) => {
              setServerFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All servers</option>
            {(serversQuery.data ?? []).map((server) => (
              <option key={server.id} value={server.id}>
                {server.name}
              </option>
            ))}
          </select>
          <label htmlFor="inventory-route-id-filter">Filter by route ID</label>
          <Select
            inputId="inventory-route-id-filter"
            className="inventory-route-filter"
            classNamePrefix="site-select"
            options={routeIdOptions.map((routeId) => ({
              value: routeId,
              label: routeId,
            }))}
            value={
              routeIdFilter
                ? { value: routeIdFilter, label: routeIdFilter }
                : null
            }
            onChange={(option) => {
              setRouteIdFilter(option?.value ?? "");
              setPage(1);
            }}
            isClearable
            isSearchable
            placeholder="Filter by route ID"
            aria-label="Filter by route ID"
            menuPortalTarget={document.body}
            menuPosition="fixed"
            styles={{ menuPortal: (base) => ({ ...base, zIndex: 1055 }) }}
          />
          <label htmlFor="inventory-sort">Sort</label>
          <select
            id="inventory-sort"
            className="form-select"
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as typeof sortBy);
              setPage(1);
            }}
          >
            <option value="domain">Domain</option>
            <option value="state">State</option>
            <option value="updatedAt">Recently updated</option>
          </select>
        </div>
      </section>

      {inventoryView === "reconcile" && (
        <section className="card p-3 mb-3">
          <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
            <span className="text-muted">
              {selectedInventoryIds.length} site
              {selectedInventoryIds.length === 1 ? "" : "s"} selected
            </span>
            <button
              type="button"
              className="btn btn-outline-success"
              disabled={
                selectedInventoryIds.length === 0 || previewMutation.isPending
              }
              onClick={() => {
                previewMutation.mutate(selectedInventoryIds);
              }}
            >
              <i className="bi bi-eye me-1"></i>
              {previewMutation.isPending
                ? "Preparing preview..."
                : "Preview changes"}
            </button>
          </div>
          {reconcilePreview && (
            <div className="mt-3 border-top pt-3">
              <strong>Reconciliation preview</strong>
              <div className="table-responsive mt-2">
                <table className="table table-sm align-middle mb-2">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Server block</th>
                      <th>Route</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconcilePreview.sites.map((site) => (
                      <tr key={site.siteId}>
                        <td>{site.domain}</td>
                        <td>{site.serverName || "-"}</td>
                        <td>
                          <code>{site.routeId || "-"}</code>
                        </td>
                        <td
                          className={
                            site.action === "conflict" ? "text-danger" : ""
                          }
                        >
                          <strong>{site.action.replaceAll("_", " ")}</strong>
                          <div className="small text-muted">{site.detail}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="btn btn-success"
                disabled={
                  reconcileMutation.isPending ||
                  reconcilePreview.sites.some(
                    (site) => site.action === "conflict",
                  )
                }
                onClick={() => {
                  setOperation({
                    title: "Reconciling selected sites",
                    message: "Applying the previewed route changes in Caddy.",
                    status: "running",
                  });
                  reconcileMutation.mutate(selectedInventoryIds);
                }}
              >
                <i className="bi bi-arrow-repeat me-1"></i>
                {reconcileMutation.isPending
                  ? "Reconciling..."
                  : "Apply preview"}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="card p-3 mb-3">
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <strong className="me-2">Create group</strong>
          <select
            className="form-select"
            style={{ maxWidth: 240 }}
            value={newGroupServerId}
            onChange={(event) => setNewGroupServerId(event.target.value)}
          >
            <option value="">Select server</option>
            {(serversQuery.data ?? []).map((server) => (
              <option key={server.id} value={server.id}>
                {server.name}
              </option>
            ))}
          </select>
          <input
            className="form-control"
            style={{ maxWidth: 240 }}
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            placeholder="Group name"
          />
          <button
            className="btn btn-outline-primary"
            disabled={
              !newGroupServerId ||
              !newGroupName.trim() ||
              createGroupMutation.isPending
            }
            onClick={() => createGroupMutation.mutate()}
          >
            Create group
          </button>
        </div>
        {(groupsQuery.data ?? []).length > 0 && (
          <div className="d-flex gap-2 flex-wrap mt-3">
            {(groupsQuery.data ?? []).map((group) => (
              <span
                className="badge text-bg-light border d-inline-flex align-items-center gap-2"
                key={group.id}
              >
                {group.name}
                <button
                  type="button"
                  className="btn-close"
                  aria-label={`Delete ${group.name}`}
                  onClick={() => deleteGroupMutation.mutate(group.id)}
                />
              </span>
            ))}
          </div>
        )}
      </section>

      {feedback && (
        <div className={`alert alert-${feedback.kind}`} role="alert">
          {feedback.message}
        </div>
      )}
      {query.isLoading && (
        <div className="alert alert-info" role="status">
          Loading inventory...
        </div>
      )}
      {query.isError && (
        <div className="alert alert-danger" role="alert">
          Failed to load inventory:{" "}
          {query.error instanceof Error
            ? query.error.message
            : "Request failed"}
        </div>
      )}
      {!query.isLoading && !query.isError && (
        <InventoryTable
          rows={visibleRows}
          groups={groupsQuery.data ?? []}
          selectable={inventoryView === "reconcile"}
          selectedIds={selectedInventoryIds}
          onSelectionChange={(ids) => {
            setSelectedInventoryIds(ids);
            setReconcilePreview(null);
          }}
          onAction={(id, action) => {
            if (
              action === "delete" &&
              !window.confirm(
                "Permanently delete this inventory definition? This cannot be undone.",
              )
            ) {
              return;
            }
            setOperation({
              title:
                action === "provision"
                  ? "Provisioning site"
                  : action === "delete"
                    ? "Deleting inventory site"
                    : "Updating site inventory",
              message: "Applying the requested inventory change. Please wait.",
              status: "running",
            });
            updateMutation.mutate(
              { id, action },
              {
                onSuccess: () =>
                  setOperation({
                    title: "Inventory update complete",
                    message:
                      "The requested inventory action completed successfully.",
                    status: "success",
                  }),
                onError: (error) =>
                  setOperation({
                    title: "Inventory update failed",
                    message:
                      error instanceof Error
                        ? error.message
                        : "Inventory action failed",
                    status: "error",
                  }),
              },
            );
          }}
          onGroupChange={(id, groupId) =>
            assignGroupMutation.mutate({ id, groupId })
          }
        />
      )}
      {pageCount > 1 && (
        <nav
          className="d-flex justify-content-between align-items-center mt-3"
          aria-label="Inventory pages"
        >
          <span className="text-muted">
            Page {page} of {pageCount} ({sortedRows.length} matching)
          </span>
          <div className="btn-group">
            <button
              className="btn btn-outline-secondary"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <button
              className="btn btn-outline-secondary"
              disabled={page === pageCount}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </nav>
      )}
      <OperationToast
        operation={operation}
        onClose={() => setOperation(null)}
      />
    </div>
  );
}

function InventoryTable({
  rows,
  groups,
  onAction,
  onGroupChange,
  selectable,
  selectedIds,
  onSelectionChange,
}: {
  rows: SiteInventory[];
  groups: SiteGroup[];
  onAction: (
    id: string,
    action: "ready" | "provision" | "disable" | "delete",
  ) => void;
  onGroupChange: (id: string, groupId: string | null) => void;
  selectable: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="card p-4 text-muted">
        No site inventory definitions yet.
      </div>
    );
  }

  const groupedRows = new Map<string, SiteInventory[]>();
  for (const row of rows) {
    const key = row.routeId ?? "ungrouped";
    groupedRows.set(key, [
      ...(groupedRows.get(key) ?? []),
      row,
    ]);
  }

  return (
    <div className="card p-3 table-responsive">
      <table className="table align-middle mb-0">
        <thead>
          <tr>
            {selectable && (
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all visible sites"
                  checked={
                    rows.length > 0 &&
                    rows.every((row) => selectedIds.includes(row.id))
                  }
                  onChange={(event) =>
                    onSelectionChange(
                      event.target.checked ? rows.map((row) => row.id) : [],
                    )
                  }
                />
              </th>
            )}
            <th>Domain</th>
            <th>Site ID</th>
            <th>Route ID</th>
            <th>Server Block</th>
            <th>Upstream</th>
            <th>TLS</th>
            <th>Type</th>
            <th>Group</th>
            <th>State</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {[
            ...groupedRows.entries(),
          ].map(
            ([
              groupId,
              groupRows,
            ]) => (
              <Fragment key={groupId}>
                <tr className="table-light" key={`${groupId}-header`}>
                  <th colSpan={selectable ? 11 : 10}>
                    {groupId === "ungrouped" ? "Ungrouped sites" : groupId}
                    <span className="text-muted ms-2">
                      ({groupRows.length})
                    </span>
                  </th>
                </tr>
                {groupRows.map((row) => (
                  <tr key={row.id}>
                    {selectable && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.domain}`}
                          checked={selectedIds.includes(row.id)}
                          onChange={(event) =>
                            onSelectionChange(
                              event.target.checked
                                ? [
                                    ...selectedIds,
                                    row.id,
                                  ]
                                : selectedIds.filter((id) => id !== row.id),
                            )
                          }
                        />
                      </td>
                    )}
                    <td>{row.domain}</td>
                    <td>
                      <code>{row.provisionedSiteId ?? "Not provisioned"}</code>
                    </td>
                    <td>
                      <code>{row.routeId ?? "Caddyfile"}</code>
                    </td>
                    <td>{row.caddyServerName ?? "Default block"}</td>
                    <td>{row.upstream ?? "-"}</td>
                    <td>{row.tlsEnabled ? "Yes" : "No"}</td>
                    <td>{row.managementType}</td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={row.groupId ?? ""}
                        disabled={
                          !row.serverId || row.managementType === "caddyfile"
                        }
                        onChange={(event) =>
                          onGroupChange(row.id, event.target.value || null)
                        }
                      >
                        <option value="">No group</option>
                        {groups
                          .filter((group) => group.serverId === row.serverId)
                          .map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      {row.state}
                      {row.stateDetail && (
                        <div className="small text-danger">
                          {row.stateDetail}
                        </div>
                      )}
                      <div className="small text-muted">
                        Updated {new Date(row.updatedAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="d-flex gap-1">
                      {row.managementType === "dynamic" &&
                        row.state === "draft" && (
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => onAction(row.id, "ready")}
                          >
                            Mark ready
                          </button>
                        )}
                      {row.managementType === "dynamic" &&
                        [
                          "ready",
                          "failed",
                          "not_provisioned",
                          "disabled",
                        ].includes(row.state) && (
                          <button
                            className="btn btn-sm btn-outline-success"
                            onClick={() => onAction(row.id, "provision")}
                          >
                            Provision
                          </button>
                        )}
                      {row.managementType === "dynamic" &&
                        row.state !== "disabled" && (
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => onAction(row.id, "disable")}
                          >
                            Disable
                          </button>
                        )}
                      {row.managementType === "dynamic" &&
                        row.state !== "provisioned" && (
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => onAction(row.id, "delete")}
                            title="Permanently delete this inventory definition"
                          >
                            <i className="bi bi-trash3" aria-hidden="true" />
                          </button>
                        )}
                      {row.managementType === "caddyfile" && (
                        <span className="small text-muted">
                          Managed in Caddyfile
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
