import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";

// Pages
import Dashboard from "@/pages/dashboard";
import Topology from "@/pages/topology";
import Nodes from "@/pages/nodes";
import NodeDetail from "@/pages/node-detail";
import NetPath from "@/pages/netpath";
import Flows from "@/pages/flows";
import Alerts from "@/pages/alerts";
import Poller from "@/pages/poller";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/topology" component={Topology} />
        <Route path="/nodes" component={Nodes} />
        <Route path="/nodes/:id" component={NodeDetail} />
        <Route path="/netpath" component={NetPath} />
        <Route path="/flows" component={Flows} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/poller" component={Poller} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
