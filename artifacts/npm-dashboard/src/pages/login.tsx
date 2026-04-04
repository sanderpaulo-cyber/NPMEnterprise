import { useMemo, useState } from "react";
import { Redirect } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Eye, EyeOff, Lock, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

function passwordStrength(pw: string): { pct: number; label: string } {
  if (!pw) return { pct: 0, label: "" };
  let score = 0;
  if (pw.length >= 10) score += 22;
  if (pw.length >= 14) score += 12;
  if (pw.length >= 18) score += 10;
  const types = [
    /[a-z]/.test(pw),
    /[A-Z]/.test(pw),
    /[0-9]/.test(pw),
    /[^a-zA-Z0-9]/.test(pw),
  ].filter(Boolean).length;
  score += types * 14;
  const pct = Math.min(100, score);
  if (pct < 40) return { pct, label: "Fraca" };
  if (pct < 70) return { pct, label: "Razoável" };
  return { pct, label: "Forte" };
}

export default function LoginPage() {
  const { ready, authRequired, isAuthenticated, login, registerAllowed, ldapConfigured } =
    useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regDepartment, setRegDepartment] = useState("");
  const [regJobTitle, setRegJobTitle] = useState("");
  const [tab, setTab] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  if (ready && !authRequired) {
    return <Redirect to="/" />;
  }

  if (ready && isAuthenticated) {
    return <Redirect to="/" />;
  }

  async function handleLoginSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username,
          password,
          displayName: displayName.trim() || username,
          email: regEmail.trim() || undefined,
          phone: regPhone.trim() || undefined,
          department: regDepartment.trim() || undefined,
          jobTitle: regJobTitle.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Registo falhou");
      }
      await login(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  const formCard = (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/70 shadow-2xl shadow-primary/5 backdrop-blur-xl">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.25), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, hsl(var(--accent) / 0.12), transparent)",
        }}
      />
      <div className="relative p-8 sm:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-inner">
            <Activity className="h-7 w-7 text-primary" strokeWidth={2.2} />
          </div>
          <h1 className="font-semibold text-2xl tracking-tight text-foreground sm:text-3xl">
            Network Sentinel
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Sessão protegida com cookie HttpOnly e JWT assinado.
            {ldapConfigured ? " Suporte a LDAP activo." : ""}{" "}
            {registerAllowed
              ? " Pode criar uma conta no separador Registar."
              : " Acesso restrito a utilizadores autorizados."}
          </p>
        </div>

        {registerAllowed ? (
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as "login" | "register");
              setError(null);
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/60 p-1">
              <TabsTrigger value="login" className="rounded-lg gap-2 data-[state=active]:shadow-sm">
                <Lock className="h-3.5 w-3.5 opacity-70" />
                Entrar
              </TabsTrigger>
              <TabsTrigger value="register" className="rounded-lg gap-2 data-[state=active]:shadow-sm">
                <Shield className="h-3.5 w-3.5 opacity-70" />
                Registar
              </TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="mt-6 outline-none">
              <form className="space-y-5" onSubmit={handleLoginSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="user">Utilizador</Label>
                  <Input
                    id="user"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    className="h-11 rounded-xl border-border/80 bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pass">Password</Label>
                  <div className="relative">
                    <Input
                      id="pass"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      className="h-11 rounded-xl border-border/80 bg-background/50 pr-11"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Ocultar password" : "Mostrar password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {error && tab === "login" && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl text-base font-medium"
                  disabled={loading || !ready}
                >
                  {loading ? "A validar…" : "Entrar"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="register" className="mt-6 outline-none">
              <form className="space-y-5" onSubmit={handleRegisterSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="dn">Nome a exibir</Label>
                  <Input
                    id="dn"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    className="h-11 rounded-xl border-border/80 bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-user">Utilizador</Label>
                  <Input
                    id="reg-user"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    className="h-11 rounded-xl border-border/80 bg-background/50"
                    pattern="[-a-z0-9._@+]{2,64}"
                    title="2–64 caracteres: minúsculas, números, . _ - @ +"
                  />
                  <p className="text-xs text-muted-foreground">
                    Apenas minúsculas, números e{" "}
                    <code className="text-[11px]">._-@+</code>
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-4 space-y-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Dados complementares (opcional)
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="reg-email">Email</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        autoComplete="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="nome@organizacao.com"
                        className="h-11 rounded-xl border-border/80 bg-background/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-phone">Telefone</Label>
                      <Input
                        id="reg-phone"
                        type="tel"
                        autoComplete="tel"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        className="h-11 rounded-xl border-border/80 bg-background/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-job">Cargo</Label>
                      <Input
                        id="reg-job"
                        value={regJobTitle}
                        onChange={(e) => setRegJobTitle(e.target.value)}
                        className="h-11 rounded-xl border-border/80 bg-background/50"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="reg-dept">Departamento / equipa</Label>
                      <Input
                        id="reg-dept"
                        value={regDepartment}
                        onChange={(e) => setRegDepartment(e.target.value)}
                        className="h-11 rounded-xl border-border/80 bg-background/50"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-pass">Password</Label>
                  <div className="relative">
                    <Input
                      id="reg-pass"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={10}
                      maxLength={128}
                      className="h-11 rounded-xl border-border/80 bg-background/50 pr-11"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Ocultar password" : "Mostrar password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {password.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Robustez</span>
                        <span className={cn(strength.pct >= 70 && "text-emerald-400")}>
                          {strength.label}
                        </span>
                      </div>
                      <Progress value={strength.pct} className="h-1.5 bg-muted" />
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        Mínimo 10 caracteres e 3 tipos (minúsculas, maiúsculas, números, símbolos).
                      </p>
                    </div>
                  )}
                </div>
                {error && tab === "register" && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl text-base font-medium"
                  disabled={loading || !ready}
                >
                  {loading ? "A criar conta…" : "Criar conta e entrar"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        ) : (
          <form className="space-y-5" onSubmit={handleLoginSubmit}>
            <div className="space-y-2">
              <Label htmlFor="user">Utilizador</Label>
              <Input
                id="user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="h-11 rounded-xl border-border/80 bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass">Password</Label>
              <div className="relative">
                <Input
                  id="pass"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="h-11 rounded-xl border-border/80 bg-background/50 pr-11"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Ocultar password" : "Mostrar password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="h-11 w-full rounded-xl text-base font-medium"
              disabled={loading || !ready}
            >
              {loading ? "A validar…" : "Entrar"}
            </Button>
          </form>
        )}

        <p className="mt-8 border-t border-border/60 pt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          OAuth2 / SAML reservados para integrações futuras. API:{" "}
          <code className="rounded bg-muted/80 px-1 py-0.5 text-[10px]">/api/auth/providers</code>
        </p>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--border) / 0.35) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--border) / 0.35) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute left-1/2 top-0 h-[min(70vh,520px)] w-[min(90vw,720px)] -translate-x-1/2 rounded-full bg-primary/15 blur-[100px]" />
      <div className="absolute bottom-0 right-0 h-80 w-80 translate-x-1/4 translate-y-1/4 rounded-full bg-violet-600/10 blur-[90px]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md"
        >
          {formCard}
        </motion.div>
      </div>
    </div>
  );
}
