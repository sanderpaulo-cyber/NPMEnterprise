import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/auth-token";
import { sameOriginApiUrl } from "@/lib/same-origin-api";

/** fetch com cabeçalho Authorization quando há sessão (pedidos manuais fora do client Orval). */
export function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const resolved =
    typeof input === "string" && input.startsWith("/api")
      ? sameOriginApiUrl(input)
      : input;
  const headers = new Headers(init?.headers);
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
      : null;
  if (token && !headers.has("Authorization") && !headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(resolved, { ...init, headers, credentials: "include" });
}
