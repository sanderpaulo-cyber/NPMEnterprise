import { cn } from "@/components/layout";
import { Badge } from "@/components/ui/badge";

type StatusType = 'up' | 'down' | 'warning' | 'unknown' | 'critical' | 'info';

export function StatusBadge({ status, className }: { status: StatusType | string, className?: string }) {
  const normStatus = status.toLowerCase() as StatusType;
  
  const config = {
    up: { class: "bg-success/15 text-success border-success/30", dot: "bg-success status-pulse-green" },
    down: { class: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive status-pulse-red" },
    warning: { class: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning" },
    critical: { class: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive status-pulse-red" },
    info: { class: "bg-primary/15 text-primary border-primary/30", dot: "bg-primary" },
    unknown: { class: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
  };

  const current = config[normStatus as keyof typeof config] || config.unknown;

  return (
    <Badge variant="outline" className={cn("px-2.5 py-0.5 flex items-center gap-1.5 font-medium border uppercase tracking-wider text-[10px]", current.class, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", current.dot)} />
      {status}
    </Badge>
  );
}
