import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { FileText, KeyRound, Pencil, Trash2, UserPlus } from "lucide-react";

type AdminUserRow = {
  id: string;
  username: string;
  displayName: string | null;
  authSource: string;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  hasLocalPassword: boolean;
  externalSubject: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  notes: string | null;
};

function formatUserDate(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd/MM/yyyy HH:mm");
}

function ellipsizeMiddle(s: string, head = 14, tail = 10): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

type UsersResponse = { users: AdminUserRow[] };

type MeUser = {
  id: string;
  username: string;
  displayName: string | null;
  authSource: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  notes: string | null;
};

/** Perfil da sessão: usa PATCH /api/auth/me (não depende de escolher a linha na tabela). */
function MyProfileCard() {
  const { refreshSession } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [authSource, setAuthSource] = useState("local");
  const [draft, setDraft] = useState({
    username: "",
    displayName: "",
    email: "",
    phone: "",
    department: "",
    jobTitle: "",
    notes: "",
    newPassword: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await authFetch("/api/auth/me");
      if (!r.ok || cancelled) return;
      const j = (await r.json()) as { user: MeUser };
      const u = j.user;
      setAuthSource(u.authSource);
      setDraft((prev) => ({
        ...prev,
        username: u.username,
        displayName: u.displayName ?? "",
        email: u.email ?? "",
        phone: u.phone ?? "",
        department: u.department ?? "",
        jobTitle: u.jobTitle ?? "",
        notes: u.notes ?? "",
        newPassword: "",
      }));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile() {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        displayName: draft.displayName.trim() || null,
        email: draft.email.trim() === "" ? null : draft.email.trim(),
        phone: draft.phone.trim() === "" ? null : draft.phone.trim(),
        department: draft.department.trim() === "" ? null : draft.department.trim(),
        jobTitle: draft.jobTitle.trim() === "" ? null : draft.jobTitle.trim(),
        notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
      };
      if (authSource === "local") {
        body.username = draft.username.trim();
      }
      if (draft.newPassword.length > 0) {
        body.password = draft.newPassword;
      }
      const r = await authFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      await refreshSession();
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDraft((d) => ({ ...d, newPassword: "" }));
      toast({ title: "Perfil actualizado", description: "Os dados da sua conta foram gravados." });
    } catch (e) {
      toast({
        title: "Não foi possível guardar",
        description: e instanceof Error ? e.message : "Erro",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <p className="text-sm text-muted-foreground border border-border/60 rounded-lg p-4 bg-card/30">
        A carregar o seu perfil…
      </p>
    );
  }

  return (
    <Card className="border-primary/25 bg-card/50">
      <CardHeader>
        <CardTitle>O meu perfil</CardTitle>
        <CardDescription>
          Actualize aqui o seu utilizador de login, nome a exibir, contactos e notas. Não precisa de
          procurar a sua linha na tabela abaixo. Regras do login: 2–64 caracteres (minúsculas,
          números e <code className="text-xs">._-@+</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-2xl">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="my-user">Utilizador (login)</Label>
            <Input
              id="my-user"
              className="font-mono text-sm"
              value={draft.username}
              onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
              autoComplete="username"
              disabled={authSource !== "local"}
              title={
                authSource !== "local"
                  ? "Contas LDAP: o login vem do directório; altere o nome no AD se necessário."
                  : undefined
              }
            />
            {authSource !== "local" ? (
              <p className="text-[11px] text-muted-foreground">
                Conta <strong>{authSource}</strong>: o identificador de login está ligado ao
                directório.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="my-dn">Nome a exibir</Label>
            <Input
              id="my-dn"
              value={draft.displayName}
              onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="my-email">Email</Label>
            <Input
              id="my-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="my-phone">Telefone</Label>
            <Input
              id="my-phone"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="my-job">Cargo</Label>
            <Input
              id="my-job"
              value={draft.jobTitle}
              onChange={(e) => setDraft((d) => ({ ...d, jobTitle: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="my-dept">Departamento</Label>
            <Input
              id="my-dept"
              value={draft.department}
              onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="my-notes">Notas</Label>
            <Textarea
              id="my-notes"
              rows={3}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              className="resize-y text-sm min-h-[72px]"
            />
          </div>
        </div>
        {authSource === "local" ? (
          <div className="space-y-2 max-w-md">
            <Label htmlFor="my-pass">Nova password (opcional)</Label>
            <Input
              id="my-pass"
              type="password"
              autoComplete="new-password"
              value={draft.newPassword}
              onChange={(e) => setDraft((d) => ({ ...d, newPassword: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              Deixe em branco para manter a password actual. Mínimo 10 caracteres e três classes
              se preencher.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            A origem da conta é <strong>{authSource}</strong>. A password continua a ser gerida no
            directório (LDAP).
          </p>
        )}
        <Button type="button" onClick={() => void saveProfile()} disabled={loading}>
          {loading ? "A guardar…" : "Guardar o meu perfil"}
        </Button>
      </CardContent>
    </Card>
  );
}

async function fetchUsers(): Promise<UsersResponse> {
  const res = await authFetch("/api/users");
  if (res.status === 404) {
    return { users: [] };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as UsersResponse;
}

export function SettingsUsersPanel() {
  const { userId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["/api/users"],
    queryFn: fetchUsers,
    staleTime: 10_000,
  });

  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    displayName: "",
    email: "",
    phone: "",
    department: "",
    jobTitle: "",
    notes: "",
  });
  const [profileDialog, setProfileDialog] = useState<AdminUserRow | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    username: "",
    email: "",
    phone: "",
    department: "",
    jobTitle: "",
    notes: "",
  });

  useEffect(() => {
    if (!profileDialog) return;
    setProfileDraft({
      username: profileDialog.username,
      email: profileDialog.email ?? "",
      phone: profileDialog.phone ?? "",
      department: profileDialog.department ?? "",
      jobTitle: profileDialog.jobTitle ?? "",
      notes: profileDialog.notes ?? "",
    });
  }, [profileDialog]);
  const [pwdDialog, setPwdDialog] = useState<{ id: string; username: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [nameEdit, setNameEdit] = useState<{ id: string; value: string } | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: newUser.username,
          password: newUser.password,
          displayName: newUser.displayName.trim() || newUser.username,
          email: newUser.email.trim() || undefined,
          phone: newUser.phone.trim() || undefined,
          department: newUser.department.trim() || undefined,
          jobTitle: newUser.jobTitle.trim() || undefined,
          notes: newUser.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: async () => {
      await invalidate();
      setNewUser({
        username: "",
        password: "",
        displayName: "",
        email: "",
        phone: "",
        department: "",
        jobTitle: "",
        notes: "",
      });
      toast({ title: "Utilizador criado" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  type UserPatchBody = {
    username?: string;
    displayName?: string | null;
    disabled?: boolean;
    password?: string;
    email?: string | null;
    phone?: string | null;
    department?: string | null;
    jobTitle?: string | null;
    notes?: string | null;
  };

  const patchMut = useMutation({
    mutationFn: async (args: { id: string; body: UserPatchBody }) => {
      const res = await authFetch(`/api/users/${encodeURIComponent(args.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args.body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Guardado" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: async () => {
      await invalidate();
      setDeleteTarget(null);
      toast({ title: "Utilizador removido" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  function saveDisplayName(id: string, value: string) {
    patchMut.mutate({
      id,
      body: { displayName: value.trim() || null },
    });
    setNameEdit(null);
  }

  function saveProfileFicha() {
    if (!profileDialog) return;
    const fichaBody: UserPatchBody = {
      email: profileDraft.email.trim() === "" ? null : profileDraft.email.trim(),
      phone: profileDraft.phone.trim() === "" ? null : profileDraft.phone.trim(),
      department:
        profileDraft.department.trim() === "" ? null : profileDraft.department.trim(),
      jobTitle: profileDraft.jobTitle.trim() === "" ? null : profileDraft.jobTitle.trim(),
      notes: profileDraft.notes.trim() === "" ? null : profileDraft.notes.trim(),
    };
    if (profileDialog.authSource === "local") {
      fichaBody.username = profileDraft.username.trim();
    }
    patchMut.mutate(
      {
        id: profileDialog.id,
        body: fichaBody,
      },
      {
        onSuccess: () => setProfileDialog(null),
      },
    );
  }

  function applyPassword() {
    if (!pwdDialog || !newPassword) return;
    patchMut.mutate(
      {
        id: pwdDialog.id,
        body: { password: newPassword },
      },
      {
        onSettled: () => {
          setNewPassword("");
          setPwdDialog(null);
        },
      },
    );
  }

  if (query.isError) {
    return (
      <p className="text-sm text-destructive">
        {(query.error as Error).message}
      </p>
    );
  }

  const users = query.data?.users ?? [];

  return (
    <div className="space-y-6">
      <MyProfileCard />
      <Card className="border-border bg-card/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-4 w-4 text-primary" />
            Novo utilizador local
          </CardTitle>
          <CardDescription>
            As mesmas regras de password do registo (mínimo 10 caracteres, três classes). Contas
            LDAP aparecem na lista mas só são geridas no directório, exceto nome e estado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="su-user">Utilizador</Label>
              <Input
                id="su-user"
                autoComplete="off"
                placeholder="ex.: operador"
                value={newUser.username}
                onChange={(e) => setNewUser((s) => ({ ...s, username: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-dn">Nome a exibir</Label>
              <Input
                id="su-dn"
                value={newUser.displayName}
                onChange={(e) => setNewUser((s) => ({ ...s, displayName: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="su-pass">Password</Label>
              <Input
                id="su-pass"
                type="password"
                autoComplete="new-password"
                value={newUser.password}
                onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/15 p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Dados complementares (opcional)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="su-email">Email</Label>
                <Input
                  id="su-email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-phone">Telefone</Label>
                <Input
                  id="su-phone"
                  value={newUser.phone}
                  onChange={(e) => setNewUser((s) => ({ ...s, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-job">Cargo</Label>
                <Input
                  id="su-job"
                  value={newUser.jobTitle}
                  onChange={(e) => setNewUser((s) => ({ ...s, jobTitle: e.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="su-dept">Departamento</Label>
                <Input
                  id="su-dept"
                  value={newUser.department}
                  onChange={(e) => setNewUser((s) => ({ ...s, department: e.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="su-notes">Notas internas</Label>
                <Textarea
                  id="su-notes"
                  rows={2}
                  placeholder="Visível apenas na gestão de utilizadores"
                  value={newUser.notes}
                  onChange={(e) => setNewUser((s) => ({ ...s, notes: e.target.value }))}
                  className="text-sm resize-y min-h-[60px]"
                />
              </div>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={
              createMut.isPending ||
              newUser.username.trim().length < 2 ||
              newUser.password.length < 10
            }
          >
            {createMut.isPending ? "A criar…" : "Criar utilizador"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/40">
        <CardHeader>
          <CardTitle>Utilizadores</CardTitle>
          <CardDescription>
            {query.isLoading
              ? "A carregar…"
              : `${users.length} conta${users.length === 1 ? "" : "s"}. Email, contactos e notas internas; identificador interno (UUID), datas e LDAP. Use Ficha para editar dados complementares.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {users.length === 0 && !query.isLoading ? (
            <p className="text-sm text-muted-foreground">Sem utilizadores.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilizador</TableHead>
                  <TableHead className="hidden md:table-cell max-w-[160px]">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">ID interno</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="hidden xl:table-cell min-w-[140px]">
                    Ident. externo
                  </TableHead>
                  <TableHead>Password local</TableHead>
                  <TableHead className="hidden md:table-cell whitespace-nowrap">
                    Criado em
                  </TableHead>
                  <TableHead className="hidden md:table-cell whitespace-nowrap">
                    Actualizado
                  </TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead className="text-right">Acções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.id === userId;
                  return (
                    <TableRow key={u.id} className={u.disabled ? "opacity-60" : undefined}>
                      <TableCell className="font-mono text-sm font-medium">
                        {u.username}
                        {isSelf ? (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            você
                          </Badge>
                        ) : null}
                        <div className="mt-1 space-y-0.5 lg:hidden">
                          <div className="font-mono text-[10px] text-muted-foreground">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="truncate max-w-[200px] text-left hover:underline"
                                >
                                  ID {ellipsizeMiddle(u.id, 6, 4)}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md">
                                <p className="break-all font-mono text-xs">{u.id}</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="text-[10px] text-muted-foreground md:hidden">
                            <span className="block">Criado: {formatUserDate(u.createdAt)}</span>
                            <span className="block">Actual.: {formatUserDate(u.updatedAt)}</span>
                            {u.externalSubject ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="mt-0.5 block max-w-[220px] cursor-default truncate font-mono">
                                    LDAP: {ellipsizeMiddle(u.externalSubject, 12, 8)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-lg">
                                  <p className="break-all text-xs">{u.externalSubject}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                          {u.email ? (
                            <div className="text-[10px] text-muted-foreground md:hidden truncate max-w-[220px]">
                              {u.email}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell max-w-[180px]">
                        {u.email ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block cursor-default truncate text-xs text-muted-foreground">
                                {u.email}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-sm break-all text-xs">{u.email}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground/70">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="max-w-[120px] truncate text-left hover:text-foreground"
                            >
                              {ellipsizeMiddle(u.id, 8, 6)}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            <p className="break-all font-mono text-xs">{u.id}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        {nameEdit?.id === u.id ? (
                          <div className="flex gap-1">
                            <Input
                              className="h-8 text-sm"
                              value={nameEdit.value}
                              onChange={(e) =>
                                setNameEdit({ id: u.id, value: e.target.value })
                              }
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 px-2"
                              onClick={() => saveDisplayName(u.id, nameEdit.value)}
                              disabled={patchMut.isPending}
                            >
                              OK
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">
                              {u.displayName ?? "—"}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() =>
                                setNameEdit({
                                  id: u.id,
                                  value: u.displayName ?? u.username,
                                })
                              }
                              aria-label="Editar nome"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {u.authSource}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell max-w-[200px] text-xs text-muted-foreground">
                        {u.externalSubject ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block cursor-default truncate font-mono">
                                {ellipsizeMiddle(u.externalSubject, 16, 12)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-lg">
                              <p className="break-all text-xs">{u.externalSubject}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground/70">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {u.authSource === "local" ? (
                          u.hasLocalPassword ? (
                            <span className="text-xs text-success">definida</span>
                          ) : (
                            <span className="text-xs text-warning">pendente</span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">LDAP</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell whitespace-nowrap text-xs text-muted-foreground">
                        {formatUserDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell whitespace-nowrap text-xs text-muted-foreground">
                        {formatUserDate(u.updatedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!u.disabled}
                            disabled={isSelf || patchMut.isPending}
                            onCheckedChange={(active) => {
                              patchMut.mutate({
                                id: u.id,
                                body: { disabled: !active },
                              });
                            }}
                            aria-label={`Conta ${u.username} ${u.disabled ? "inactiva" : "activa"}`}
                          />
                          {isSelf ? (
                            <span className="text-[10px] text-muted-foreground max-w-[72px] leading-tight">
                              não pode desactivar-se
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1"
                            onClick={() => setProfileDialog(u)}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Ficha
                          </Button>
                          {u.authSource === "local" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1"
                              onClick={() =>
                                setPwdDialog({ id: u.id, username: u.username })
                              }
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              Password
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive hover:text-destructive"
                            disabled={isSelf || users.length <= 1 || deleteMut.isPending}
                            onClick={() => setDeleteTarget(u)}
                            title={
                              isSelf
                                ? "Não pode remover a própria conta"
                                : users.length <= 1
                                  ? "Tem de existir pelo menos um utilizador"
                                  : "Remover conta"
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(profileDialog)}
        onOpenChange={(o) => {
          if (!o) setProfileDialog(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ficha do utilizador</DialogTitle>
            <DialogDescription>
              {profileDialog ? (
                <>
                  Conta{" "}
                  <span className="font-mono font-medium">{profileDialog.username}</span>. Email único
                  no sistema. As notas são apenas para administradores.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {profileDialog ? (
            <div className="grid gap-3 py-2">
              <div className="space-y-2">
                <Label htmlFor="pf-user">Utilizador (login)</Label>
                <Input
                  id="pf-user"
                  className="font-mono text-sm"
                  value={profileDraft.username}
                  onChange={(e) =>
                    setProfileDraft((d) => ({ ...d, username: e.target.value }))
                  }
                  disabled={profileDialog.authSource !== "local"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-email">Email</Label>
                <Input
                  id="pf-email"
                  type="email"
                  value={profileDraft.email}
                  onChange={(e) =>
                    setProfileDraft((d) => ({ ...d, email: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-phone">Telefone</Label>
                <Input
                  id="pf-phone"
                  value={profileDraft.phone}
                  onChange={(e) =>
                    setProfileDraft((d) => ({ ...d, phone: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-dept">Departamento</Label>
                <Input
                  id="pf-dept"
                  value={profileDraft.department}
                  onChange={(e) =>
                    setProfileDraft((d) => ({ ...d, department: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-job">Cargo</Label>
                <Input
                  id="pf-job"
                  value={profileDraft.jobTitle}
                  onChange={(e) =>
                    setProfileDraft((d) => ({ ...d, jobTitle: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-notes">Notas internas</Label>
                <Textarea
                  id="pf-notes"
                  rows={4}
                  value={profileDraft.notes}
                  onChange={(e) =>
                    setProfileDraft((d) => ({ ...d, notes: e.target.value }))
                  }
                  className="resize-y min-h-[100px] text-sm"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setProfileDialog(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={saveProfileFicha}
              disabled={patchMut.isPending}
            >
              Guardar ficha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pwdDialog)}
        onOpenChange={(o) => {
          if (!o) {
            setPwdDialog(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova password</DialogTitle>
            <DialogDescription>
              Utilizador <span className="font-mono">{pwdDialog?.username}</span>. Mínimo 10
              caracteres e três classes de caracteres.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <DialogFooter>
            <Button
              type="button"
              onClick={applyPassword}
              disabled={newPassword.length < 10 || patchMut.isPending}
            >
              Actualizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover utilizador</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma a eliminação de{" "}
              <span className="font-mono font-medium">{deleteTarget?.username}</span>? Esta acção
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
