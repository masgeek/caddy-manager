import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AuditEvent } from "@caddy-manager/shared-types";
import { DataTable, PageHeader, formatDateTime } from "@caddy-manager/ui";
import type { Column } from "@caddy-manager/ui";

const auditColumns: Column<AuditEvent>[] = [
  {
    field: "timestamp",
    headerName: "Timestamp",
    render: (value) => formatDateTime(String(value)),
  },
  {
    field: "userId",
    headerName: "User",
    render: (value) => <code>{String(value)}</code>,
  },
  {
    field: "action",
    headerName: "Action",
    render: (value) => (
      <span className={`audit-action ${String(value)}`}>{String(value)}</span>
    ),
  },
  { field: "entity", headerName: "Entity" },
  {
    field: "entityId",
    headerName: "Entity ID",
    render: (value, row) =>
      row.entity === "site" && value ? (
        <a href={`/sites/${String(value)}`}>{String(value)}</a>
      ) : (
        String(value ?? "-")
      ),
  },
  {
    field: "details",
    headerName: "Details",
    render: (value) =>
      value ? (
        <details className="audit-details">
          <summary>View details</summary>
          <div>{String(value)}</div>
        </details>
      ) : (
        <span className="text-muted">-</span>
      ),
  },
  {
    field: "result",
    headerName: "Result",
    render: (value) => (
      <span className={`audit-result ${String(value)}`}>{String(value)}</span>
    ),
  },
];

export default function Audit() {
  const [
    filters,
    setFilters,
  ] = useState({
    action: "",
    entity: "",
    result: "",
  });
  const query = useQuery({
    queryKey: [
      "audit",
      filters,
    ],
    queryFn: () => api.getAuditLogs(filters),
  });

  const rows = query.data || [];
  const failures = rows.filter((row) => row.result === "failure").length;
  const successes = rows.length - failures;

  return (
    <div>
      <PageHeader
        eyebrow="Accountability"
        title="Audit trail"
        description="A quiet record of who changed infrastructure and what happened next."
        signal={
          <>
            <strong>{successes} successful actions</strong>
            <span className="ms-auto">
              {failures ? `${failures} failed` : "No failures recorded"}
            </span>
            <span>Latest 100 events</span>
          </>
        }
      />
      <div className="card p-3 mb-3 d-flex gap-2 flex-wrap">
        <select
          className="form-select"
          style={{ maxWidth: 180 }}
          value={filters.action}
          onChange={(e) => setFilters({ ...filters, action: e.target.value })}
        >
          <option value="">All actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="reload">Reload</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
        </select>
        <select
          className="form-select"
          style={{ maxWidth: 180 }}
          value={filters.entity}
          onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
        >
          <option value="">All entities</option>
          <option value="site">Site</option>
          <option value="server">Server</option>
          <option value="config">Config</option>
          <option value="user">User</option>
        </select>
        <select
          className="form-select"
          style={{ maxWidth: 180 }}
          value={filters.result}
          onChange={(e) => setFilters({ ...filters, result: e.target.value })}
        >
          <option value="">All results</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
      </div>

      {query.isLoading && (
        <div className="alert alert-info" role="status" aria-live="polite">
          Loading audit events...
        </div>
      )}
      {query.isError && (
        <div className="alert alert-danger" role="alert">
          Failed to load audit events:{" "}
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

      {!query.isLoading && !query.isError && (
        <DataTable
          columns={auditColumns}
          rows={rows}
          getRowId={(row) => row.id}
        />
      )}
    </div>
  );
}
