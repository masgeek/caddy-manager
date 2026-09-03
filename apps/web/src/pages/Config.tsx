import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { JsonViewer, PageHeader } from "@caddy-manager/ui";
import { api } from "../api/client";
import OperationModal, {
  type OperationState,
} from "../components/OperationModal";

export default function Config() {
  const queryClient = useQueryClient();
  const [serverId, setServerId] = useState("");
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [view, setView] = useState<"active" | "generated">("active");
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Request failed";

  const serversQuery = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.getServers(),
  });

  const configQuery = useQuery({
    queryKey: ["config", serverId],
    queryFn: () => api.getConfig(serverId),
    enabled: !!serverId,
  });

  const generatedQuery = useQuery({
    queryKey: ["config-generated", serverId],
    queryFn: () => api.getGeneratedConfig(serverId),
    enabled: !!serverId && view === "generated",
  });

  const reloadMutation = useMutation({
    mutationFn: () => api.reloadConfig(serverId),
    onSuccess: () => {
      setOperation({
        title: "Configuration reloaded",
        message: "Caddy accepted the new configuration.",
        status: "success",
      });
      setSnackbar({
        open: true,
        message: "Configuration reloaded successfully",
        severity: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["config", serverId] });
    },
    onError: (error) => {
      setOperation({
        title: "Configuration reload failed",
        message: errorMessage(error),
        status: "error",
      });
      setSnackbar({
        open: true,
        message: errorMessage(error),
        severity: "error",
      });
    },
  });

  const servers = serversQuery.data || [];
  const displayedConfig =
    view === "active" ? configQuery.data : generatedQuery.data;
  const displayedQuery = view === "active" ? configQuery : generatedQuery;

  return (
    <div>
      <PageHeader
        eyebrow="Caddy state"
        title="Configuration"
        description="Inspect the active document, compare it with the manager-generated view, and reload deliberately."
        signal={
          <>
            <strong>
              {serverId
                ? view === "active"
                  ? "Active document"
                  : "Generated preview"
                : "Select a server to begin"}
            </strong>
            <span className="ms-auto">JSON / Admin API</span>
          </>
        }
      />

      <div className="d-flex gap-2 mb-3 align-items-center flex-wrap">
        <select
          className="form-select"
          style={{ maxWidth: 250 }}
          value={serverId}
          onChange={(e) => setServerId(e.target.value)}
        >
          <option value="">Select a server...</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="btn-group" role="group" aria-label="Configuration view">
          <button
            type="button"
            className={`btn ${view === "active" ? "btn-dark" : "btn-outline-secondary"}`}
            onClick={() => setView("active")}
            disabled={!serverId}
          >
            Active
          </button>
          <button
            type="button"
            className={`btn ${view === "generated" ? "btn-dark" : "btn-outline-secondary"}`}
            onClick={() => setView("generated")}
            disabled={!serverId}
          >
            Generated
          </button>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setOperation({
              title: "Reloading configuration",
              message: "Applying the generated configuration to Caddy.",
              status: "running",
            });
            reloadMutation.mutate();
          }}
          disabled={!serverId || reloadMutation.isPending}
        >
          <i className="bi bi-arrow-clockwise me-1"></i>
          Reload Config
        </button>
      </div>

      {displayedQuery.isLoading && (
        <div className="alert alert-info" role="status" aria-live="polite">
          Loading {view} configuration...
        </div>
      )}

      {displayedQuery.isError && (
        <div className="alert alert-danger" role="alert">
          Failed to load configuration: {errorMessage(displayedQuery.error)}
          <button
            className="btn btn-sm btn-outline-danger ms-2"
            onClick={() => displayedQuery.refetch()}
          >
            Retry
          </button>
        </div>
      )}

      {displayedConfig && !displayedQuery.isLoading && (
        <JsonViewer
          data={displayedConfig}
          title={
            view === "active"
              ? "Active Configuration"
              : "Generated Configuration"
          }
        />
      )}

      {snackbar.open && (
        <div
          className="position-fixed bottom-0 end-0 p-3"
          style={{ zIndex: 9999 }}
        >
          <div
            className={`alert alert-${snackbar.severity === "error" ? "danger" : "success"} alert-dismissible fade show mb-0`}
          >
            {snackbar.message}
            <button
              type="button"
              className="btn-close"
              onClick={() => setSnackbar({ ...snackbar, open: false })}
            />
          </div>
        </div>
      )}
      <OperationModal
        operation={operation}
        onClose={() => setOperation(null)}
      />
    </div>
  );
}
