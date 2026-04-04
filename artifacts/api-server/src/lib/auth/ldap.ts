import { isLdapConfigured } from "./config";
import { logger } from "../logger";

/**
 * Valida credenciais contra LDAP (bind simples com DN derivado do modelo).
 * Variáveis: AUTH_LDAP_URL, AUTH_LDAP_USER_DN_TEMPLATE (use {{username}}).
 * Nunca lança: falhas de rede, URL inválida ou módulo em falta — o login **local** continua a funcionar.
 */
export async function tryLdapBind(
  username: string,
  password: string,
): Promise<{ dn: string } | null> {
  if (!isLdapConfigured()) return null;

  const url = process.env.AUTH_LDAP_URL!.trim();
  const template = process.env.AUTH_LDAP_USER_DN_TEMPLATE!.trim();
  const dn = template.replace(/\{\{\s*username\s*\}\}/gi, username);

  try {
    const { Client } = await import("ldapts");
    const client = new Client({ url });
    try {
      await client.bind(dn, password);
      await client.unbind();
      return { dn };
    } catch {
      try {
        await client.unbind();
      } catch {
        /* ignore */
      }
      return null;
    }
  } catch (err) {
    logger.warn(
      { err, username },
      "LDAP indisponível ou mal configurado — contas locais não são afetadas; corrija AUTH_LDAP_* se precisar de LDAP.",
    );
    return null;
  }
}
