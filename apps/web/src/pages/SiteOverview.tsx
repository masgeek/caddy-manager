import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FormattedDateTime,
  JsonViewer,
  PageHeader,
  StatusBadge,
} from "@caddy-manager/ui";
import { api } from "../api/client";

function findHandler(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const handler = findHandler(item);
      if (handler) return handler;
    }
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.handler === "string") return record.handler;
  return findHandler(record.handle) ?? findHandler(record.routes);
}

export default function SiteOverview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const siteQuery = useQuery({
    queryKey: ["site", id],
    queryFn: () => api.getSite(id!),
    enabled: !!id,
  });
  const serversQuery = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.getServers(),
  });

  if (siteQuery.isLoading)
    return <div className="alert alert-info">Loading site overview...</div>;
  if (siteQuery.isError || !siteQuery.data) {
    return (
      <div className="alert alert-danger">
        Unable to load this site overview.
      </div>
    );
  }

  const site = siteQuery.data;
  const server = serversQuery.data?.find((item) => item.id === site.serverId);
  const handler = findHandler(site.routeConfig) ?? "unknown";
  const managedByManager = !!site.routeId;

  return (
    <div>
      <PageHeader
        eyebrow="Site overview"
        title={site.domain}
        description="Health, ownership, and the active Caddy route configuration."
        actions={
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => navigate("/sites")}
            >
              <i className="bi bi-arrow-left me-1" /> Sites
            </button>
            {managedByManager && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(`/sites/${site.id}/edit`)}
              >
                <i className="bi bi-pencil me-1" /> Edit route
              </button>
            )}
          </div>
        }
      />

      <div className="row g-4">
        <div className="col-12 col-xl-5">
          <div className="card h-100">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-start mb-4">
                <div>
                  <div className="page-eyebrow mb-1">Current state</div>
                  <h4 className="mb-0">Site health</h4>
                </div>
                <StatusBadge status={site.status} />
              </div>
              <dl className="row mb-0">
                <dt className="col-sm-5 text-muted">Status detail</dt>
                <dd className="col-sm-7">
                  {site.statusDetail || "No additional details"}
                </dd>
                <dt className="col-sm-5 text-muted">Last checked</dt>
                <dd className="col-sm-7">
                  <FormattedDateTime
                    value={site.lastCheckedAt}
                    fallback="Not checked"
                  />
                </dd>
                <dt className="col-sm-5 text-muted">Latency</dt>
                <dd className="col-sm-7">
                  {site.healthLatencyMs !== undefined
                    ? `${site.healthLatencyMs} ms`
                    : "Not measured"}
                </dd>
                <dt className="col-sm-5 text-muted">Failures</dt>
                <dd className="col-sm-7">{site.consecutiveFailures}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-7">
          <div className="card h-100">
            <div className="card-body">
              <div className="page-eyebrow mb-1">Ownership</div>
              <h4 className="mb-4">Route details</h4>
              <dl className="row mb-0">
                <dt className="col-sm-4 text-muted">Managed by</dt>
                <dd className="col-sm-8">
                  {managedByManager
                    ? "Caddy Manager"
                    : "Caddyfile / external configuration"}
                </dd>
                <dt className="col-sm-4 text-muted">Handler</dt>
                <dd className="col-sm-8">
                  <code>{handler}</code>
                </dd>
                <dt className="col-sm-4 text-muted">Route ID</dt>
                <dd className="col-sm-8">
                  <code>{site.routeId || "No route ID"}</code>
                </dd>
                <dt className="col-sm-4 text-muted">Server</dt>
                <dd className="col-sm-8">
                  {server
                    ? `${server.name} (${server.hostname})`
                    : site.serverId}
                </dd>
                <dt className="col-sm-4 text-muted">TLS</dt>
                <dd className="col-sm-8">
                  {site.tlsEnabled ? "Enabled" : "Disabled"}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Active route configuration</h5>
            </div>
            <div className="card-body p-0">
              {site.routeConfig ? (
                <JsonViewer data={site.routeConfig} title="Caddy route JSON" />
              ) : (
                <div className="p-4 text-muted">
                  No route configuration is stored for this site.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
