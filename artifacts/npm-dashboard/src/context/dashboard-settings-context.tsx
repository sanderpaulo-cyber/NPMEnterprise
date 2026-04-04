import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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

const THEME_CHOICE_ATTR = "data-theme-choice";

function ThemeBinder({ theme }: { theme: DashboardThemePreference }) {
  const { setTheme } = useTheme();

  /*
   * next-themes com SO claro coloca sempre class="light" para «Claro» e «Sistema» —
   * as variáveis CSS eram iguais. data-theme-choice distingue a preferência gravada
   * para paletas diferentes (Claro fixo vs. Sistema quando resolvido a claro).
   */
  useLayoutEffect(() => {
    document.documentElement.setAttribute(THEME_CHOICE_ATTR, theme);
    setTheme(theme);
  }, [theme, setTheme]);

  return null;
}

function LocaleBinder({ locale }: { locale: "pt" | "en" }) {
  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "pt";
  }, [locale]);

  return null;
}

export function DashboardSettingsProvider({ children }: { children: ReactNode }) {
  const [local, setLocalState] = useState<DashboardLocalSettings>(() =>
    loadDashboardLocalSettings(),
  );

  const setLocal = useCallback((next: DashboardLocalSettings) => {
    const cleaned: DashboardLocalSettings = {
      ...next,
      connection: {
        ...next.connection,
        apiBaseUrl: sanitizeApiBaseUrl(next.connection.apiBaseUrl ?? ""),
      },
    };
    saveDashboardLocalSettings(cleaned);
    setLocalState(cleaned);
    setBaseUrl(
      cleaned.connection.apiBaseUrl.length > 0 ? cleaned.connection.apiBaseUrl : null,
    );
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
        if (partial.connection !== undefined) {
          setBaseUrl(
            next.connection.apiBaseUrl.length > 0 ? next.connection.apiBaseUrl : null,
          );
        }
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
      <LocaleBinder locale={local.interface.locale} />
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
