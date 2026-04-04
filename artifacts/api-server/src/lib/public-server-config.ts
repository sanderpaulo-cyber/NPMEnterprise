function readEnvInt(name: string, fallback: number, min: number) {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  if (Number.isNaN(raw)) return fallback;
  return Math.max(min, raw);
}

function readEnvString(name: string, fallback: string) {
  const raw = process.env[name]?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

function readEnvBool(name: string) {
  return process.env[name] === "true";
}

/**
 * Snapshot não sensível do ambiente de processo (somente leitura no dashboard).
 * Não expor segredos (URLs de BD, passwords, chaves).
 */
export function getPublicServerConfig() {
  return {
    nodeEnv: readEnvString("NODE_ENV", "development"),
    logLevel: readEnvString("LOG_LEVEL", "info"),
    enableDemoSeed: readEnvBool("ENABLE_DEMO_SEED"),
    apiPort: readEnvInt("API_PORT", readEnvInt("PORT", 8080, 1), 1),
    network: {
      pollingMode: readEnvString("NETWORK_POLLING_MODE", "icmp"),
      pollIntervalMs: readEnvInt("NETWORK_POLL_INTERVAL_MS", 30_000, 1_000),
      pollBatchSize: readEnvInt("NETWORK_POLL_BATCH_SIZE", 6, 1),
      detailedPollIntervalMs: readEnvInt(
        "NETWORK_DETAILED_POLL_INTERVAL_MS",
        300_000,
        1_000,
      ),
    },
    discovery: {
      maxHostsPerRun: readEnvInt("DISCOVERY_MAX_HOSTS_PER_RUN", 512, 1),
      hostConcurrency: readEnvInt("DISCOVERY_HOST_CONCURRENCY", 6, 1),
      maxParallelRuns: readEnvInt("DISCOVERY_MAX_PARALLEL_RUNS", 1, 1),
      apiRateLimitWindowMs: readEnvInt(
        "DISCOVERY_API_RATE_LIMIT_WINDOW_MS",
        60_000,
        1_000,
      ),
      apiRateLimitMax: readEnvInt("DISCOVERY_API_RATE_LIMIT_MAX", 10, 1),
    },
    pool: {
      max: readEnvInt("PGPOOL_MAX", 20, 1),
      idleTimeoutMs: readEnvInt("PGPOOL_IDLE_TIMEOUT_MS", 30_000, 1_000),
      connectTimeoutMs: readEnvInt(
        "PGPOOL_CONNECT_TIMEOUT_MS",
        10_000,
        1_000,
      ),
    },
  } as const;
}
