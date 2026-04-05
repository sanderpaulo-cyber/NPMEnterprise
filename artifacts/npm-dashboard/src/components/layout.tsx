import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Activity, 
  Server, 
  Share2, 
  AlertTriangle, 
  Zap, 
  ActivitySquare,
  Radar,
  Search,
  Bell,
  Settings,
  Wifi
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAuth } from "@/context/auth-context";
import { UserAvatarBadge } from "@/components/user-avatar-badge";
import { LogOut } from "lucide-react";
import { ApiStatusBanner } from "@/components/api-status-banner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { href: "/", label: "Dashboard", icon: ActivitySquare },
  { href: "/topology", label: "Topology Map", icon: Share2 },
  { href: "/nodes", label: "Network Nodes", icon: Server },
  { href: "/discovery", label: "Discovery", icon: Radar },
  { href: "/netpath", label: "NetPath", icon: Activity },
  { href: "/flows", label: "Traffic Flows", icon: Wifi },
  { href: "/alerts", label: "Active Alerts", icon: AlertTriangle },
  { href: "/poller", label: "Poller Engine", icon: Zap },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const {
    authRequired,
    accessToken,
    logout,
    username,
    displayName,
    avatarEmoji,
    avatarImageUrl,
  } = useAuth();
  const { isConnected } = useWebSocket({
    authRequired,
    token: accessToken,
    preferCookieAuth: true,
  });
  const [topSearch, setTopSearch] = useState("");

  function handleGlobalSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = topSearch.trim();
    setLocation(`/nodes${value ? `?q=${encodeURIComponent(value)}` : ""}`);
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="relative z-20 flex w-[17rem] shrink-0 flex-col border-r border-border/60 bg-sidebar/90 glass-panel">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/[0.07] to-transparent"
          aria-hidden
        />
        <div className="relative flex h-16 items-center border-b border-border/50 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 shadow-inner">
              <Activity className="h-[1.15rem] w-[1.15rem] text-primary" strokeWidth={2.25} />
            </div>
            <div className="font-display text-[1.05rem] font-semibold leading-tight tracking-tight">
              <span className="text-primary">NPM</span>
              <span className="text-foreground"> Enterprise</span>
            </div>
          </div>
        </div>

        <div className="relative flex-1 space-y-1 overflow-y-auto px-2.5 py-4">
          <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
            Monitorização
          </div>
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/[0.11] text-primary shadow-sm shadow-primary/5 ring-1 ring-primary/15"
                    : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground hover:ring-1 hover:ring-border/60",
                )}
              >
                {isActive ? (
                  <span
                    className="absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.55)]"
                    aria-hidden
                  />
                ) : null}
                <item.icon
                  className={cn(
                    "relative h-[1.15rem] w-[1.15rem] shrink-0 transition-transform duration-200 group-hover:scale-[1.04]",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="relative border-t border-border/50 p-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-secondary/35 px-3.5 py-2.5 backdrop-blur-sm">
            <div
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background",
                isConnected ? "bg-success status-pulse-green" : "bg-destructive status-pulse-red",
              )}
            />
            <div className="min-w-0 flex flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">Tempo real</span>
              <span className="text-[10px] text-muted-foreground">
                {isConnected ? "Ligado ao servidor" : "Sem ligação"}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <ApiStatusBanner />
        {/* Topbar */}
        <header className="shell-topbar z-20 flex h-16 shrink-0 items-center justify-between gap-4 px-6">
          <form className="flex max-w-md flex-1 items-center gap-2 sm:max-w-lg" onSubmit={handleGlobalSearch}>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
              <Input
                type="text"
                value={topSearch}
                onChange={(event) => setTopSearch(event.target.value)}
                placeholder="Buscar nós por nome ou IP..."
                className="h-10 w-full rounded-xl border-border/60 bg-secondary/40 pl-10 transition-shadow duration-200 focus-visible:bg-background/80"
              />
            </div>
            <Button type="submit" variant="secondary" className="h-10 shrink-0 rounded-xl px-4 font-medium">
              Buscar
            </Button>
          </form>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              className="relative rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
              title="Notificações"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-background bg-destructive" />
            </button>
            <button
              type="button"
              className="rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
              onClick={() => setLocation("/settings")}
              title="Configurações"
            >
              <Settings className="h-5 w-5" />
            </button>
            {authRequired && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground gap-1"
                onClick={async () => {
                  await logout();
                  setLocation("/login");
                }}
                title="Terminar sessão"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline max-w-[100px] truncate">{username}</span>
              </Button>
            )}
            <div className="ml-2 shrink-0">
              <UserAvatarBadge
                avatarImageUrl={avatarImageUrl}
                avatarEmoji={avatarEmoji}
                displayName={displayName}
                username={username}
              />
            </div>
          </div>
        </header>

        {/* Page Content — min-h-0 permite que filhos (ex. topologia) usem flex-1 e preencham a altura útil */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth p-6 md:p-8">
          <div
            className="pointer-events-none absolute left-[-15%] top-[-25%] h-[45%] w-[55%] rounded-full bg-primary/[0.06] blur-[100px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-[-20%] right-[-12%] h-[40%] w-[50%] rounded-full bg-violet-500/[0.05] blur-[110px] dark:bg-violet-500/[0.07]"
            aria-hidden
          />

          <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[90rem] flex-col">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
