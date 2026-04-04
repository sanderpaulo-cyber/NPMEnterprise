import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  setAuthTokenGetter,
  setDefaultCredentials,
} from "@workspace/api-client-react";
import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/auth-token";
import { sameOriginApiUrl } from "@/lib/same-origin-api";

type AuthStatusResponse = {
  authRequired: boolean;
  ldapConfigured?: boolean;
  registerAllowed?: boolean;
  methods?: string[];
  sessionCookie?: boolean;
};

/** Dados públicos do utilizador devolvidos pelo login e GET /api/auth/me. */
export type SessionUserSnapshot = {
  id: string;
  username: string;
  displayName: string | null;
  avatarEmoji: string | null;
  avatarImageUrl: string | null;
};

type AuthContextValue = {
  ready: boolean;
  authRequired: boolean;
  isAuthenticated: boolean;
  /** Token Bearer opcional (AUTH_LOGIN_BODY_TOKEN); caso contrário sessão via cookie HttpOnly */
  accessToken: string | null;
  ldapConfigured: boolean;
  registerAllowed: boolean;
  username: string | null;
  userId: string | null;
  displayName: string | null;
  avatarEmoji: string | null;
  avatarImageUrl: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Rele /api/auth/me (apos mudar nome de login ou dados no servidor). */
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const fetchAuth: typeof fetch = (input, init) => {
  const resolved =
    typeof input === "string" && input.startsWith("/api")
      ? sameOriginApiUrl(input)
      : input;
  return fetch(resolved, { ...init, credentials: "include" });
};

function applyUserFromMe(
  body: { user?: SessionUserSnapshot },
  setters: {
    setUsername: (v: string | null) => void;
    setUserId: (v: string | null) => void;
    setDisplayName: (v: string | null) => void;
    setAvatarEmoji: (v: string | null) => void;
    setAvatarImageUrl: (v: string | null) => void;
  },
): void {
  const u = body.user;
  setters.setUsername(u?.username ?? null);
  setters.setUserId(u?.id ?? null);
  setters.setDisplayName(u?.displayName ?? null);
  setters.setAvatarEmoji(u?.avatarEmoji ?? null);
  setters.setAvatarImageUrl(u?.avatarImageUrl ?? null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [ldapConfigured, setLdapConfigured] = useState(false);
  const [registerAllowed, setRegisterAllowed] = useState(false);
  const [bearerToken, setBearerToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarEmoji, setAvatarEmoji] = useState<string | null>(null);
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setDefaultCredentials("include");
    return () => setDefaultCredentials(null);
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => bearerToken);
    return () => setAuthTokenGetter(null);
  }, [bearerToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchAuth("/api/auth/status");
        const s = (await r.json()) as AuthStatusResponse;
        if (cancelled) return;
        setAuthRequired(Boolean(s.authRequired));
        setLdapConfigured(Boolean(s.ldapConfigured));
        setRegisterAllowed(Boolean(s.registerAllowed));

        if (!s.authRequired) {
          setBearerToken(null);
          setUsername(null);
          setUserId(null);
          setDisplayName(null);
          setAvatarEmoji(null);
          setAvatarImageUrl(null);
          setReady(true);
          return;
        }

        const me = await fetchAuth("/api/auth/me");
        if (cancelled) return;
        if (me.ok) {
          const body = (await me.json()) as { user?: SessionUserSnapshot };
          applyUserFromMe(body, {
            setUsername,
            setUserId,
            setDisplayName,
            setAvatarEmoji,
            setAvatarImageUrl,
          });
          setBearerToken(null);
        } else {
          setUsername(null);
          setUserId(null);
          setDisplayName(null);
          setAvatarEmoji(null);
          setAvatarImageUrl(null);
          setBearerToken(null);
          try {
            sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
          } catch {
            /* ignore */
          }
        }
        setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (user: string, pass: string) => {
    const r = await fetchAuth("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: user.trim(),
        password: typeof pass === "string" ? pass.trim() : pass,
      }),
    });
    if (!r.ok) {
      const err = (await r.json().catch(() => ({}))) as { error?: string };
      if (r.status === 429) {
        throw new Error(err.error ?? "Demasiadas tentativas. Aguarde.");
      }
      throw new Error(err.error ?? "Falha no login");
    }
    const data = (await r.json()) as {
      user: SessionUserSnapshot;
      token?: string;
    };
    if (data.token) {
      try {
        sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.token);
      } catch {
        /* ignore */
      }
      setBearerToken(data.token);
    } else {
      try {
        sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setBearerToken(null);
    }
    setUsername(data.user.username);
    setUserId(data.user.id);
    setDisplayName(data.user.displayName ?? null);
    setAvatarEmoji(data.user.avatarEmoji ?? null);
    setAvatarImageUrl(data.user.avatarImageUrl ?? null);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const me = await fetchAuth("/api/auth/me");
      if (me.ok) {
        const body = (await me.json()) as { user?: SessionUserSnapshot };
        applyUserFromMe(body, {
          setUsername,
          setUserId,
          setDisplayName,
          setAvatarEmoji,
          setAvatarImageUrl,
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetchAuth("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setBearerToken(null);
    setUsername(null);
    setUserId(null);
    setDisplayName(null);
    setAvatarEmoji(null);
    setAvatarImageUrl(null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      authRequired,
      isAuthenticated: Boolean(username),
      accessToken: bearerToken,
      ldapConfigured,
      registerAllowed,
      username,
      userId,
      displayName,
      avatarEmoji,
      avatarImageUrl,
      login,
      logout,
      refreshSession,
    }),
    [
      ready,
      authRequired,
      username,
      userId,
      displayName,
      avatarEmoji,
      avatarImageUrl,
      bearerToken,
      ldapConfigured,
      registerAllowed,
      login,
      logout,
      refreshSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve estar dentro de AuthProvider");
  }
  return ctx;
}
