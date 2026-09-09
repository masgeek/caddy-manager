import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import CreatableSelect from "react-select/creatable";
import { z } from "zod";
import { api } from "../api/client";
import OperationModal, {
  type OperationState,
} from "../components/OperationModal";

const siteSchema = z
  .object({
    serverId: z.string().min(1, "Server is required"),
    siteDomain: z.string().optional(),
    name: z.string().optional(),
    baseDomain: z.string().min(1, "Domain is required"),
    routeMode: z.enum([
      "reverse_proxy",
      "redirect",
      "static_response",
      "file_server",
      "rewrite",
      "custom",
    ]),
    upstream: z.string().optional(),
    routeConfigJson: z.string().optional(),
    redirectTarget: z.string().optional(),
    responseBody: z.string().optional(),
    responseStatus: z.string().optional(),
    responseHeaders: z.array(z.object({ name: z.string(), value: z.string() })),
    fileRoot: z.string().optional(),
    rewriteUri: z.string().optional(),
    routeId: z.string().optional(),
    caddyServerName: z.string().optional(),
    tlsEnabled: z.boolean(),
    healthEndpoint: z.string().optional(),
    healthHeaders: z.string().optional(),
  })
  .superRefine((data, context) => {
    const routeValue =
      data.routeMode === "reverse_proxy"
        ? data.upstream
        : data.routeMode === "custom"
          ? data.routeConfigJson
          : data.routeMode === "redirect"
            ? data.redirectTarget
            : data.routeMode === "file_server"
              ? data.fileRoot
              : data.routeMode === "rewrite"
                ? data.rewriteUri
                : data.responseBody;
    if (!routeValue?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["upstream"],
        message: "Complete the route details below",
      });
    }
  });

type SiteForm = z.infer<typeof siteSchema>;

function routeEditorValues(
  routeConfig: Record<string, unknown> | undefined,
): Partial<SiteForm> {
  if (!routeConfig) return {};
  const handle = (
    routeConfig.handle as Array<Record<string, unknown>> | undefined
  )?.[0];
  if (!handle) return { routeMode: "custom" };
  const handler = handle?.handler;
  const headers = handle?.headers as Record<string, string[]> | undefined;
  const responseHeaders = Object.entries(headers ?? {}).flatMap(
    ([name, values]) => values.map((value) => ({ name, value })),
  );

  if (handler === "reverse_proxy") {
    const upstreams = handle?.upstreams as
      Array<Record<string, unknown>> | undefined;
    const dial = upstreams?.[0]?.dial;
    return {
      routeMode: "reverse_proxy",
      upstream: typeof dial === "string" ? `http://${dial}` : "",
    };
  }
  if (handler === "static_response") {
    const location = headers?.Location?.[0];
    if (location) {
      return {
        routeMode: "redirect",
        redirectTarget: location,
        responseStatus: String(handle.status_code ?? 301),
        responseHeaders,
      };
    }
    return {
      routeMode: "static_response",
      responseBody: typeof handle.body === "string" ? handle.body : "",
      responseStatus: String(handle.status_code ?? 200),
      responseHeaders,
    };
  }
  if (handler === "file_server") {
    return {
      routeMode: "file_server",
      fileRoot: typeof handle.root === "string" ? handle.root : "",
    };
  }
  if (handler === "rewrite") {
    return {
      routeMode: "rewrite",
      rewriteUri: typeof handle.uri === "string" ? handle.uri : "",
    };
  }
  return { routeMode: "custom" };
}

function routeHosts(
  routeConfig: Record<string, unknown> | undefined,
): string[] {
  const match = (
    routeConfig?.match as Array<Record<string, unknown>> | undefined
  )?.[0];
  return Array.isArray(match?.host)
    ? match.host.filter((host): host is string => typeof host === "string")
    : [];
}

function HostnameTags({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const tags = value
    .split(/[\r\n,]+/)
    .map((host) => host.trim())
    .filter(Boolean);

  return (
    <CreatableSelect
      isMulti
      options={tags.map((host) => ({ value: host, label: host }))}
      value={tags.map((host) => ({ value: host, label: host }))}
      onChange={(selected) =>
        onChange(selected.map((option) => option.value).join("\n"))
      }
      placeholder="Add hostname..."
      aria-label="Add route hostname"
      formatCreateLabel={(input) => `Add ${input}`}
      isClearable
      classNamePrefix="hostname-select"
      closeMenuOnSelect={false}
      noOptionsMessage={() => "Type a hostname and press Enter"}
      styles={{ menu: (base) => ({ ...base, zIndex: 20 }) }}
    />
  );
}

interface SiteEditorProps {
  modal?: boolean;
  siteId?: string;
  onClose?: () => void;
}

function splitDomain(domain: string): { name: string; baseDomain: string } {
  const dot = domain.indexOf(".");
  if (dot <= 0) return { name: "", baseDomain: domain };
  return { name: domain.slice(0, dot), baseDomain: domain.slice(dot + 1) };
}

function routeNames(hosts: string[], baseDomain: string): string[] {
  const suffix = `.${baseDomain}`;
  return hosts.map((host) =>
    host.endsWith(suffix) ? host.slice(0, -suffix.length) : host,
  );
}

function sampleRoute(
  mode: SiteForm["routeMode"],
): Record<string, unknown> | string {
  if (mode === "custom")
    return "Paste a complete Caddy route when the visual actions do not cover your use case.";
  const base = {
    "@id": "my-route",
    match: [{ host: ["example.com"] }],
    handle: [] as Record<string, unknown>[],
    terminal: true,
  };
  if (mode === "reverse_proxy")
    base.handle = [
      { handler: "reverse_proxy", upstreams: [{ dial: "127.0.0.1:8080" }] },
    ];
  if (mode === "redirect")
    base.handle = [
      {
        handler: "static_response",
        headers: { Location: ["https://example.com{http.request.uri}"] },
        status_code: 301,
      },
    ];
  if (mode === "static_response")
    base.handle = [
      {
        handler: "static_response",
        body: "Hello from Caddy",
        status_code: 200,
      },
    ];
  if (mode === "file_server")
    base.handle = [{ handler: "file_server", root: "/var/www/html" }];
  if (mode === "rewrite")
    base.handle = [{ handler: "rewrite", uri: "/index.html" }];
  return base;
}

export function previewRoute(
  data: SiteForm,
): Record<string, unknown> | undefined {
  const domains = formDomains(data);
  if (domains.length === 0) return undefined;

  if (data.routeMode === "custom" && data.routeConfigJson?.trim()) {
    const route = JSON.parse(data.routeConfigJson) as Record<string, unknown>;
    const matches = route.match as Array<Record<string, unknown>> | undefined;
    const withHost = matches?.length
      ? {
          ...route,
          match: matches.map((match, index) =>
            index === 0 ? { ...match, host: domains } : match,
          ),
        }
      : route;
    if (data.routeId) withHost["@id"] = data.routeId;
    return withHost;
  }

  const route = {
    "@id": data.routeId || domains[0].replace(/[^a-zA-Z0-9_-]/g, "_"),
    match: [{ host: domains }],
    handle: [] as Record<string, unknown>[],
    terminal: true,
  };

  if (data.routeMode === "reverse_proxy" && data.upstream) {
    route.handle = [
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: data.upstream.replace(/^https?:\/\//, "") }],
      },
    ];
  } else if (data.routeMode === "redirect" && data.redirectTarget) {
    const headers = data.responseHeaders.reduce<Record<string, string[]>>(
      (result, header) => {
        if (
          header.name.trim() &&
          (header.value.trim() || header.name.toLowerCase() === "location")
        ) {
          result[header.name.trim()] = [
            header.value.trim() || data.redirectTarget!,
          ];
        }
        return result;
      },
      {},
    );
    if (!headers.Location) headers.Location = [data.redirectTarget];
    route.handle = [
      {
        handler: "static_response",
        headers,
        status_code: Number(data.responseStatus) || 301,
      },
    ];
  } else if (data.routeMode === "static_response") {
    const headers = data.responseHeaders.reduce<Record<string, string[]>>(
      (result, header) => {
        if (header.name.trim() && header.value.trim())
          result[header.name.trim()] = [header.value.trim()];
        return result;
      },
      {},
    );
    route.handle = [
      {
        handler: "static_response",
        body: data.responseBody || "",
        headers,
        status_code: Number(data.responseStatus) || 200,
      },
    ];
  } else if (data.routeMode === "file_server" && data.fileRoot) {
    route.handle = [{ handler: "file_server", root: data.fileRoot }];
  } else if (data.routeMode === "rewrite" && data.rewriteUri) {
    route.handle = [{ handler: "rewrite", uri: data.rewriteUri }];
  } else {
    return undefined;
  }
  return route;
}

function formDomains(data: SiteForm): string[] {
  const names = (data.name ?? "")
    .split(/[\r\n,]+/)
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0
    ? names.map((name) =>
        data.baseDomain ? `${name}.${data.baseDomain}` : name,
      )
    : data.baseDomain
      ? [data.baseDomain]
      : [];
}

export default function SiteEditor({
  modal = false,
  siteId,
  onClose,
}: SiteEditorProps) {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = siteId ?? routeId;
  const isEdit = !!id;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [reviewData, setReviewData] = useState<SiteForm | null>(null);
  const [operation, setOperation] = useState<OperationState | null>(null);

  useEffect(() => {
    if (!modal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modal, onClose]);

  const serversQuery = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.getServers(),
  });

  const siteQuery = useQuery({
    queryKey: ["site", id],
    queryFn: () => api.getSite(id!),
    enabled: isEdit,
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    watch,
    formState: { errors, isDirty },
  } = useForm<SiteForm>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      serverId: isEdit ? "" : (searchParams.get("serverId") ?? ""),
      siteDomain: "",
      name: "",
      baseDomain: "",
      routeMode: "reverse_proxy",
      caddyServerName: "",
      tlsEnabled: true,
      healthEndpoint: "",
      healthHeaders: "",
      redirectTarget: "",
      responseBody: "",
      responseStatus: "200",
      responseHeaders: [],
      fileRoot: "",
      rewriteUri: "",
    },
  });

  const selectedServerId = watch("serverId");
  const watchedForm = watch();
  let routePreview: Record<string, unknown> | undefined;
  try {
    routePreview = previewRoute(watchedForm);
  } catch {
    routePreview = undefined;
  }
  const routeSamplePreview = sampleRoute(watchedForm.routeMode);
  const blocksQuery = useQuery({
    queryKey: ["server-blocks", selectedServerId],
    queryFn: () => api.getServerBlocks(selectedServerId),
    enabled: !!selectedServerId,
  });

  useEffect(() => {
    if (siteQuery.data) {
      const { name, baseDomain } = splitDomain(siteQuery.data.domain);
      reset({
        serverId: siteQuery.data.serverId,
        siteDomain: siteQuery.data.domain,
        name:
          routeNames(routeHosts(siteQuery.data.routeConfig), baseDomain).join(
            "\n",
          ) || name,
        baseDomain,
        upstream: siteQuery.data.upstream ?? "",
        ...routeEditorValues(siteQuery.data.routeConfig),
        routeConfigJson: siteQuery.data.routeConfig
          ? JSON.stringify(siteQuery.data.routeConfig, null, 2)
          : "",
        routeId: siteQuery.data.routeId ?? "",
        caddyServerName: siteQuery.data.caddyServerName ?? "",
        tlsEnabled: siteQuery.data.tlsEnabled,
        healthEndpoint: siteQuery.data.healthEndpoint ?? "",
        healthHeaders: siteQuery.data.healthHeaders ?? "",
        responseStatus: "301",
        responseHeaders: [],
      });
    }
  }, [siteQuery.data, reset]);
  const responseHeaders = useFieldArray({ control, name: "responseHeaders" });
  const servers = serversQuery.data || [];

  const handleClose = useCallback(() => {
    if (isDirty && !window.confirm("Discard unsaved site changes?")) return;
    onClose ? onClose() : navigate("/sites");
  }, [isDirty, navigate, onClose]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const onServerChange = useCallback(
    (serverId: string) => {
      const server = servers.find((s) => s.id === serverId);
      if (server) {
        setValue("baseDomain", server.hostname);
      }
    },
    [servers, setValue],
  );

  const toApiPayload = useCallback(
    (data: SiteForm) => ({
      serverId: data.serverId,
      domain: data.siteDomain || formDomains(data)[0] || data.baseDomain,
      upstream:
        data.routeMode === "reverse_proxy"
          ? data.upstream || undefined
          : undefined,
      routeId: data.routeId || undefined,
      caddyServerName: data.caddyServerName || undefined,
      tlsEnabled: data.tlsEnabled,
      healthEndpoint: data.healthEndpoint || undefined,
      healthHeaders: data.healthHeaders || undefined,
      routeConfig: previewRoute(data),
    }),
    [],
  );

  const createMutation = useMutation({
    mutationFn: (data: SiteForm) =>
      api.createSiteInventory({
        ...toApiPayload(data),
        state: "draft",
        managementType: "dynamic",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["site-inventory"] });
      onClose ? onClose() : navigate("/sites");
    },
    onError: (error) =>
      setOperation({
        title: "Site creation failed",
        message:
          error instanceof Error ? error.message : "Failed to create site",
        status: "error",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: SiteForm) => api.updateSite(id!, toApiPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      onClose ? onClose() : navigate("/sites");
    },
    onError: (error) =>
      setOperation({
        title: "Site update failed",
        message:
          error instanceof Error ? error.message : "Failed to update site",
        status: "error",
      }),
  });

  const mutationError = createMutation.error ?? updateMutation.error;

  const editor = (
    <div className={modal ? "site-editor-modal-body" : undefined}>
      {mutationError && (
        <div className="alert alert-danger" role="alert">
          {mutationError instanceof Error
            ? mutationError.message
            : "Failed to save site changes"}
        </div>
      )}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">{isEdit ? "Edit Site" : "New Site"}</h4>
        {modal && (
          <button
            ref={closeButtonRef}
            type="button"
            className="btn-close"
            aria-label="Close"
            onClick={handleClose}
          />
        )}
      </div>
      <div className="site-editor-grid">
        <div className="card p-4 site-editor-form">
          <form onSubmit={handleSubmit((data) => setReviewData(data))}>
            <div className="mb-3">
              <label className="form-label">Server</label>
              <select
                {...register("serverId", {
                  onChange: (e) => onServerChange(e.target.value),
                })}
                className={`form-select ${errors.serverId ? "is-invalid" : ""}`}
              >
                <option value="">Select a server...</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.hostname})
                  </option>
                ))}
              </select>
              {errors.serverId && (
                <div className="invalid-feedback">
                  {errors.serverId.message}
                </div>
              )}
            </div>

            <details className="editor-details mb-3">
              <summary>Placement in Caddy</summary>
              <div className="pt-3">
                <label className="form-label">Caddy HTTP Server Block</label>
                <select
                  {...register("caddyServerName")}
                  className={`form-select ${errors.caddyServerName ? "is-invalid" : ""}`}
                  disabled={!selectedServerId || blocksQuery.isLoading}
                >
                  <option value="">
                    {blocksQuery.isLoading
                      ? "Loading server blocks..."
                      : "Select a server block..."}
                  </option>
                  {(blocksQuery.data || []).map((block) => (
                    <option key={block} value={block}>
                      {block}
                    </option>
                  ))}
                </select>
                <div className="form-text">
                  Optional. Routes use the first available block when none is
                  selected.
                </div>
                {errors.caddyServerName && (
                  <div className="invalid-feedback">
                    {errors.caddyServerName.message}
                  </div>
                )}
              </div>
            </details>
            <div className="row">
              <div className="col-md mb-3">
                <label className="form-label">Domain</label>
                <input
                  {...register("baseDomain")}
                  className={`form-control ${errors.baseDomain ? "is-invalid" : ""}`}
                  placeholder="munywele.co.ke"
                  readOnly={true}
                />
                {errors.baseDomain && (
                  <div className="invalid-feedback">
                    {errors.baseDomain.message}
                  </div>
                )}
              </div>
            </div>

            <div className="row">
              <div className="col-md mb-3">
                <label className="form-label" htmlFor="site-names">
                  Hostnames
                </label>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <HostnameTags
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
                  )}
                />
                {errors.name && (
                  <div className="invalid-feedback">{errors.name.message}</div>
                )}
                <div className="form-text">
                  Press Enter or comma after each hostname. Prefixes such as
                  <code>api</code> use the domain below; full hostnames are also
                  supported.
                </div>
              </div>
            </div>

            <div className="card mb-3 border-primary-subtle">
              <div className="card-header">
                <h6 className="mb-1">What should this domain do?</h6>
                <div className="small text-muted">
                  Choose an action and fill in the simple fields. Caddy JSON is
                  generated for you.
                </div>
              </div>
              <div className="card-body">
                <label className="form-label" htmlFor="route-mode">
                  Route action
                </label>
                <select
                  {...register("routeMode", {
                    onChange: (event) =>
                      setValue(
                        "responseStatus",
                        event.target.value === "redirect" ? "301" : "200",
                      ),
                  })}
                  id="route-mode"
                  className="form-select mb-3"
                >
                  <option value="reverse_proxy">
                    Send visitors to an application
                  </option>
                  <option value="redirect">
                    Redirect visitors to another address
                  </option>
                  <option value="static_response">Show a fixed response</option>
                  <option value="file_server">Serve files from a folder</option>
                  <option value="rewrite">Rewrite the request address</option>
                  <option value="custom">Advanced: paste Caddy JSON</option>
                </select>
                <details className="editor-details mb-3">
                  <summary>See an example of the generated Caddy JSON</summary>
                  <pre className="route-sample mt-3">
                    {typeof routeSamplePreview === "string"
                      ? routeSamplePreview
                      : JSON.stringify(routeSamplePreview, null, 2)}
                  </pre>
                </details>

                {watchedForm.routeMode === "reverse_proxy" && (
                  <>
                    <label className="form-label">Application address</label>
                    <input
                      {...register("upstream")}
                      className={`form-control ${errors.upstream ? "is-invalid" : ""}`}
                      placeholder="http://localhost:8080"
                    />
                    {errors.upstream && (
                      <div className="invalid-feedback">
                        {errors.upstream.message}
                      </div>
                    )}
                  </>
                )}

                {watchedForm.routeMode === "redirect" && (
                  <>
                    <label className="form-label">Send visitors to</label>
                    <input
                      {...register("redirectTarget")}
                      className="form-control mb-3"
                      placeholder="https://example.com{http.request.uri}"
                    />
                    <label className="form-label">Redirect status</label>
                    <select
                      {...register("responseStatus")}
                      className="form-select"
                    >
                      <option value="301">301 - Permanent redirect</option>
                      <option value="302">302 - Temporary redirect</option>
                      <option value="307">
                        307 - Temporary redirect (preserve method)
                      </option>
                      <option value="308">
                        308 - Permanent redirect (preserve method)
                      </option>
                    </select>
                    <div className="d-flex justify-content-between align-items-center mt-3 mb-2">
                      <label className="form-label mb-0">
                        Response headers
                      </label>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() =>
                          responseHeaders.append({ name: "", value: "" })
                        }
                      >
                        Add header
                      </button>
                    </div>
                    {responseHeaders.fields.map((field, index) => (
                      <div className="row g-2 mb-2" key={field.id}>
                        <div className="col-5">
                          <input
                            {...register(`responseHeaders.${index}.name`)}
                            className="form-control"
                            placeholder="Location"
                          />
                        </div>
                        <div className="col">
                          <input
                            {...register(`responseHeaders.${index}.value`)}
                            className="form-control"
                            placeholder="https://example.com{http.request.uri}"
                          />
                        </div>
                        <div className="col-auto">
                          <button
                            type="button"
                            className="btn btn-outline-danger"
                            aria-label="Remove header"
                            onClick={() => responseHeaders.remove(index)}
                          >
                            <i className="bi bi-x-lg" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="form-text">
                      The Location header tells the browser where to go.
                    </div>
                  </>
                )}

                {watchedForm.routeMode === "static_response" && (
                  <>
                    <label className="form-label">Response message</label>
                    <textarea
                      {...register("responseBody")}
                      className="form-control mb-3"
                      rows={3}
                      placeholder="This site is currently unavailable."
                    />
                    <label className="form-label">Response status</label>
                    <input
                      {...register("responseStatus")}
                      className="form-control"
                      type="number"
                      min="100"
                      max="599"
                      placeholder="200"
                    />
                    <div className="d-flex justify-content-between align-items-center mt-3 mb-2">
                      <label className="form-label mb-0">
                        Response headers
                      </label>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() =>
                          responseHeaders.append({ name: "", value: "" })
                        }
                      >
                        Add header
                      </button>
                    </div>
                    {responseHeaders.fields.map((field, index) => (
                      <div className="row g-2 mb-2" key={field.id}>
                        <div className="col-5">
                          <input
                            {...register(`responseHeaders.${index}.name`)}
                            className="form-control"
                            placeholder="Content-Type"
                          />
                        </div>
                        <div className="col">
                          <input
                            {...register(`responseHeaders.${index}.value`)}
                            className="form-control"
                            placeholder="text/plain"
                          />
                        </div>
                        <div className="col-auto">
                          <button
                            type="button"
                            className="btn btn-outline-danger"
                            aria-label="Remove header"
                            onClick={() => responseHeaders.remove(index)}
                          >
                            <i className="bi bi-x-lg" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {watchedForm.routeMode === "file_server" && (
                  <>
                    <label className="form-label">Folder to serve</label>
                    <input
                      {...register("fileRoot")}
                      className="form-control"
                      placeholder="/var/www/html"
                    />
                  </>
                )}

                {watchedForm.routeMode === "rewrite" && (
                  <>
                    <label className="form-label">New request path</label>
                    <input
                      {...register("rewriteUri")}
                      className="form-control"
                      placeholder="/index.html"
                    />
                  </>
                )}

                {watchedForm.routeMode === "custom" && (
                  <>
                    <label className="form-label">Caddy route JSON</label>
                    <textarea
                      {...register("routeConfigJson", {
                        validate: (value) => {
                          if (!value?.trim()) return true;
                          try {
                            const parsed = JSON.parse(value);
                            return parsed &&
                              typeof parsed === "object" &&
                              !Array.isArray(parsed)
                              ? true
                              : "Route JSON must be an object";
                          } catch {
                            return "Must be valid JSON";
                          }
                        },
                      })}
                      className={`form-control font-monospace ${errors.routeConfigJson ? "is-invalid" : ""}`}
                      rows={8}
                      placeholder={
                        '{\n  "handle": [{ "handler": "static_response", "status_code": 200 }]\n}'
                      }
                    />
                    <div className="form-text">
                      Use this only for Caddy actions not covered by the
                      builder.
                    </div>
                    {errors.routeConfigJson && (
                      <div className="invalid-feedback">
                        {errors.routeConfigJson.message}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <details className="editor-details mb-3">
              <summary>Advanced settings</summary>
              <div className="pt-3">
                <label className="form-label">Route ID</label>
                <input
                  {...register("routeId")}
                  className={`form-control ${errors.routeId ? "is-invalid" : ""}`}
                  placeholder="Required for dynamic inventory"
                />
                {errors.routeId && (
                  <div className="invalid-feedback">
                    {errors.routeId.message}
                  </div>
                )}
                <div className="form-check form-switch mt-3">
                  <Controller
                    name="tlsEnabled"
                    control={control}
                    render={({ field }) => (
                      <input
                        type="checkbox"
                        className="form-check-input"
                        role="switch"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        id="tls-switch"
                      />
                    )}
                  />
                  <label className="form-check-label" htmlFor="tls-switch">
                    TLS enabled
                  </label>
                </div>
              </div>
            </details>

            <details className="editor-details mb-3">
              <summary>Health check settings</summary>
              <div className="pt-3">
                <p className="text-muted small mb-3">
                  Leave blank to use <code>https://{"{domain}"}</code> with no
                  custom headers.
                </p>
                <div className="mb-3">
                  <label className="form-label">Health Endpoint URL</label>
                  <input
                    {...register("healthEndpoint")}
                    className={`form-control ${errors.healthEndpoint ? "is-invalid" : ""}`}
                    placeholder="https://api.example.com/health"
                  />
                  <div className="form-text">
                    Custom URL to ping instead of the site domain.
                  </div>
                  {errors.healthEndpoint && (
                    <div className="invalid-feedback">
                      {errors.healthEndpoint.message}
                    </div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">
                    Health Check Headers (JSON)
                  </label>
                  <textarea
                    {...register("healthHeaders")}
                    className={`form-control font-monospace ${errors.healthHeaders ? "is-invalid" : ""}`}
                    rows={3}
                    placeholder='{"Authorization": "Bearer token123"}'
                  />
                  <div className="form-text">
                    JSON object of headers to include in the health check
                    request.
                  </div>
                  {errors.healthHeaders && (
                    <div className="invalid-feedback">
                      {errors.healthHeaders.message}
                    </div>
                  )}
                </div>
              </div>
            </details>
            <div className="d-flex gap-2 mt-3">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!routePreview}
              >
                Review route
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
        <aside className="card border-dark site-editor-preview">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h6 className="mb-0">Route preview</h6>
            <span className="badge text-bg-dark">Caddy JSON</span>
          </div>
          <div className="card-body p-0">
            <pre
              className="bg-dark text-light p-3 mb-0"
              style={{ maxHeight: 620, overflow: "auto", fontSize: "0.8rem" }}
            >
              {routePreview
                ? JSON.stringify(routePreview, null, 2)
                : "Complete the route fields to preview the JSON sent to Caddy."}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );

  const review = reviewData && previewRoute(reviewData);
  if (reviewData && review) {
    return (
      <>
        {editor}
        <div className="modal-backdrop fade show" />
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Review route before saving</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setReviewData(null)}
                />
              </div>
              <div className="modal-body">
                <p className="text-muted">
                  This is the route that will be stored and sent to Caddy.
                </p>
                <pre
                  className="bg-dark text-light p-3 rounded mb-0"
                  style={{
                    maxHeight: 480,
                    overflow: "auto",
                    fontSize: "0.8rem",
                  }}
                >
                  {JSON.stringify(review, null, 2)}
                </pre>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReviewData(null)}
                >
                  Back to edit
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setReviewData(null);
                    setOperation({
                      title: isEdit ? "Saving site changes" : "Creating site",
                      message:
                        "Writing the site configuration and applying the requested changes.",
                      status: "running",
                    });
                    isEdit
                      ? updateMutation.mutate(reviewData)
                      : createMutation.mutate(reviewData);
                  }}
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {isEdit ? "Save changes" : "Create site"}
                </button>
              </div>
            </div>
          </div>
        </div>
        <OperationModal
          operation={operation}
          onClose={() => setOperation(null)}
        />
      </>
    );
  }

  if (!modal) return editor;

  return (
    <>
      <div className="modal-backdrop fade show" onClick={handleClose} />
      <div
        className="modal fade show d-block site-editor-modal"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-body p-0">{editor}</div>
          </div>
        </div>
      </div>
    </>
  );
}
