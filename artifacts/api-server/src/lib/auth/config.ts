export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true";
}

export function isRegisterAllowed(): boolean {
  return process.env.AUTH_ALLOW_REGISTER === "true";
}

export function getJwtSecret(): string {
  const s = process.env.AUTH_JWT_SECRET?.trim();
  if (!s || s.length < 16) {
    throw new Error(
      "AUTH_JWT_SECRET em falta ou demasiado curto (minimo 16 caracteres) quando AUTH_ENABLED=true.",
    );
  }
  return s;
}

export function getTokenExpiryHours(): number {
  const raw = Number.parseInt(process.env.AUTH_TOKEN_EXPIRY_HOURS ?? "12", 10);
  if (Number.isNaN(raw) || raw < 1) return 12;
  return Math.min(raw, 168);
}

export function isLdapConfigured(): boolean {
  const url = process.env.AUTH_LDAP_URL?.trim();
  const tpl = process.env.AUTH_LDAP_USER_DN_TEMPLATE?.trim();
  return Boolean(url && tpl);
}

export function getJwtIssuer(): string {
  return process.env.AUTH_JWT_ISSUER?.trim() || "networksentinel";
}

export function getJwtAudience(): string {
  return process.env.AUTH_JWT_AUDIENCE?.trim() || "npm-dashboard";
}

/** Incluir token JWT no JSON do login (menos seguro; para clientes sem cookies). */
export function includeTokenInLoginBody(): boolean {
  return process.env.AUTH_LOGIN_BODY_TOKEN === "true";
}
