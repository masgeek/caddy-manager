import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  DataTable,
  StatusBadge,
  ConfirmDialog,
  PageHeader,
  Modal,
} from "@caddy-manager/ui";
import type { Column } from "@caddy-manager/ui";
import type { Server } from "@caddy-manager/shared-types";
import type { ImportPreviewSite } from "@caddy-manager/shared-api";
import { api } from "../api/client";
import OperationToast, {
  type OperationState,
} from "../components/OperationToast";

const serverSchema = z.object({
  name: z.string().min(1, "Name is required"),
  hostname: z.string().min(1, "Hostname is required"),
  apiEndpoint: z.string().url("Must be a valid URL"),
});

type ServerForm = z.infer<typeof serverSchema>;

const DEFAULT_CADDY_ENDPOINT = "http://localhost:2019";

const columns: Column<Server>[] = [
  { field: "name", headerName: "Name" },
  { field: "hostname", headerName: "Hostname" },
  { field: "apiEndpoint", headerName: "API Endpoint" },
  {
    field: "status",
    headerName: "Status",
    render: (value) => <StatusBadge status={String(value)} />,
  },
  { field: "version", headerName: "Version" },
];

export default function Servers() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverUrl, setDiscoverUrl] = useState(DEFAULT_CADDY_ENDPOINT);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editServer, setEditServer] = useState<Server | null>(null);
  const [importPreview, setImportPreview] = useState<{
    server: Server;
    sites: ImportPreviewSite[];
  } | null>(null);
  const [operation, setOperation] = useState<OperationState | null>(null);

  useEffect(() => {
    const modalOpen =
      dialogOpen || discoverOpen || !!importPreview || !!deleteId;
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [dialogOpen, discoverOpen, importPreview, deleteId]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ServerForm>({
    resolver: zodResolver(serverSchema),
  });

  const query = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.getServers(),
  });

  useEffect(() => {
    if (editServer) {
      reset({
        name: editServer.name,
        hostname: editServer.hostname,
        apiEndpoint: editServer.apiEndpoint,
      });
    } else {
      reset({ name: "", hostname: "", apiEndpoint: "" });
    }
  }, [editServer, reset]);

  const createMutation = useMutation({
    mutationFn: (data: ServerForm) =>
      api.createServer(serverSchema.parse(data)),
    onSuccess: () => {
      setOperation({
        title: "Server created",
        message: "The Caddy server was registered.",
        status: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      setDialogOpen(false);
      reset();
    },
    onError: (error) =>
      setOperation({
        title: "Server creation failed",
        message:
          error instanceof Error ? error.message : "Failed to create server",
        status: "error",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: ServerForm) =>
      api.updateServer(editServer!.id, serverSchema.parse(data)),
    onSuccess: () => {
      setOperation({
        title: "Server updated",
        message: "The Caddy server was updated.",
        status: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      setDialogOpen(false);
      setEditServer(null);
      reset();
    },
    onError: (error) =>
      setOperation({
        title: "Server update failed",
        message:
          error instanceof Error ? error.message : "Failed to update server",
        status: "error",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteServer(id),
    onSuccess: () => {
      setOperation({
        title: "Server deleted",
        message: "The Caddy server was deleted.",
        status: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      setDeleteId(null);
    },
    onError: (error) =>
      setOperation({
        title: "Server deletion failed",
        message:
          error instanceof Error ? error.message : "Failed to delete server",
        status: "error",
      }),
  });

  const healthMutation = useMutation({
    mutationFn: (id: string) => api.checkServerHealth(id),
    onSuccess: () => {
      setOperation({
        title: "Health check complete",
        message: "The server health check completed.",
        status: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (error) =>
      setOperation({
        title: "Health check failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to check server health",
        status: "error",
      }),
  });

  const importMutation = useMutation({
    mutationFn: (id: string) => api.importServerSites(id),
    onSuccess: (data) => {
      setOperation({
        title: "Sites imported",
        message: `${data.imported} site(s) imported, ${data.skipped} skipped.`,
        status: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      setSnackbar(`${data.imported} site(s) imported, ${data.skipped} skipped`);
      setImportPreview(null);
    },
    onError: () => {
      setOperation({
        title: "Import failed",
        message: "Failed to import sites.",
        status: "error",
      });
      setSnackbar("Failed to import sites");
    },
  });

  const previewImportMutation = useMutation({
    mutationFn: (server: Server) => api.previewServerSites(server.id),
    onSuccess: (sites, server) => {
      setImportPreview({ server, sites });
      setOperation({
        title: "Configuration loaded",
        message: "The server configuration is ready to review.",
        status: "success",
      });
    },
    onError: (error: Error) => {
      setSnackbar(`Import preview failed: ${error.message}`);
      setOperation({
        title: "Configuration read failed",
        message: error.message,
        status: "error",
      });
    },
  });

  const discoverMutation = useMutation({
    mutationFn: (url: string) => api.discoverServers(url),
    onSuccess: (data) => {
      setOperation({
        title: "Discovery complete",
        message: `Discovered ${data.servers.length} server(s) and ${data.sites.length} site(s).`,
        status: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      setDiscoverOpen(false);
      setDiscoverUrl(DEFAULT_CADDY_ENDPOINT);
      setSnackbar(
        `Mapped ${data.sites.length} site(s) across ${data.servers.length} server(s): ${data.imported} imported, ${data.skipped} skipped`,
      );
    },
    onError: (err: Error) => {
      setOperation({
        title: "Discovery failed",
        message: err.message,
        status: "error",
      });
      setSnackbar(`Discovery failed: ${err.message}`);
    },
  });

  const [snackbar, setSnackbar] = useState<string | null>(null);

  const rows = query.data || [];
  const onlineCount = rows.filter(
    (server) => server.status === "online",
  ).length;
  const attentionCount = rows.filter(
    (server) => server.status !== "online",
  ).length;

  const actionColumn: Column<Server> = {
    field: "actions",
    headerName: "Actions",
    render: (_, row) => (
      <div className="d-flex gap-1">
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={() => {
            setOperation({
              title: "Checking server health",
              message: "Connecting to the Caddy admin API.",
              status: "running",
            });
            healthMutation.mutate(row.id);
          }}
          title="Check health"
        >
          <i className="bi bi-arrow-clockwise"></i>
        </button>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={() => {
            setEditServer(row);
            setDialogOpen(true);
          }}
          title="Edit"
        >
          <i className="bi bi-pencil"></i>
        </button>
        <button
          className="btn btn-sm btn-outline-success"
          onClick={() => {
            setOperation({
              title: "Reading server configuration",
              message: "Loading sites from the Caddy configuration.",
              status: "running",
            });
            previewImportMutation.mutate(row);
          }}
          title="Import sites from config"
        >
          <i className="bi bi-download"></i>
        </button>
        <button
          className="btn btn-sm btn-outline-danger"
          onClick={() => setDeleteId(row.id)}
          title="Delete"
        >
          <i className="bi bi-trash"></i>
        </button>
      </div>
    ),
  };

  return (
    <div>
      <PageHeader
        eyebrow="Fleet control"
        title="Servers"
        description="Your registered Caddy endpoints and the signal coming back from each one."
        actions={
          <button
            className="btn btn-primary"
            onClick={() => setDialogOpen(true)}
          >
            <i className="bi bi-plus-lg me-1"></i> Add server
          </button>
        }
        signal={
          <>
            <strong>
              {onlineCount} of {rows.length} online
            </strong>
            <span className="ms-auto">{attentionCount} need attention</span>
            <span>Auto-refresh 30s</span>
          </>
        }
      />

      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="page-eyebrow mb-0">Registered endpoints</div>
        <div className="d-flex gap-2">
          <button
            className="btn btn-outline-info"
            onClick={() => setDiscoverOpen(true)}
          >
            <i className="bi bi-search me-1"></i> Discover
          </button>
        </div>
      </div>

      {query.isLoading && (
        <div className="alert alert-info" role="status" aria-live="polite">
          Loading Caddy servers...
        </div>
      )}
      {query.isError && (
        <div className="alert alert-danger" role="alert">
          Failed to load servers:{" "}
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
          columns={[...columns, actionColumn]}
          rows={rows}
          getRowId={(r) => r.id}
        />
      )}

      {/* Add / Edit Server Modal */}
      {dialogOpen && (
        <Modal
          open
          title={editServer ? "Edit Server" : "Add Server"}
          size="lg"
          onClose={() => {
            setDialogOpen(false);
            setEditServer(null);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setDialogOpen(false);
                  setEditServer(null);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="server-form"
                className="btn btn-primary"
              >
                {editServer ? "Update" : "Create"}
              </button>
            </>
          }
        >
          <form
            id="server-form"
            onSubmit={handleSubmit((data) =>
              editServer
                ? (setOperation({
                    title: "Updating server",
                    message: "Saving the Caddy server configuration.",
                    status: "running",
                  }),
                  updateMutation.mutate(data))
                : (setOperation({
                    title: "Registering server",
                    message: "Saving the Caddy server configuration.",
                    status: "running",
                  }),
                  createMutation.mutate(data)),
            )}
          >
            <div className="mb-3">
              <label className="form-label">Name</label>
              <input
                {...register("name")}
                className={`form-control ${errors.name ? "is-invalid" : ""}`}
              />
              {errors.name && (
                <div className="invalid-feedback">{errors.name.message}</div>
              )}
            </div>
            <div className="mb-3">
              <label className="form-label">Hostname</label>
              <input
                {...register("hostname")}
                className={`form-control ${errors.hostname ? "is-invalid" : ""}`}
              />
              {errors.hostname && (
                <div className="invalid-feedback">
                  {errors.hostname.message}
                </div>
              )}
            </div>
            <div className="mb-3">
              <label className="form-label">API Endpoint</label>
              <input
                {...register("apiEndpoint")}
                className={`form-control ${errors.apiEndpoint ? "is-invalid" : ""}`}
                placeholder="http://localhost:2019"
              />
              {errors.apiEndpoint && (
                <div className="invalid-feedback">
                  {errors.apiEndpoint.message}
                </div>
              )}
            </div>
          </form>
        </Modal>
      )}

      {/* Discover Modal */}
      {discoverOpen && (
        <Modal
          open
          title="Discover & Import"
          onClose={() => {
            setDiscoverOpen(false);
            setDiscoverUrl(DEFAULT_CADDY_ENDPOINT);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setDiscoverOpen(false);
                  setDiscoverUrl(DEFAULT_CADDY_ENDPOINT);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-info"
                disabled={!discoverUrl || discoverMutation.isPending}
                onClick={() => {
                  setOperation({
                    title: "Discovering servers",
                    message:
                      "Scanning the Caddy admin API and importing available sites.",
                    status: "running",
                  });
                  discoverMutation.mutate(discoverUrl);
                }}
              >
                {discoverMutation.isPending
                  ? "Discovering..."
                  : "Discover & Import"}
              </button>
            </>
          }
        >
          <p className="text-muted small">
            Enter the Caddy admin API endpoint to auto-discover servers and
            import sites from the config.
          </p>
          <div className="mb-3">
            <label className="form-label">API Endpoint</label>
            <input
              className="form-control"
              placeholder="http://localhost:2019"
              value={discoverUrl}
              onChange={(e) => setDiscoverUrl(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {/* Import Preview Modal */}
      {importPreview && (
        <Modal
          open
          title={`Import Sites from ${importPreview.server.name}`}
          size="lg"
          onClose={() => setImportPreview(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setImportPreview(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-success"
                disabled={
                  importPreview.sites.length === 0 || importMutation.isPending
                }
                onClick={() => {
                  setOperation({
                    title: "Importing sites",
                    message:
                      "Importing sites from the selected Caddy configuration.",
                    status: "running",
                  });
                  importMutation.mutate(importPreview.server.id);
                }}
              >
                {importMutation.isPending ? "Importing..." : "Import Sites"}
              </button>
            </>
          }
        >
          {importPreview.sites.length === 0 ? (
            <p className="text-muted mb-0">
              No reverse-proxy sites were found in the active Caddy
              configuration.
            </p>
          ) : (
            <DataTable
              columns={[
                { field: "domain", headerName: "Domain" },
                { field: "upstream", headerName: "Upstream" },
                { field: "caddyServerName", headerName: "Server Block" },
                {
                  field: "alreadyImported",
                  headerName: "Status",
                  render: (value) => (value ? "Already imported" : "New"),
                },
              ]}
              rows={importPreview.sites}
              getRowId={(site) => `${site.caddyServerName}:${site.domain}`}
            />
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Server"
        message="Are you sure you want to delete this server?"
        onConfirm={() => {
          if (!deleteId) return;
          setOperation({
            title: "Deleting server",
            message: "Removing the registered Caddy server.",
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

      {snackbar && (
        <div
          className="position-fixed bottom-0 end-0 p-3"
          style={{ zIndex: 9999 }}
        >
          <div className="alert alert-success alert-dismissible fade show mb-0">
            {snackbar}
            <button
              type="button"
              className="btn-close"
              onClick={() => setSnackbar(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
