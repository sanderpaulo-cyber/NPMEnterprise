import { getHealthCheckQueryKey, useHealthCheck } from "@workspace/api-client-react";
import { AlertCircle } from "lucide-react";

/**
 * Mostra um aviso claro quando a API não responde (causa típica de “nada funciona”).
 */
export function ApiStatusBanner() {
  const { isError, isPending, isFetching, error, refetch } = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      retry: 1,
      retryDelay: 800,
      refetchInterval: 12_000,
      staleTime: 0,
    },
  });

  if (!isError) {
    return null;
  }

  const proxyHint =
    import.meta.env.VITE_API_BASE_URL == null || import.meta.env.VITE_API_BASE_URL === ""
      ? "Use a URL do Vite (ex.: http://localhost:20112) para o proxy encaminhar /api para a porta 8080."
      : "Confirme VITE_API_BASE_URL e CORS na API.";

  return (
    <div className="shrink-0 border-b border-destructive/50 bg-destructive/15 px-4 py-3 text-sm">
      <div className="mx-auto flex max-w-7xl gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-foreground">API indisponível — o dashboard não consegue carregar dados</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            1) Inicie a API com{" "}
            <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-[11px]">
              PORT=8080 DATABASE_URL=… pnpm --filter @workspace/api-server run dev
            </code>
            . 2) {proxyHint} 3) Não abra só o ficheiro HTML estático sem API atrás do proxy.
          </p>
          {error != null ? (
            <p className="font-mono text-[11px] text-destructive/90 break-all">
              {error instanceof Error ? error.message : String(error)}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isPending || isFetching}
            className="text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80 disabled:opacity-50"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}
