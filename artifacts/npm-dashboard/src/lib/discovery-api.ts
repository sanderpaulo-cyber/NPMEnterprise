import { authFetch } from "@/lib/auth-fetch";

export interface NetworkScope {
  id: string;
  name: string;
  cidr?: string | null;
  rangeStartIp?: string | null;
  rangeEndIp?: string | null;
  primaryRouterIp?: string | null;
  primaryRouterName?: string | null;
  site?: string | null;
  description?: string | null;
  enabled: boolean;
  priority: number;
  defaultCredentialId?: string | null;
  lastRunAt?: string | null;
  createdAt: string;
}

export interface SnmpCredential {
  id: string;
  name: string;
  version: "v1" | "v2c" | "v3";
  community?: string | null;
  username?: string | null;
  authProtocol:
    | "none"
    | "md5"
    | "sha"
    | "sha224"
    | "sha256"
    | "sha384"
    | "sha512";
  authPassword?: string | null;
  privProtocol: "none" | "des" | "aes";
  privPassword?: string | null;
  port: number;
  timeoutMs: number;
  retries: number;
  enabled: boolean;
  createdAt: string;
}

export interface DiscoveryRun {
  id: string;
  scopeId?: string | null;
  scopeName?: string | null;
  cidr: string;
  credentialId?: string | null;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  hostsTotal: number;
  hostsScanned: number;
  hostsResponsive: number;
  hostsDiscovered: number;
  errorsCount: number;
  message?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

async function discoveryRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function listScopes() {
  return discoveryRequest<{ scopes: NetworkScope[] }>("/api/discovery/scopes");
}

export function createScope(payload: {
  name: string;
  cidr?: string | null;
  rangeStartIp?: string | null;
  rangeEndIp?: string | null;
  primaryRouterIp?: string | null;
  primaryRouterName?: string | null;
  site?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  defaultCredentialId?: string | null;
}) {
  return discoveryRequest<NetworkScope>("/api/discovery/scopes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteScope(scopeId: string) {
  return discoveryRequest<void>(`/api/discovery/scopes/${scopeId}`, {
    method: "DELETE",
  });
}

export function listCredentials() {
  return discoveryRequest<{ credentials: SnmpCredential[] }>("/api/discovery/credentials");
}

export function createCredential(payload: {
  name: string;
  version: "v1" | "v2c" | "v3";
  community?: string;
  username?: string;
  authProtocol?: SnmpCredential["authProtocol"];
  authPassword?: string;
  privProtocol?: SnmpCredential["privProtocol"];
  privPassword?: string;
  port?: number;
  timeoutMs?: number;
  retries?: number;
  enabled?: boolean;
}) {
  return discoveryRequest<SnmpCredential>("/api/discovery/credentials", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteCredential(credentialId: string) {
  return discoveryRequest<void>(`/api/discovery/credentials/${credentialId}`, {
    method: "DELETE",
  });
}

export function listRuns() {
  return discoveryRequest<{ runs: DiscoveryRun[]; running: number }>("/api/discovery/runs");
}

export function queueDiscoveryRuns(payload: {
  scopeIds?: string[];
  cidrs?: string[];
  rangeStartIp?: string | null;
  rangeEndIp?: string | null;
  primaryRouterIp?: string | null;
  primaryRouterName?: string | null;
  credentialId?: string | null;
}) {
  return discoveryRequest<{ queued: number; runs: DiscoveryRun[] }>("/api/discovery/runs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function clearDiscovery(payload: {
  scopeId?: string | null;
  cidr?: string | null;
  rangeStartIp?: string | null;
  rangeEndIp?: string | null;
  removeNodes?: boolean;
}) {
  return discoveryRequest<{
    removedRuns: number;
    removedNodes: number;
    target: string;
    mode: "scope" | "target";
    message: string;
  }>("/api/discovery/clear", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
