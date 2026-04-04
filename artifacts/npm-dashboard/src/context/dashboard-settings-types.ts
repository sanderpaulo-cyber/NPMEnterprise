export type DashboardThemePreference = "system" | "light" | "dark";

export type DashboardLocalePreference = "pt" | "en";

export type DashboardLocalSettings = {
  version: 1;
  interface: {
    theme: DashboardThemePreference;
    locale: DashboardLocalePreference;
    /** 0 = 30s. Valor > 0 = staleTime global do React Query (queries com staleTime próprio ignoram). */
    dataRefreshIntervalMs: number;
  };
  connection: {
    /** Sem barra final; vazio = proxy relativo /api */
    apiBaseUrl: string;
  };
};
