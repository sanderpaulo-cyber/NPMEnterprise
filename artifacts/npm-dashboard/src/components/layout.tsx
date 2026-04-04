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
      <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar glass-panel flex flex-col z-20">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
            <Activity className="h-6 w-6 tech-glow rounded-full" />
            <span>NPM<span className="text-foreground">Enterprise</span></span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">
            Core Monitoring
          </div>
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                  isActive 
                    ? "bg-primary/10 text-primary tech-glow" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className={cn(
                  "h-5 w-5 transition-colors", 
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/50 border border-border/50">
            <div className={cn(
              "h-2.5 w-2.5 rounded-full",
              isConnected ? "bg-success status-pulse-green" : "bg-destructive status-pulse-red"
            )} />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-foreground">Real-time Sync</span>
              <span className="text-[10px] text-muted-foreground">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <ApiStatusBanner />
        {/* Topbar */}
        <header className="h-16 flex-shrink-0 border-b border-border bg-background/50 backdrop-blur-md flex items-center justify-between px-6 z-20">
          <form className="flex items-center w-96 gap-2" onSubmit={handleGlobalSearch}>
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={topSearch}
                onChange={(event) => setTopSearch(event.target.value)}
                placeholder="Buscar nós por nome ou IP..."
                className="w-full rounded-full bg-secondary/50 pl-10"
              />
            </div>
            <Button type="submit" variant="outline" className="border-border">
              Buscar
            </Button>
          </form>
          
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-secondary">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive border border-background"></span>
            </button>
            <button
              type="button"
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-secondary"
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

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth relative">
          {/* Subtle decorative background elements */}
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/5 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="relative z-10 w-full max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
