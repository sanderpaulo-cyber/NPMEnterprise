import { randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  networkScopesTable,
  snmpCredentialsTable,
} from "@workspace/db/schema";
import {
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
      site,
      description,
      enabled = true,
      priority = 100,
      defaultCredentialId,
    } = req.body ?? {};
    if (!name || !cidr) {
      res.status(400).json({ error: "name and cidr are required" });
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
      cidr: String(cidr),
      site: site ? String(site) : null,
      description: description ? String(description) : null,
      enabled: Boolean(enabled),
      priority: Number(priority) || 100,
      defaultCredentialId: defaultCredentialId ? String(defaultCredentialId) : null,
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

router.post("/runs", async (req, res): Promise<void> => {
  try {
    const { scopeIds, cidrs, credentialId } = req.body ?? {};
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

    if (queuedRuns.length === 0) {
      res.status(400).json({
        error: "Provide at least one scopeId or cidr to start discovery",
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
    const {
      subnet,
      scopeId,
      credentialId,
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
        scopeId: scope.id,
        scopeName: scope.name,
        credentialId:
          credentialId != null
            ? String(credentialId)
            : (scope.defaultCredentialId ?? null),
      });
      res.status(202).json({
        scanId: run.id,
        subnet: scope.cidr,
        status: run.status,
        message: `Discovery iniciado para o escopo ${scope.name}`,
      });
      return;
    }

    if (!subnet) {
      res.status(400).json({ error: "subnet or scopeId is required" });
      return;
    }

    let resolvedCredentialId: string | null = credentialId ? String(credentialId) : null;
    if (!resolvedCredentialId && (snmpCommunity || snmpVersion)) {
      const tempCredential = {
        id: randomUUID(),
        name: `temporary-${subnet}`,
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
      cidr: String(subnet),
      credentialId: resolvedCredentialId,
    });

    res.status(202).json({
      scanId: run.id,
      subnet,
      status: run.status,
      message: `Discovery scan started for subnet ${subnet}`,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to start discovery");
    res.status(500).json({ error: "Failed to start discovery" });
    return;
  }
});

export default router;
