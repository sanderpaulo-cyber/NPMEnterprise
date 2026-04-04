import type { DashboardLocalSettings } from "@/context/dashboard-settings-types";

export const DASHBOARD_SETTINGS_STORAGE_KEY =
  "npm-enterprise.dashboard.settings.v1";

export function defaultDashboardLocalSettings(): DashboardLocalSettings {
  return {
    version: 1,
    interface: {
      theme: "system",
      locale: "pt",
      dataRefreshIntervalMs: 0,
    },
    connection: {
      apiBaseUrl: "",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rejeita valores que partem o cliente HTTP (ex.: texto solto no localStorage). Mantém path útil (ex. /api). */
export function sanitizeApiBaseUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    u.hash = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function parseDashboardLocalSettings(
  raw: string | null,
): DashboardLocalSettings {
  const defaults = defaultDashboardLocalSettings();
  if (!raw) return defaults;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1) return defaults;

    const iface = isRecord(parsed.interface) ? parsed.interface : {};
    const conn = isRecord(parsed.connection) ? parsed.connection : {};

    return {
      version: 1,
      interface: {
        theme:
          iface.theme === "light" || iface.theme === "dark" || iface.theme === "system"
            ? iface.theme
            : defaults.interface.theme,
        locale: iface.locale === "en" ? "en" : "pt",
        dataRefreshIntervalMs:
          typeof iface.dataRefreshIntervalMs === "number" &&
          Number.isFinite(iface.dataRefreshIntervalMs) &&
          iface.dataRefreshIntervalMs >= 0
            ? Math.min(Math.floor(iface.dataRefreshIntervalMs), 3_600_000)
            : defaults.interface.dataRefreshIntervalMs,
      },
      connection: {
        apiBaseUrl: sanitizeApiBaseUrl(
          typeof conn.apiBaseUrl === "string" ? conn.apiBaseUrl : "",
        ),
      },
    };
  } catch {
    return defaults;
  }
}

export function loadDashboardLocalSettings(): DashboardLocalSettings {
  if (typeof window === "undefined") return defaultDashboardLocalSettings();
  return parseDashboardLocalSettings(
    window.localStorage.getItem(DASHBOARD_SETTINGS_STORAGE_KEY),
  );
}

export function saveDashboardLocalSettings(settings: DashboardLocalSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    DASHBOARD_SETTINGS_STORAGE_KEY,
    JSON.stringify(settings),
  );
}

/** Usado em `main.tsx` antes do primeiro render. */
export function readStoredApiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return sanitizeApiBaseUrl(loadDashboardLocalSettings().connection.apiBaseUrl ?? "");
}
