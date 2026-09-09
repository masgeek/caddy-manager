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
  const query = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.getAuditLogs(),
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
