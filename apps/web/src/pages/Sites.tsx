import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DataTable,
  StatusBadge,
  ConfirmDialog,
  PageHeader,
} from "@caddy-manager/ui";
import type { Column } from "@caddy-manager/ui";
import type { Site } from "@caddy-manager/shared-types";
import { api } from "../api/client";
import SiteFilters from "../components/SiteFilters";
import OperationToast, {
  type OperationState,
} from "../components/OperationToast";

const columns: Column<Site>[] = [
  { field: "domain", headerName: "Domain" },
  {
    field: "routeId",
    headerName: "@id",
    render: (value) =>
      value ? (
        <code>{String(value)}</code>
      ) : (
        <span
          className="small text-muted"
          title="Managed directly in the Caddyfile"
        >
          <i className="bi bi-file-earmark-code me-1"></i>Caddyfile-managed
        </span>
      ),
  },
  { field: "upstream", headerName: "Upstream" },
  {
    field: "synced",
    headerName: "In Config",
    render: (value) =>
      value ? (
        <i className="bi bi-check-circle text-success"></i>
      ) : (
        <i className="bi bi-x-circle text-danger"></i>
      ),
  },
  {
    field: "tlsEnabled",
    headerName: "TLS",
    render: (value) => (value ? "Yes" : "No"),
  },
  {
    field: "status",
    headerName: "Status",
    render: (value, row) => (
      <div>
        <StatusBadge status={String(value)} />
        {row.statusDetail && (
          <div
            className="small text-muted text-truncate"
            style={{ maxWidth: 220 }}
            title={row.statusDetail}
          >
            {row.statusDetail}
          </div>
        )}
        {row.healthLatencyMs !== undefined && (
          <div className="small text-muted">{row.healthLatencyMs} ms</div>
        )}
        {row.consecutiveFailures > 0 && (
          <div className="small text-danger">
            {row.consecutiveFailures} consecutive failures
          </div>
        )}
      </div>
    ),
  },
];

const SITE_PAGE_SIZE = 20;

export default function Sites() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [domainFilter, setDomainFilter] = useState("");
  const [serverIdFilter, setServerIdFilter] = useState("");
  const [serverFilter, setServerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [routeIdFilter, setRouteIdFilter] = useState("");
  const [sitePage, setSitePage] = useState(0);
  const siteView = searchParams.get("view") === "caddy" ? "caddy" : "api";
  const showCaddyfile = searchParams.get("showCaddyfile") === "true";

  const changeSiteView = (view: "api" | "caddy") => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", view);
    setSearchParams(nextParams);
    setSitePage(0);
  };

  const changeShowCaddyfile = (show: boolean) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("showCaddyfile", String(show));
    setSearchParams(nextParams);
    setSitePage(0);
  };

  const query = useQuery({
    queryKey: ["sites"],
    queryFn: () => api.getSites(),
    refetchInterval: 30_000,
  });

  const serversQuery = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.getServers(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      setDeleteId(null);
      setOperation({
        title: "Site deleted",
        message: "The site was deleted successfully.",
        status: "success",
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to delete site";
      setFeedback(message);
      setOperation({ title: "Delete failed", message, status: "error" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => api.syncSite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      setOperation({
        title: "Site synced",
        message: "The site was synced successfully.",
        status: "success",
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to sync site";
      setFeedback(message);
      setOperation({ title: "Sync failed", message, status: "error" });
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: () => api.reconcileSites(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      setOperation({
        title: "Routes reconciled",
        message: "Missing routes were recreated in Caddy.",
        status: "success",
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to reconcile routes";
      setFeedback(message);
      setOperation({
        title: "Reconciliation failed",
        message,
        status: "error",
      });
    },
  });

  const healthCheckMutation = useMutation({
    mutationFn: () => api.checkAllSites(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      setOperation({
        title: "Health check complete",
        message: "Health was checked for all sites.",
        status: "success",
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to check site health";
      setFeedback(message);
      setOperation({ title: "Health check failed", message, status: "error" });
    },
  });

  const rows = query.data || [];
  const viewRows = rows.filter((row) => {
    if (siteView === "caddy") return !row.routeId;
    return showCaddyfile || Boolean(row.routeId);
  });
  const servers = serversQuery.data || [];
  const serverNames = new Map(
    servers.map((server) => [server.id, server.name]),
  );
  const domainOptions = [...new Set(viewRows.map((row) => row.domain))].sort();
  const routeIdOptions = [
    ...new Set(
      rows
        .map((row) => row.routeId)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  const serverIdOptions = [
    ...new Set(viewRows.map((row) => row.serverId)),
  ].sort((a, b) =>
    (serverNames.get(a) ?? a).localeCompare(serverNames.get(b) ?? b),
  );
  const serverOptions = [
    ...new Set(
      viewRows
        .map((row) => row.caddyServerName)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  const statusOptions = [...new Set(viewRows.map((row) => row.status))].sort();
  const filteredRows = viewRows.filter((row) => {
    return (
      (!domainFilter || row.domain === domainFilter) &&
      (!serverIdFilter || row.serverId === serverIdFilter) &&
      (!serverFilter || row.caddyServerName === serverFilter) &&
      (!statusFilter || row.status === statusFilter) &&
      (!routeIdFilter ||
        row.routeId?.toLowerCase().includes(routeIdFilter.toLowerCase()))
    );
  });
  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / SITE_PAGE_SIZE),
  );
  const currentPage = Math.min(sitePage, totalPages - 1);
  const pageRows = filteredRows.slice(
    currentPage * SITE_PAGE_SIZE,
    (currentPage + 1) * SITE_PAGE_SIZE,
  );
  const groupedPageRows = [...pageRows].sort((a, b) =>
    (a.routeId ?? a.id).localeCompare(b.routeId ?? b.id),
  );
  const activeCount = rows.filter((row) => row.status === "active").length;
  const warningCount = rows.filter((row) => row.status === "warning").length;
  const errorCount = rows.filter((row) => row.status === "error").length;
  const syncedCount = rows.filter((row) => row.synced).length;

  const actionColumn: Column<Site> = {
    field: "actions",
    headerName: "Actions",
    render: (_, row) =>
      !row.routeId ? (
        <span className="small text-muted">Managed in Caddyfile</span>
      ) : (
        <div className="d-flex gap-1">
          {!row.synced && row.routeId && (
            <button
              className="btn btn-sm btn-outline-success"
              onClick={() => {
                setOperation({
                  title: "Syncing site",
                  message: "Pushing the site route to Caddy.",
                  status: "running",
                });
                syncMutation.mutate(row.id);
              }}
              title="Push to Caddy config"
            >
              <i className="bi bi-cloud-upload"></i>
            </button>
          )}
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={() => navigate(`/sites/${row.id}/edit`)}
            title="Edit site"
          >
            <i className="bi bi-pencil"></i>
          </button>
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={() => setDeleteId(row.id)}
            title="Delete site"
          >
            <i className="bi bi-trash"></i>
          </button>
        </div>
      ),
  };

  const serverColumn: Column<Site> = {
    field: "serverId",
    headerName: "Server",
    render: (value) => serverNames.get(String(value)) ?? "Unknown server",
  };

  return (
    <div>
      <PageHeader
        eyebrow="Routing inventory"
        title={
          siteView === "caddy"
            ? "Caddyfile-managed sites"
            : showCaddyfile
              ? "All sites"
              : "API-managed sites"
        }
        description={
          siteView === "caddy"
            ? "Routes discovered from Caddyfile configuration and kept read-only here."
            : showCaddyfile
              ? "Provisioned routes, including sites managed directly in the Caddyfile."
              : "Routes managed by Caddy Manager through the admin API."
        }
        actions={
          <button
            className="btn btn-primary"
            onClick={() => navigate("/sites/new")}
          >
            <i className="bi bi-plus-lg me-1"></i> Add site
          </button>
        }
        signal={
          <>
            <strong>
              {activeCount} of {rows.length} healthy
            </strong>
            <span className="ms-auto">{syncedCount} synced to Caddy</span>
            <span
              className={
                errorCount
                  ? "text-danger"
                  : warningCount
                    ? "text-warning"
                    : "text-success"
              }
            >
              {errorCount
                ? `${errorCount} errors`
                : warningCount
                  ? `${warningCount} warnings`
                  : "No errors"}
            </span>
          </>
        }
      />

      <nav className="site-view-tabs mb-3" aria-label="Site management views">
        <button
          type="button"
          className={siteView === "api" ? "active" : ""}
          onClick={() => changeSiteView("api")}
          aria-current={siteView === "api" ? "page" : undefined}
        >
          <i className="bi bi-cloud-check me-2"></i>
          API-managed <span>{rows.filter((row) => row.routeId).length}</span>
        </button>
        <button
          type="button"
          className={siteView === "caddy" ? "active" : ""}
          onClick={() => changeSiteView("caddy")}
          aria-current={siteView === "caddy" ? "page" : undefined}
        >
          <i className="bi bi-file-earmark-code me-2"></i>
          Caddyfile-managed{" "}
          <span>{rows.filter((row) => !row.routeId).length}</span>
        </button>
        <label className="ms-auto d-flex align-items-center gap-2 small text-muted">
          <input
            type="checkbox"
            checked={showCaddyfile}
            onChange={(event) => changeShowCaddyfile(event.target.checked)}
          />
          Show Caddyfile-managed
        </label>
      </nav>

      <section className="card p-3 mb-3 sites-filter-panel">
        <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
          <div className="page-eyebrow mb-0">Filter sites</div>
          <SiteFilters
            domains={domainOptions}
            routeIds={routeIdOptions}
            servers={serverIdOptions.map((serverId) => ({
              value: serverId,
              label: serverNames.get(serverId) ?? serverId,
            }))}
            serverBlocks={serverOptions}
            statuses={statusOptions}
            values={{
              domain: domainFilter,
              serverId: serverIdFilter,
              serverBlock: serverFilter,
              status: statusFilter,
              routeId: routeIdFilter,
            }}
            onChange={(filter, value) => {
              if (filter === "domain") setDomainFilter(value);
              if (filter === "serverId") setServerIdFilter(value);
              if (filter === "serverBlock") setServerFilter(value);
              if (filter === "status") setStatusFilter(value);
              if (filter === "routeId") setRouteIdFilter(value);
              setSitePage(0);
            }}
          />
        </div>
      </section>

      <div className="sites-toolbar d-flex justify-content-between align-items-center mb-3">
        <div className="page-eyebrow mb-0">Managed routes</div>
        <div className="d-flex gap-2">
          <button
            className="btn btn-outline-info"
            onClick={() => {
              setOperation({
                title: "Checking site health",
                message: "Checking health for all managed sites.",
                status: "running",
              });
              healthCheckMutation.mutate();
            }}
            disabled={healthCheckMutation.isPending}
            title="Check health for all sites"
          >
            <i className="bi bi-heart-pulse me-1"></i>
            {healthCheckMutation.isPending ? "Checking..." : "Check Health"}
          </button>
          <button
            className="btn btn-outline-success"
            onClick={() => {
              setOperation({
                title: "Reconciling routes",
                message: "Recreating missing routes in Caddy.",
                status: "running",
              });
              reconcileMutation.mutate();
            }}
            disabled={reconcileMutation.isPending}
            title="Recreate missing routes in Caddy"
          >
            <i className="bi bi-arrow-repeat me-1"></i>
            {reconcileMutation.isPending
              ? "Reconciling..."
              : "Reconcile Routes"}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className="alert alert-danger alert-dismissible fade show"
          role="alert"
        >
          {feedback}
          <button
            type="button"
            className="btn-close"
            onClick={() => setFeedback(null)}
          />
        </div>
      )}

      {query.isLoading && (
        <div className="alert alert-info" role="status" aria-live="polite">
          Loading sites...
        </div>
      )}
      {query.isError && (
        <div className="alert alert-danger" role="alert">
          Failed to load sites:{" "}
          {query.error instanceof Error
            ? query.error.message
            : "Request failed"}
          <button
            className="btn btn-sm btn-outline-danger ms-2"
            onClick={() => query.refetch()}
          >
            Retry
          </button>
        </div>
      )}

      {!query.isError && !query.isLoading && (
        <div className="sites-table-scroll">
          <DataTable
            columns={[serverColumn, ...columns, actionColumn]}
            rows={groupedPageRows}
            getRowId={(r) => r.id}
            groupBy={(row) => row.routeId ?? row.id}
            totalCount={filteredRows.length}
            page={currentPage}
            pageSize={SITE_PAGE_SIZE}
            onPageChange={setSitePage}
          />
        </div>
      )}

      {!query.isError && !query.isLoading && filteredRows.length > 0 && (
        <div className="d-flex justify-content-between align-items-center mt-2 small text-muted">
          <span>
            Showing {currentPage * SITE_PAGE_SIZE + 1}-
            {Math.min((currentPage + 1) * SITE_PAGE_SIZE, filteredRows.length)}{" "}
            of {filteredRows.length} sites
          </span>
          <span>
            Page {currentPage + 1} of {totalPages}
          </span>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Site"
        message="Are you sure you want to delete this site?"
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteId) return;
          setOperation({
            title: "Deleting site",
            message: "Removing the site and its managed route.",
            status: "running",
          });
          deleteMutation.mutate(deleteId);
        }}
        onCancel={() => setDeleteId(null)}
      />
      <OperationToast
        operation={operation}
        onClose={() => setOperation(null)}
      />
    </div>
  );
}
