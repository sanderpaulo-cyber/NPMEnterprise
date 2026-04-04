import { Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardSettingsProvider } from "@/context/dashboard-settings-context";
import { AuthProvider } from "@/context/auth-context";
import { AppRoutes } from "@/components/app-routes";
import { loadDashboardLocalSettings } from "@/lib/dashboard-local-settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

function App() {
  const defaultTheme = loadDashboardLocalSettings().interface.theme;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme={defaultTheme}
        enableSystem
        disableTransitionOnChange
      >
        <DashboardSettingsProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AuthProvider>
                <AppRoutes />
              </AuthProvider>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </DashboardSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
