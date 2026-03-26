import { Link, useLocation } from "wouter";
import { 
  Activity, 
  Server, 
  Share2, 
  AlertTriangle, 
  Zap, 
  ActivitySquare,
  Search,
  Bell,
  Settings,
  User,
  Wifi
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useWebSocket } from "@/hooks/use-websocket";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { href: "/", label: "Dashboard", icon: ActivitySquare },
  { href: "/topology", label: "Topology Map", icon: Share2 },
  { href: "/nodes", label: "Network Nodes", icon: Server },
  { href: "/netpath", label: "NetPath", icon: Activity },
  { href: "/flows", label: "Traffic Flows", icon: Wifi },
  { href: "/alerts", label: "Active Alerts", icon: AlertTriangle },
  { href: "/poller", label: "Poller Engine", icon: Zap },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isConnected } = useWebSocket();

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
        {/* Topbar */}
        <header className="h-16 flex-shrink-0 border-b border-border bg-background/50 backdrop-blur-md flex items-center justify-between px-6 z-20">
          <div className="flex items-center w-96 relative">
            <Search className="h-4 w-4 absolute left-3 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search nodes, IPs, alerts..." 
              className="w-full bg-secondary/50 border border-border rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground placeholder:text-muted-foreground"
            />
          </div>
          
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-secondary">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive border border-background"></span>
            </button>
            <button className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-secondary">
              <Settings className="h-5 w-5" />
            </button>
            <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary ml-2">
              <User className="h-4 w-4" />
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
