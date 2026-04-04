/**
 * Resolve `/api/...` para o mesmo host (e BASE_PATH) da página.
 * O login e a sessão HttpOnly **têm** de bater no proxy Vite/nginx no mesmo site;
 * não usar `VITE_API_BASE_URL` nem o URL em localStorage aqui — isso quebra cookies entre
 * `localhost` e `127.0.0.1` ou entre HTTPS e HTTP.
 */
export function sameOriginApiUrl(path: string): string {
  if (typeof window === "undefined") {
    return path.startsWith("/") ? path : `/${path}`;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!normalized.startsWith("/api")) {
    return normalized;
  }
  const segment = normalized.slice(1);
  const base = import.meta.env.BASE_URL || "/";
  const originBase = window.location.origin + (base.endsWith("/") ? base : `${base}/`);
  const u = new URL(segment, originBase);
  return `${u.pathname}${u.search}`;
}
