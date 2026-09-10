import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@caddy-manager/ui";
import { api } from "../api/client";

function describeCron(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return "Enter a five-field cron expression.";
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (
    minute.startsWith("*/") &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  )
    return `Runs every ${minute.slice(2)} minutes.`;
  if (
    minute === "0" &&
    hour.startsWith("*/") &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  )
    return `Runs every ${hour.slice(2)} hours.`;
  if (
    minute !== "*" &&
    hour !== "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  )
    return `Runs daily at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}.`;
  return "Custom five-field schedule. The API will validate it before saving.";
}

export default function Settings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["site-health-settings"],
    queryFn: () => api.getSiteHealthSettings(),
  });
  const [form, setForm] = useState({
    enabled: true,
    schedule: "*/5 * * * *",
    timeoutMs: 5000,
    concurrency: 5,
    retries: 2,
    retryDelayMs: 250,
  });
  const [cronParts, setCronParts] = useState(["*/5", "*", "*", "*", "*"]);
  useEffect(() => {
    if (query.data) {
      setForm(query.data);
      setCronParts(query.data.schedule.trim().split(/\s+/));
    }
  }, [query.data]);
  const mutation = useMutation({
    mutationFn: () => api.updateSiteHealthSettings(form),
    onSuccess: (settings) => {
      queryClient.setQueryData(["site-health-settings"], settings);
      queryClient.invalidateQueries({ queryKey: ["site-health-status"] });
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Application settings"
        title="Health monitoring"
        description="Configure the persisted health scheduler and how it reaches managed sites."
        signal={
          <>
            <strong>Database-backed</strong>
            <span className="ms-auto">Applied immediately</span>
          </>
        }
      />
      {query.isError && (
        <div className="alert alert-danger">
          Failed to load health settings.
        </div>
      )}
      <section className="card p-4 mx-auto" style={{ maxWidth: 760 }}>
        <div className="form-check form-switch mb-4">
          <input
            className="form-check-input"
            type="checkbox"
            id="health-enabled"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          <label className="form-check-label" htmlFor="health-enabled">
            Enable scheduled health checks
          </label>
        </div>
        <div className="d-grid gap-3" style={{ maxWidth: 680 }}>
          <fieldset className="border rounded p-3">
            <legend className="float-none w-auto px-2 fs-6 mb-1">
              Cron schedule
            </legend>
            <div className="row g-2">
              {["Minute", "Hour", "Day of month", "Month", "Day of week"].map(
                (label, index) => (
                  <label className="col-12 col-sm" key={label}>
                    <span className="small text-muted">{label}</span>
                    <input
                      className="form-control font-monospace"
                      value={cronParts[index] ?? "*"}
                      placeholder={index === 0 ? "*/5" : "*"}
                      aria-label={`Cron ${label}`}
                      onChange={(event) => {
                        const next = [...cronParts];
                        next[index] = event.target.value.replace(/\s/g, "");
                        setCronParts(next);
                        setForm({ ...form, schedule: next.join(" ") });
                      }}
                    />
                  </label>
                ),
              )}
            </div>
            <span className="small text-muted d-block mt-2">
              {describeCron(form.schedule)}
            </span>
          </fieldset>
          <label>
            Timeout (milliseconds)
            <input
              className="form-control"
              type="number"
              min="100"
              max="120000"
              value={form.timeoutMs}
              onChange={(e) =>
                setForm({ ...form, timeoutMs: Number(e.target.value) })
              }
            />
            <span className="small text-muted">
              Maximum time allowed for one site response.
            </span>
          </label>
          <label>
            Concurrent checks
            <input
              className="form-control"
              type="number"
              min="1"
              max="50"
              value={form.concurrency}
              onChange={(e) =>
                setForm({ ...form, concurrency: Number(e.target.value) })
              }
            />
            <span className="small text-muted">
              How many sites can be checked at once.
            </span>
          </label>
          <label>
            Retries
            <input
              className="form-control"
              type="number"
              min="0"
              max="10"
              value={form.retries}
              onChange={(e) =>
                setForm({ ...form, retries: Number(e.target.value) })
              }
            />
            <span className="small text-muted">
              Additional attempts after an error.
            </span>
          </label>
          <label>
            Retry delay (milliseconds)
            <input
              className="form-control"
              type="number"
              min="0"
              max="60000"
              value={form.retryDelayMs}
              onChange={(e) =>
                setForm({ ...form, retryDelayMs: Number(e.target.value) })
              }
            />
            <span className="small text-muted">
              Wait time between failed attempts.
            </span>
          </label>
        </div>
        <div className="small text-muted mt-3">
          Defaults: every five minutes, 5-second timeout, five concurrent
          checks, two retries, and 250ms retry delay.
        </div>
        <button
          className="btn btn-primary mt-4"
          disabled={query.isLoading || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving..." : "Save settings"}
        </button>
        {mutation.isSuccess && (
          <span className="text-success ms-3">Settings saved.</span>
        )}
        {mutation.isError && (
          <span className="text-danger ms-3">Failed to save settings.</span>
        )}
      </section>
    </div>
  );
}
