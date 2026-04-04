import { Route, Switch, Redirect } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/context/auth-context";
import Dashboard from "@/pages/dashboard";
import Topology from "@/pages/topology";
import Nodes from "@/pages/nodes";
import NodeDetail from "@/pages/node-detail";
import NetPath from "@/pages/netpath";
import Flows from "@/pages/flows";
import Alerts from "@/pages/alerts";
import Poller from "@/pages/poller";
import Discovery from "@/pages/discovery";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";

function MainRoutes() {
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
        <Route path="/discovery" component={Discovery} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

export function AppRoutes() {
  const { ready, authRequired, isAuthenticated } = useAuth();

  if (!ready) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-muted-foreground text-sm">
        A carregar…
      </div>
    );
  }

  if (authRequired && !isAuthenticated) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  if (authRequired && isAuthenticated) {
    return (
      <Switch>
        <Route path="/login">
          <Redirect to="/" />
        </Route>
        <Route component={MainRoutes} />
      </Switch>
    );
  }

  return <MainRoutes />;
}
