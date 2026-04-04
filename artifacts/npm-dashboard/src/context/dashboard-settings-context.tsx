import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import { setBaseUrl } from "@workspace/api-client-react";
import type {
  DashboardLocalSettings,
  DashboardThemePreference,
} from "@/context/dashboard-settings-types";
import {
  loadDashboardLocalSettings,
  saveDashboardLocalSettings,
  sanitizeApiBaseUrl,
} from "@/lib/dashboard-local-settings";

type DashboardSettingsContextValue = {
  local: DashboardLocalSettings;
  setLocal: (next: DashboardLocalSettings) => void;
  patchLocal: (partial: Partial<DashboardLocalSettings>) => void;
  applyConnectionAndReload: () => void;
};

const DashboardSettingsContext = createContext<DashboardSettingsContextValue | null>(
  null,
);

function ThemeBinder({ theme }: { theme: DashboardThemePreference }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  return null;
}

export function DashboardSettingsProvider({ children }: { children: ReactNode }) {
  const [local, setLocalState] = useState<DashboardLocalSettings>(() =>
    loadDashboardLocalSettings(),
  );

  const setLocal = useCallback((next: DashboardLocalSettings) => {
    saveDashboardLocalSettings(next);
    setLocalState(next);
  }, []);

  const patchLocal = useCallback(
    (partial: Partial<DashboardLocalSettings>) => {
      setLocalState((prev) => {
        const mergedConnection = { ...prev.connection, ...partial.connection };
        const next: DashboardLocalSettings = {
          ...prev,
          ...partial,
          interface: { ...prev.interface, ...partial.interface },
          connection: {
            ...mergedConnection,
            apiBaseUrl: sanitizeApiBaseUrl(mergedConnection.apiBaseUrl ?? ""),
          },
        };
        saveDashboardLocalSettings(next);
        return next;
      });
    },
    [],
  );

  const applyConnectionAndReload = useCallback(() => {
    const cleaned = sanitizeApiBaseUrl(local.connection.apiBaseUrl);
    setBaseUrl(cleaned.length > 0 ? cleaned : null);
    window.location.reload();
  }, [local.connection.apiBaseUrl]);

  const value = useMemo(
    () => ({
      local,
      setLocal,
      patchLocal,
      applyConnectionAndReload,
    }),
    [local, setLocal, patchLocal, applyConnectionAndReload],
  );

  return (
    <DashboardSettingsContext.Provider value={value}>
      <ThemeBinder theme={local.interface.theme} />
      {children}
    </DashboardSettingsContext.Provider>
  );
}

export function useDashboardSettings() {
  const ctx = useContext(DashboardSettingsContext);
  if (!ctx) {
    throw new Error("useDashboardSettings must be used within DashboardSettingsProvider");
  }
  return ctx;
}
