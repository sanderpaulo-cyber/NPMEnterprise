import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDashboardSettings } from "@/context/dashboard-settings-context";

const DEFAULT_STALE_MS = 30_000;

/**
 * Aplica `interface.dataRefreshIntervalMs` ao React Query (staleTime global).
 * 0 = manter 30s por omissão. Invalida caches quando o valor guardado muda.
 */
export function QueryClientStaleBinder() {
  const queryClient = useQueryClient();
  const { local } = useDashboardSettings();
  const prevStaleTime = useRef<number | null>(null);

  useEffect(() => {
    const ms = local.interface.dataRefreshIntervalMs;
    const staleTime = ms > 0 ? ms : DEFAULT_STALE_MS;
    queryClient.setDefaultOptions({
      queries: {
        ...queryClient.getDefaultOptions().queries,
        staleTime,
      },
    });
    if (prevStaleTime.current === staleTime) {
      return;
    }
    const shouldInvalidate = prevStaleTime.current !== null;
    prevStaleTime.current = staleTime;
    if (shouldInvalidate) {
      void queryClient.invalidateQueries();
    }
  }, [local.interface.dataRefreshIntervalMs, queryClient]);

  return null;
}
