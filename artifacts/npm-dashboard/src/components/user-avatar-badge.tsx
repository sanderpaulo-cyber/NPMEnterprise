import { User } from "lucide-react";
import type { ClassValue } from "clsx";
import { cn } from "@/lib/utils";

export type UserAvatarBadgeProps = {
  avatarImageUrl: string | null | undefined;
  avatarEmoji: string | null | undefined;
  displayName?: string | null;
  username?: string | null;
  className?: ClassValue;
  size?: "sm" | "md";
};

/**
 * Avatar no canto superior: imagem (prioritária), emoji, ou ícone.
 */
export function UserAvatarBadge({
  avatarImageUrl,
  avatarEmoji,
  displayName,
  username,
  className,
  size = "md",
}: UserAvatarBadgeProps) {
  const dim = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const textSize = size === "sm" ? "text-base" : "text-lg";
  const title = displayName?.trim() || username || "Utilizador";

  if (avatarImageUrl) {
    return (
      <img
        src={avatarImageUrl}
        alt=""
        title={title}
        className={cn(
          dim,
          "rounded-full border border-primary/30 object-cover shrink-0 bg-muted",
          className,
        )}
      />
    );
  }

  if (avatarEmoji?.trim()) {
    return (
      <span
        title={title}
        className={cn(
          dim,
          "rounded-full border border-primary/30 bg-primary/15 flex items-center justify-center shrink-0 select-none leading-none",
          textSize,
          className,
        )}
        aria-hidden
      >
        {avatarEmoji.trim()}
      </span>
    );
  }

  return (
    <div
      title={title}
      className={cn(
        dim,
        "rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0",
        className,
      )}
    >
      <User className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </div>
  );
}
