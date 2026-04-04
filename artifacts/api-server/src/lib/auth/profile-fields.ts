/**
 * Campos opcionais de cadastro (comuns ao registo e à gestão de utilizadores).
 * `notes`: observações internas — apenas administradas via POST/PATCH /api/users.
 */

export type ComplementaryProfile = {
  email: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  notes: string | null;
};

const MAX_EMAIL = 254;
const MAX_PHONE = 48;
const MAX_SHORT = 160;
const MAX_NOTES = 4000;

const EMAIL_RE =
  /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;

function trimOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function parseComplementaryProfile(
  body: Record<string, unknown>,
  options: { allowNotes: boolean },
):
  | { ok: true; profile: ComplementaryProfile }
  | { ok: false; message: string } {
  const emailRaw = trimOrNull(body.email);
  let email: string | null = null;
  if (emailRaw) {
    const e = emailRaw.toLowerCase();
    if (e.length > MAX_EMAIL) {
      return { ok: false, message: "Email demasiado longo." };
    }
    if (!EMAIL_RE.test(e)) {
      return { ok: false, message: "Email com formato invalido." };
    }
    email = e;
  }

  const phoneRaw = trimOrNull(body.phone);
  if (phoneRaw && phoneRaw.length > MAX_PHONE) {
    return { ok: false, message: "Telefone: maximo 48 caracteres." };
  }

  const departmentRaw = trimOrNull(body.department);
  if (departmentRaw && departmentRaw.length > MAX_SHORT) {
    return { ok: false, message: "Departamento: maximo 160 caracteres." };
  }

  const jobTitleRaw = trimOrNull(body.jobTitle);
  if (jobTitleRaw && jobTitleRaw.length > MAX_SHORT) {
    return { ok: false, message: "Cargo: maximo 160 caracteres." };
  }

  let notes: string | null = null;
  if (options.allowNotes) {
    const notesRaw = trimOrNull(body.notes);
    if (notesRaw && notesRaw.length > MAX_NOTES) {
      return { ok: false, message: "Notas: maximo 4000 caracteres." };
    }
    notes = notesRaw;
  }

  return {
    ok: true,
    profile: {
      email,
      phone: phoneRaw,
      department: departmentRaw,
      jobTitle: jobTitleRaw,
      notes,
    },
  };
}

export function emptyProfile(): ComplementaryProfile {
  return {
    email: null,
    phone: null,
    department: null,
    jobTitle: null,
    notes: null,
  };
}

/** PATCH parcial: só chaves presentes em `body` são validadas e devolvidas. */
export function parsePartialComplementary(
  body: Record<string, unknown>,
  options: { allowNotes: boolean },
):
  | { ok: true; patch: Partial<ComplementaryProfile> }
  | { ok: false; message: string } {
  const patch: Partial<ComplementaryProfile> = {};

  if ("email" in body) {
    if (body.email === null) {
      patch.email = null;
    } else {
      const emailRaw = trimOrNull(body.email);
      if (!emailRaw) {
        patch.email = null;
      } else {
        const e = emailRaw.toLowerCase();
        if (e.length > MAX_EMAIL) {
          return { ok: false, message: "Email demasiado longo." };
        }
        if (!EMAIL_RE.test(e)) {
          return { ok: false, message: "Email com formato invalido." };
        }
        patch.email = e;
      }
    }
  }

  if ("phone" in body) {
    if (body.phone === null) {
      patch.phone = null;
    } else {
      const p = trimOrNull(body.phone);
      if (p && p.length > MAX_PHONE) {
        return { ok: false, message: "Telefone: maximo 48 caracteres." };
      }
      patch.phone = p;
    }
  }

  if ("department" in body) {
    if (body.department === null) {
      patch.department = null;
    } else {
      const d = trimOrNull(body.department);
      if (d && d.length > MAX_SHORT) {
        return { ok: false, message: "Departamento: maximo 160 caracteres." };
      }
      patch.department = d;
    }
  }

  if ("jobTitle" in body) {
    if (body.jobTitle === null) {
      patch.jobTitle = null;
    } else {
      const j = trimOrNull(body.jobTitle);
      if (j && j.length > MAX_SHORT) {
        return { ok: false, message: "Cargo: maximo 160 caracteres." };
      }
      patch.jobTitle = j;
    }
  }

  if (options.allowNotes && "notes" in body) {
    if (body.notes === null) {
      patch.notes = null;
    } else {
      const n = trimOrNull(body.notes);
      if (n && n.length > MAX_NOTES) {
        return { ok: false, message: "Notas: maximo 4000 caracteres." };
      }
      patch.notes = n;
    }
  }

  return { ok: true, patch };
}
