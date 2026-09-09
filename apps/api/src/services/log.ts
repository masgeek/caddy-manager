import { CaddyProvider } from "../providers/caddy";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source?: string;
}

const logBuffer: LogEntry[] = [];
const MAX_LOG_ENTRIES = 1000;

export function addLogEntry(entry: LogEntry) {
  logBuffer.unshift(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.length = MAX_LOG_ENTRIES;
  }
}

export async function getLogs(params?: {
  limit?: number;
  search?: string;
}): Promise<LogEntry[]> {
  let entries = logBuffer;

  if (params?.search) {
    const q = params.search.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.message.toLowerCase().includes(q) ||
        e.level.toLowerCase().includes(q) ||
        (e.source && e.source.toLowerCase().includes(q)),
    );
  }

  return entries.slice(0, params?.limit || 100);
}

export async function fetchCaddyLogs(provider: CaddyProvider): Promise<void> {
  try {
    const rawLogs = await provider.getLogs();
    for (const log of rawLogs) {
      if (typeof log === "string") {
        addLogEntry({
          timestamp: new Date().toISOString(),
          level: "info",
          message: log,
          source: "caddy",
        });
      }
    }
  } catch {
    // Silently fail if Caddy is unreachable
  }
}
