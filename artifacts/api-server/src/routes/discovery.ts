import { randomUUID } from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  networkScopesTable,
  snmpCredentialsTable,
} from "@workspace/db/schema";
import {
  clearDiscoveryData,
  countRunningDiscoveryRuns,
  getCredential,
  getDiscoveryRun,
  getScope,
  listDiscoveryRuns,
  listNetworkScopes,
  listSnmpCredentials,
  queueDiscoveryRun,
  queueDiscoveryRunsForScopes,
  redactCredential,
} from "../lib/discovery-engine";

const router: IRouter = Router();
const discoveryMutationHits = new Map<string, number[]>();

function getDiscoveryRateLimitWindowMs() {
  const raw = Number.parseInt(
    process.env.DISCOVERY_API_RATE_LIMIT_WINDOW_MS ?? "60000",
    10,
  );
  if (Number.isNaN(raw)) return 60_000;
  return Math.max(1_000, raw);
}

function getDiscoveryRateLimitMax() {
  const raw = Number.parseInt(process.env.DISCOVERY_API_RATE_LIMIT_MAX ?? "10", 10);
  if (Number.isNaN(raw)) return 10;
  return Math.max(1, raw);
}

function applyDiscoveryRateLimit(req: Request, res: Response) {
  const sourceIp = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = getDiscoveryRateLimitWindowMs();
  const maxHits = getDiscoveryRateLimitMax();
  const previousHits = discoveryMutationHits.get(sourceIp) ?? [];
  const recentHits = previousHits.filter((timestamp) => now - timestamp < windowMs);

  if (recentHits.length >= maxHits) {
    res.status(429).json({
      error: `Muitas operacoes de discovery em pouco tempo. Aguarde alguns segundos e tente novamente.`,
    });
    return false;
  }

  recentHits.push(now);
  discoveryMutationHits.set(sourceIp, recentHits);
  return true;
}

router.get("/scopes", async (req, res): Promise<void> => {
  try {
    const scopes = await listNetworkScopes();
    res.json({ scopes });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to list scopes");
    res.status(500).json({ error: "Failed to list scopes" });
    return;
  }
});

router.post("/scopes", async (req, res): Promise<void> => {
  try {
    const {
      name,
      cidr,
      rangeStartIp,
      rangeEndIp,
      primaryRouterIp,
      primaryRouterName,
      site,
      description,
      enabled = true,
      priority = 100,
      defaultCredentialId,
    } = req.body ?? {};
    const normalizedCidr = cidr ? String(cidr).trim() : null;
    const normalizedRangeStart = rangeStartIp ? String(rangeStartIp).trim() : null;
    const normalizedRangeEnd = rangeEndIp ? String(rangeEndIp).trim() : null;
    if (!name || (!normalizedCidr && !(normalizedRangeStart && normalizedRangeEnd))) {
      res.status(400).json({
        error: "name and either cidr or rangeStartIp/rangeEndIp are required",
      });
      return;
    }

    if (defaultCredentialId) {
      const credential = await getCredential(defaultCredentialId);
      if (!credential) {
        res.status(400).json({ error: "defaultCredentialId is invalid" });
        return;
      }
    }

    const scope = {
      id: randomUUID(),
      name: String(name),
      cidr: normalizedCidr ?? undefined,
      rangeStartIp: normalizedRangeStart ?? undefined,
      rangeEndIp: normalizedRangeEnd ?? undefined,
      primaryRouterIp: primaryRouterIp ? String(primaryRouterIp).trim() : undefined,
      primaryRouterName: primaryRouterName ? String(primaryRouterName).trim() : undefined,
      site: site ? String(site) : undefined,
      description: description ? String(description) : undefined,
      enabled: Boolean(enabled),
      priority: Number(priority) || 100,
      defaultCredentialId: defaultCredentialId ? String(defaultCredentialId) : undefined,
    };

    await db.insert(networkScopesTable).values(scope);
    res.status(201).json(scope);
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to create scope");
    res.status(500).json({ error: "Failed to create scope" });
    return;
  }
});

router.delete("/scopes/:scopeId", async (req, res): Promise<void> => {
  try {
    await db
      .delete(networkScopesTable)
      .where(eq(networkScopesTable.id, req.params.scopeId));
    res.status(204).send();
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to delete scope");
    res.status(500).json({ error: "Failed to delete scope" });
    return;
  }
});

router.get("/credentials", async (req, res): Promise<void> => {
  try {
    const credentials = await listSnmpCredentials();
    res.json({ credentials: credentials.map(redactCredential) });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to list credentials");
    res.status(500).json({ error: "Failed to list credentials" });
    return;
  }
});

router.post("/credentials", async (req, res): Promise<void> => {
  try {
    const {
      name,
      version = "v2c",
      community,
      username,
      authProtocol = "none",
      authPassword,
      privProtocol = "none",
      privPassword,
      port = 161,
      timeoutMs = 2000,
      retries = 1,
      enabled = true,
    } = req.body ?? {};

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if ((version === "v1" || version === "v2c") && !community) {
      res.status(400).json({ error: "community is required for v1/v2c" });
      return;
    }
    if (version === "v3" && !username) {
      res.status(400).json({ error: "username is required for v3" });
      return;
    }

    const credential = {
      id: randomUUID(),
      name: String(name),
      version,
      community: community ? String(community) : null,
      username: username ? String(username) : null,
      authProtocol,
      authPassword: authPassword ? String(authPassword) : null,
      privProtocol,
      privPassword: privPassword ? String(privPassword) : null,
      port: Number(port) || 161,
      timeoutMs: Number(timeoutMs) || 2000,
      retries: Number(retries) || 1,
      enabled: Boolean(enabled),
      createdAt: new Date(),
    };

    await db.insert(snmpCredentialsTable).values(credential);
    res.status(201).json(redactCredential(credential));
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to create credential");
    res.status(500).json({ error: "Failed to create credential" });
    return;
  }
});

router.delete("/credentials/:credentialId", async (req, res): Promise<void> => {
  try {
    await db
      .delete(snmpCredentialsTable)
      .where(eq(snmpCredentialsTable.id, req.params.credentialId));
    res.status(204).send();
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to delete credential");
    res.status(500).json({ error: "Failed to delete credential" });
    return;
  }
});

router.get("/runs", async (req, res): Promise<void> => {
  try {
    const runs = await listDiscoveryRuns();
    const running = await countRunningDiscoveryRuns();
    res.json({ runs, running });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to list discovery runs");
    res.status(500).json({ error: "Failed to list discovery runs" });
    return;
  }
});

router.get("/runs/:runId", async (req, res): Promise<void> => {
  try {
    const run = await getDiscoveryRun(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "Discovery run not found" });
      return;
    }
    res.json(run);
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to get discovery run");
    res.status(500).json({ error: "Failed to get discovery run" });
    return;
  }
});

router.post("/clear", async (req, res): Promise<void> => {
  try {
    const { scopeId, cidr, rangeStartIp, rangeEndIp, removeNodes = true } = req.body ?? {};
    if (!scopeId && !cidr && !(rangeStartIp && rangeEndIp)) {
      res.status(400).json({
        error: "scopeId, cidr, or rangeStartIp/rangeEndIp is required",
      });
      return;
    }

    const result = await clearDiscoveryData({
      scopeId: scopeId ? String(scopeId) : null,
      cidr: cidr ? String(cidr).trim() : null,
      rangeStartIp: rangeStartIp ? String(rangeStartIp).trim() : null,
      rangeEndIp: rangeEndIp ? String(rangeEndIp).trim() : null,
      removeNodes: Boolean(removeNodes),
    });

    res.json({
      ...result,
      message:
        result.mode === "scope"
          ? `Limpeza concluída para o escopo informado. ${result.removedRuns} execução(ões) e ${result.removedNodes} dispositivo(s) removidos.`
          : `Limpeza concluída para o alvo informado. ${result.removedRuns} execução(ões) e ${result.removedNodes} dispositivo(s) removidos.`,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to clear discovery data");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to clear discovery data" });
    return;
  }
});

router.post("/runs", async (req, res): Promise<void> => {
  try {
    if (!applyDiscoveryRateLimit(req, res)) {
      return;
    }
    const {
      scopeIds,
      cidrs,
      credentialId,
      rangeStartIp,
      rangeEndIp,
      primaryRouterIp,
      primaryRouterName,
    } = req.body ?? {};
    const queuedRuns = [];

    if (Array.isArray(scopeIds) && scopeIds.length > 0) {
      queuedRuns.push(...(await queueDiscoveryRunsForScopes(scopeIds)));
    }

    if (Array.isArray(cidrs) && cidrs.length > 0) {
      for (const cidr of cidrs) {
        queuedRuns.push(
          await queueDiscoveryRun({
            cidr: String(cidr),
            credentialId: credentialId ? String(credentialId) : null,
          }),
        );
      }
    }

    if (rangeStartIp && rangeEndIp) {
      queuedRuns.push(
        await queueDiscoveryRun({
          rangeStartIp: String(rangeStartIp).trim(),
          rangeEndIp: String(rangeEndIp).trim(),
          primaryRouterIp: primaryRouterIp ? String(primaryRouterIp).trim() : null,
          primaryRouterName: primaryRouterName ? String(primaryRouterName).trim() : null,
          credentialId: credentialId ? String(credentialId) : null,
        }),
      );
    }

    if (queuedRuns.length === 0) {
      res.status(400).json({
        error: "Provide at least one scopeId, cidr, or rangeStartIp/rangeEndIp to start discovery",
      });
      return;
    }

    res.status(202).json({
      queued: queuedRuns.length,
      runs: queuedRuns,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to queue discovery runs");
    res.status(500).json({ error: "Failed to queue discovery runs" });
    return;
  }
});

router.post("/scan", async (req, res): Promise<void> => {
  try {
    if (!applyDiscoveryRateLimit(req, res)) {
      return;
    }
    const {
      subnet,
      scopeId,
      credentialId,
      rangeStartIp,
      rangeEndIp,
      primaryRouterIp,
      primaryRouterName,
      snmpCommunity,
      snmpVersion,
    } = req.body ?? {};

    if (scopeId) {
      const scope = await getScope(String(scopeId));
      if (!scope) {
        res.status(404).json({ error: "Scope not found" });
        return;
      }
      const run = await queueDiscoveryRun({
        cidr: scope.cidr,
        rangeStartIp: scope.rangeStartIp,
        rangeEndIp: scope.rangeEndIp,
        primaryRouterIp: scope.primaryRouterIp,
        primaryRouterName: scope.primaryRouterName,
        scopeId: scope.id,
        scopeName: scope.name,
        credentialId:
          credentialId != null
            ? String(credentialId)
            : (scope.defaultCredentialId ?? null),
      });
      res.status(202).json({
        scanId: run.id,
        subnet: scope.cidr ?? `${scope.rangeStartIp}-${scope.rangeEndIp}`,
        status: run.status,
        message: `Discovery iniciado para o escopo ${scope.name}`,
      });
      return;
    }

    if (!subnet && !(rangeStartIp && rangeEndIp)) {
      res.status(400).json({
        error: "subnet, rangeStartIp/rangeEndIp, or scopeId is required",
      });
      return;
    }

    let resolvedCredentialId: string | null = credentialId ? String(credentialId) : null;
    if (!resolvedCredentialId && (snmpCommunity || snmpVersion)) {
      const targetLabel = subnet
        ? String(subnet).trim()
        : `${String(rangeStartIp).trim()}-${String(rangeEndIp).trim()}`;
      const tempCredential = {
        id: randomUUID(),
        name: `temporary-${targetLabel}`,
        version:
          snmpVersion === "v1" || snmpVersion === "v3" ? snmpVersion : "v2c",
        community: snmpCommunity ? String(snmpCommunity) : "public",
        username: null,
        authProtocol: "none" as const,
        authPassword: null,
        privProtocol: "none" as const,
        privPassword: null,
        port: 161,
        timeoutMs: 2000,
        retries: 1,
        enabled: true,
        createdAt: new Date(),
      };
      await db.insert(snmpCredentialsTable).values(tempCredential);
      resolvedCredentialId = tempCredential.id;
    }

    const run = await queueDiscoveryRun({
      cidr: subnet ? String(subnet).trim() : null,
      rangeStartIp: rangeStartIp ? String(rangeStartIp).trim() : null,
      rangeEndIp: rangeEndIp ? String(rangeEndIp).trim() : null,
      primaryRouterIp: primaryRouterIp ? String(primaryRouterIp).trim() : null,
      primaryRouterName: primaryRouterName ? String(primaryRouterName).trim() : null,
      credentialId: resolvedCredentialId,
    });

    const targetLabel = subnet
      ? String(subnet).trim()
      : `${String(rangeStartIp).trim()}-${String(rangeEndIp).trim()}`;
    res.status(202).json({
      scanId: run.id,
      subnet: targetLabel,
      status: run.status,
      message: `Discovery scan started for target ${targetLabel}`,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to start discovery");
    res.status(500).json({ error: "Failed to start discovery" });
    return;
  }
});

export default router;
