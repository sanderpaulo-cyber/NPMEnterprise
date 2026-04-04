import { Router, type IRouter, type Request, type Response } from "express";
import {
  includeTokenInLoginBody,
  isAuthEnabled,
  isLdapConfigured,
  isRegisterAllowed,
} from "../lib/auth/config";
import {
  attachSessionCookie,
  clearSessionCookie,
} from "../lib/auth/cookies";
import {
  parseComplementaryProfile,
  parsePartialComplementary,
} from "../lib/auth/profile-fields";
import {
  adminUpdateUser,
  getUserById,
  loginWithPassword,
  registerLocalUser,
  rowToSessionUser,
} from "../lib/auth/service";
import { verifyAuthToken } from "../lib/auth/jwt";
import {
  createRateLimiter,
} from "../lib/auth/rate-limit";
import { getRequestAuthToken } from "../middleware/auth-gateway";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const loginLimiter = createRateLimiter(30, 15 * 60 * 1000);
const registerLimiter = createRateLimiter(8, 60 * 60 * 1000);

router.get("/status", (_req: Request, res: Response): void => {
  res.json({
    authRequired: isAuthEnabled(),
    ldapConfigured: isLdapConfigured(),
    registerAllowed: isRegisterAllowed(),
    methods: ["local", ...(isLdapConfigured() ? (["ldap"] as const) : [])],
    future: ["oauth2", "saml"],
    sessionCookie: true,
  });
});

router.get("/providers", (_req: Request, res: Response): void => {
  res.json({
    local: { enabled: true },
    ldap: {
      configured: isLdapConfigured(),
      hint: isLdapConfigured()
        ? "Login com as mesmas credenciais do directório (apos falha ou ausencia de conta local)."
        : "Defina AUTH_LDAP_URL e AUTH_LDAP_USER_DN_TEMPLATE para activar.",
    },
    oauth2: { enabled: false, note: "Reservado para integracao futura" },
    saml: { enabled: false, note: "Reservado para integracao futura" },
  });
});

async function loginFailedDelay(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 70 + Math.random() * 130));
}

router.post(
  "/login",
  loginLimiter,
  async (req: Request, res: Response): Promise<void> => {
    if (!isAuthEnabled()) {
      res
        .status(400)
        .json({ error: "Autenticacao desactivada (AUTH_ENABLED!=true)" });
      return;
    }

    const username =
      typeof req.body?.username === "string" ? req.body.username : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    try {
      const result = await loginWithPassword(username, password);
      attachSessionCookie(res, req, result.token);
      const body: {
        user: typeof result.user;
        token?: string;
      } = { user: result.user };
      if (includeTokenInLoginBody()) {
        body.token = result.token;
      }
      res.json(body);
    } catch (e) {
      await loginFailedDelay();
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "AUTH_DISABLED") {
        res.status(403).json({ error: "Conta desativada" });
        return;
      }
      res.status(401).json({ error: "Credenciais invalidas" });
    }
  },
);

router.post(
  "/register",
  registerLimiter,
  async (req: Request, res: Response): Promise<void> => {
    if (!isAuthEnabled()) {
      res.status(400).json({ error: "Autenticacao desactivada" });
      return;
    }
    if (!isRegisterAllowed()) {
      res.status(403).json({ error: "Registo publico desactivado" });
      return;
    }

    const username =
      typeof req.body?.username === "string" ? req.body.username : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const displayName =
      typeof req.body?.displayName === "string" ? req.body.displayName : undefined;

    const prof = parseComplementaryProfile(
      req.body as Record<string, unknown>,
      { allowNotes: false },
    );
    if (!prof.ok) {
      res.status(400).json({ error: prof.message });
      return;
    }

    try {
      const user = await registerLocalUser(
        username,
        password,
        displayName,
        prof.profile,
      );
      res.status(201).json({ user });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "AUTH_DUPLICATE") {
        res.status(409).json({ error: "Username ja existe" });
        return;
      }
      if (code === "AUTH_EMAIL_TAKEN") {
        res.status(409).json({ error: (e as Error).message });
        return;
      }
      if (code === "AUTH_VALIDATION") {
        res.status(400).json({ error: (e as Error).message });
        return;
      }
      res.status(400).json({ error: "Nao foi possivel registar" });
    }
  },
);

router.post("/logout", (req: Request, res: Response): void => {
  clearSessionCookie(res, req);
  res.status(204).end();
});

router.get("/me", async (req: Request, res: Response): Promise<void> => {
  if (!isAuthEnabled()) {
    res.json({ authRequired: false });
    return;
  }

  const token = getRequestAuthToken(req);
  if (!token) {
    res.status(401).json({ error: "Nao autenticado" });
    return;
  }

  try {
    const a = await verifyAuthToken(token);
    const row = await getUserById(a.userId);
    if (!row || row.disabled) {
      res.status(401).json({ error: "Sessao invalida" });
      return;
    }
    res.json({
      user: rowToSessionUser(row),
    });
  } catch {
    res.status(401).json({ error: "Token invalido" });
  }
});

/** Actualiza o perfil da sessao actual (sem precisar do UUID em /api/users/:id). */
router.patch("/me", async (req: Request, res: Response): Promise<void> => {
  if (!isAuthEnabled()) {
    res.status(400).json({ error: "Autenticacao desactivada" });
    return;
  }

  const token = getRequestAuthToken(req);
  if (!token) {
    res.status(401).json({ error: "Nao autenticado" });
    return;
  }

  try {
    const a = await verifyAuthToken(token);
    const row = await getUserById(a.userId);
    if (!row || row.disabled) {
      res.status(401).json({ error: "Sessao invalida" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const patch: Parameters<typeof adminUpdateUser>[1] = {};

    if (typeof body.username === "string" && body.username.trim().length > 0) {
      patch.username = body.username.trim();
    }
    if ("displayName" in body) {
      patch.displayName =
        typeof body.displayName === "string" ? body.displayName : null;
    }
    if (typeof body.password === "string" && body.password.length > 0) {
      patch.password = body.password;
    }

    const prof = parsePartialComplementary(body, { allowNotes: true });
    if (!prof.ok) {
      res.status(400).json({ error: prof.message });
      return;
    }
    Object.assign(patch, prof.patch);

    const updated = await adminUpdateUser(row.id, patch, row.id);
    res.json({ user: rowToSessionUser(updated) });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "AUTH_VALIDATION" || code === "AUTH_SELF") {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
    if (code === "AUTH_DUPLICATE" || code === "AUTH_EMAIL_TAKEN") {
      res.status(409).json({ error: (e as Error).message });
      return;
    }
    logger.error({ err: e }, "PATCH /me falhou");
    res.status(500).json({ error: "Falha ao actualizar perfil" });
  }
});

export default router;
