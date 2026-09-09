import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { DataTable, PageHeader, formatDateTime } from "@caddy-manager/ui";
import type { Column } from "@caddy-manager/ui";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source?: string;
}

const logColumns: Column<LogEntry>[] = [
  {
    field: "timestamp",
    headerName: "Timestamp",
    render: (value) => formatDateTime(String(value)),
  },
  {
    field: "level",
    headerName: "Level",
    render: (value) => (
      <span className={levelClass(String(value))}>{String(value)}</span>
    ),
  },
  {
    field: "source",
    headerName: "Source",
    render: (value) => (value ? String(value) : "-"),
  },
  {
    field: "message",
    headerName: "Message",
    render: (value) => <code className="log-message">{String(value)}</code>,
  },
];

function levelClass(level: string): string {
  const normalized = level.toLowerCase();
  if (normalized.includes("error") || normalized.includes("fatal"))
    return "log-level log-level-error";
  if (normalized.includes("warn")) return "log-level log-level-warn";
  return "log-level log-level-info";
}

export default function Logs() {
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["logs", search],
    queryFn: async () => {
      const result = await api.getLogs({
        search: search || undefined,
        limit: 100,
      });
      return result as unknown as LogEntry[];
    },
    refetchInterval: 5000,
  });

  const rows = query.data || [];

  return (
    <div>
      <PageHeader
        eyebrow="Runtime signal"
        title="Logs"
        description="A live window into recent Caddy and manager activity."
        actions={
          <span className="live-indicator" role="status" aria-live="polite">
            <span></span>
            {query.isFetching ? "Refreshing" : "Live · 5s"}
          </span>
        }
        signal={
          <>
            <strong>{rows.length} recent entries</strong>
            <span className="ms-auto">Search the current buffer</span>
          </>
        }
      />

      <div className="d-flex gap-2 align-items-center mb-3">
        <div className="input-group" style={{ maxWidth: 440 }}>
          <span className="input-group-text bg-white border-end-0">
            <i className="bi bi-search text-muted"></i>
          </span>
          <input
            className="form-control border-start-0"
            placeholder="Search message, level, or source"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <button
            className="btn btn-sm btn-link text-decoration-none"
            onClick={() => setSearch("")}
          >
            Clear
          </button>
        )}
      </div>

      {query.isLoading && (
        <div className="alert alert-info" role="status" aria-live="polite">
          Loading runtime logs...
        </div>
      )}
      {query.isError && (
        <div className="alert alert-danger" role="alert">
          Failed to load logs:{" "}
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
          columns={logColumns}
          rows={rows}
          getRowId={(row) => `${row.timestamp}-${row.message}`}
        />
      )}
    </div>
  );
}
