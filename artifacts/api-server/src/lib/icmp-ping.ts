import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PingResult = { ok: true; rttMs: number } | { ok: false };

function pingArgs(host: string, timeoutMs: number): string[] {
  if (process.platform === "win32") {
    return ["-n", "1", "-w", String(timeoutMs), host];
  }
  if (process.platform === "darwin") {
    const w = Math.min(Math.max(timeoutMs, 500), 10000);
    return ["-c", "1", "-W", String(w), host];
  }
  const wSec = Math.max(1, Math.ceil(timeoutMs / 1000));
  return ["-c", "1", "-W", String(wSec), host];
}

function parsePingOutput(output: string): PingResult {
  const lower = output.toLowerCase();
  if (
    lower.includes("request timed out") ||
    lower.includes("esgotado o tempo limite") ||
    lower.includes("host de destino inacessível") ||
    lower.includes("destination host unreachable") ||
    lower.includes("100% packet loss") ||
    lower.includes("perda de pacotes 100%") ||
    lower.includes("transmit failed") ||
    lower.includes("could not find host") ||
    lower.includes("não foi possível encontrar o host")
  ) {
    return { ok: false };
  }

  const m = output.match(/(?:time|tempo)[=<](<?\d+(?:\.\d+)?)\s*m?s/i);
  if (!m) return { ok: false };

  const raw = m[1];
  if (raw.startsWith("<")) {
    const n = parseFloat(raw.slice(1));
    return { ok: true, rttMs: Number.isFinite(n) ? Math.max(n, 0.1) : 0.5 };
  }
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, rttMs: n };
}

/**
 * Um ICMP echo (via `ping` do sistema). Usa latência real quando há resposta.
 */
export async function icmpPingOnce(
  host: string,
  timeoutMs = 5000,
): Promise<PingResult> {
  const args = pingArgs(host, timeoutMs);
  try {
    const { stdout } = await execFileAsync("ping", args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return parsePingOutput(stdout);
  } catch (err: unknown) {
    const stdout =
      err && typeof err === "object" && "stdout" in err
        ? String((err as { stdout?: string }).stdout ?? "")
        : "";
    if (stdout) {
      const parsed = parsePingOutput(stdout);
      if (parsed.ok) return parsed;
    }
    return { ok: false };
  }
}
