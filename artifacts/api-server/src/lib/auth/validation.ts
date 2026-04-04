/** Login: minusculas, numeros, . _ - @ + (para estilo email interno). */
const USER_RE = /^[a-z0-9._@+\-]{2,64}$/;

export function validateUsernameForRegister(raw: string): string | null {
  const u = raw.trim().toLowerCase();
  if (!USER_RE.test(u)) {
    return "Utilizador: 2–64 caracteres (minusculas, numeros, . _ - @ +).";
  }
  return null;
}

/**
 * Politica minima: 10–128 caracteres e tres das quatro classes (maiuscula, minuscula, digito, simbolo).
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) {
    return "Password: minimo 10 caracteres.";
  }
  if (password.length > 128) {
    return "Password: maximo 128 caracteres.";
  }
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(password)) classes += 1;
  if (classes < 3) {
    return "Password: combine pelo menos 3 tipos (minusculas, maiusculas, numeros, simbolos).";
  }
  return null;
}
