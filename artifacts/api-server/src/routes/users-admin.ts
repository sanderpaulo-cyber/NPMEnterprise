import type { NextFunction, Request, Response } from "express";
import { Router, type IRouter } from "express";
import { isAuthEnabled } from "../lib/auth/config";
import {
  parseComplementaryProfile,
  parsePartialComplementary,
} from "../lib/auth/profile-fields";
import {
  adminDeleteUser,
  adminUpdateUser,
  listAuthUsersForAdmin,
  registerLocalUser,
} from "../lib/auth/service";

const router: IRouter = Router();

function requireEnabledAndSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isAuthEnabled()) {
    res.status(404).json({
      error: "Gestao de utilizadores disponivel apenas com AUTH_ENABLED=true.",
    });
    return;
  }
  if (!req.auth?.userId) {
    res.status(401).json({ error: "Nao autenticado" });
    return;
  }
  next();
}

router.use(requireEnabledAndSession);

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await listAuthUsersForAdmin();
    res.json({ users });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Falha ao listar utilizadores",
    });
  }
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const username =
    typeof req.body?.username === "string" ? req.body.username : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  const displayName =
    typeof req.body?.displayName === "string" ? req.body.displayName : undefined;

  const prof = parseComplementaryProfile(
    req.body as Record<string, unknown>,
    { allowNotes: true },
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
    res.status(400).json({ error: "Nao foi possivel criar utilizador" });
  }
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) {
    res.status(400).json({ error: "Id invalido" });
    return;
  }

  const body = req.body as Record<string, unknown>;

  const patch: Parameters<typeof adminUpdateUser>[1] = {};

  if ("displayName" in body) {
    patch.displayName =
      typeof body.displayName === "string" ? body.displayName : null;
  }
  if (typeof body.disabled === "boolean") {
    patch.disabled = body.disabled;
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    patch.password = body.password;
  }
  if (typeof body.username === "string" && body.username.trim().length > 0) {
    patch.username = body.username.trim();
  }

  const prof = parsePartialComplementary(body, { allowNotes: true });
  if (!prof.ok) {
    res.status(400).json({ error: prof.message });
    return;
  }
  Object.assign(patch, prof.patch);

  try {
    const updated = await adminUpdateUser(id, patch, req.auth!.userId);
    res.json({
      user: {
        id: updated.id,
        username: updated.username,
        displayName: updated.displayName,
        authSource: updated.authSource,
        disabled: updated.disabled,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        externalSubject: updated.externalSubject,
        email: updated.email,
        phone: updated.phone,
        department: updated.department,
        jobTitle: updated.jobTitle,
        notes: updated.notes,
        hasLocalPassword:
          updated.passwordHash != null && updated.passwordHash.length > 0,
      },
    });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "AUTH_NOT_FOUND") {
      res.status(404).json({ error: (e as Error).message });
      return;
    }
    if (code === "AUTH_DUPLICATE") {
      res.status(409).json({ error: (e as Error).message });
      return;
    }
    if (code === "AUTH_EMAIL_TAKEN") {
      res.status(409).json({ error: (e as Error).message });
      return;
    }
    if (code === "AUTH_SELF" || code === "AUTH_VALIDATION") {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
    res.status(500).json({ error: "Falha ao actualizar utilizador" });
  }
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) {
    res.status(400).json({ error: "Id invalido" });
    return;
  }

  try {
    await adminDeleteUser(id, req.auth!.userId);
    res.status(204).end();
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "AUTH_NOT_FOUND") {
      res.status(404).json({ error: (e as Error).message });
      return;
    }
    if (code === "AUTH_SELF" || code === "AUTH_LAST_USER") {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
    res.status(500).json({ error: "Falha ao remover utilizador" });
  }
});

export default router;
