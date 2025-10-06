"use client";

import { useState, useMemo } from "react";
import { authClient } from "@/lib/auth-client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import MultipleSelector from "@/components/ui/multiselect";

// Helper to convert between primitive arrays and selector Option[]
function toOptions(values: string[]) { return values.map(v => ({ value: v, label: v })); }
function fromOptions(opts: { value: string; label: string }[]) { return opts.map(o => o.value); }

export default function AdminUsersPage() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id as string | undefined;

  const users = useQuery(api.users.listAll, {}) as
    | { _id: string; authUserId: string; email: string; name?: string; roles?: string[]; projects?: string[]; teams?: string[] }[]
    | undefined;
  const me = useQuery(api.users.getByAuthId, { authUserId: userId ?? "" });

  // Canonical lists
  const allProjects = useQuery(api.projects.listProjects, {}) as | { slug: string; name?: string }[] | undefined;
  // Optimistic/local projects to reflect immediately after creation
  const [localProjects, setLocalProjects] = useState<{ slug: string; name?: string }[]>([]);
  const projectOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    for (const p of allProjects ?? []) map.set(p.slug, { value: p.slug, label: p.name ?? p.slug });
    for (const p of localProjects) if (!map.has(p.slug)) map.set(p.slug, { value: p.slug, label: p.name ?? p.slug });
    return Array.from(map.values());
  }, [allProjects, localProjects]);
  const canonicalTeams = Array.from(new Set((users ?? []).flatMap(u => u.teams ?? [])));
  // canonicalTeams used to derive augmentedTeamOptions below

  // privilege
  const sessionRole = ((session?.user as unknown as { role?: string })?.role ?? "").toLowerCase();
  const meRoles = ((me?.roles ?? []) as string[]).map(r => r?.toLowerCase?.()).filter(Boolean) as string[];
  const PRIV_SET = new Set(["admin", "it_support", "irt", "security_delegate", "senior_management", "legal", "comms", "external_specialists"]);
  const isPrivileged = meRoles.some(r => PRIV_SET.has(r)) || PRIV_SET.has(sessionRole);

  // Mutations
  const setProjects = useMutation(api.users.setProjects);
  const setTeams = useMutation(api.users.setTeams);
  const createProject = useMutation(api.projects.createProject);
  const upsertFromAuth = useMutation(api.users.upsertFromAuth);

  // Inline editing maps
  const [editing, setEditing] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  // New user form state
  const [newUser, setNewUser] = useState<{ email: string; name: string; tempPassword: string; role: string; projects: string[]; teams: string[] }>({ email: "", name: "", tempPassword: "", role: "user", projects: [], teams: [] });

  // Dialogs
  // Dialog state with optional target user (undefined => new user form)
  const [openProjectDialog, setOpenProjectDialog] = useState<{ open: boolean; userId?: string }>({ open: false });
  const [openTeamDialog, setOpenTeamDialog] = useState<{ open: boolean; userId?: string }>({ open: false });
  const [newProjectForm, setNewProjectForm] = useState<{ slug: string; name: string; description?: string }>({ slug: "", name: "", description: "" });
  const [newTeamName, setNewTeamName] = useState("");
  // Track adhoc teams created this session but not yet visible via canonical user lists
  const [extraTeams, setExtraTeams] = useState<string[]>([]);

  async function saveProjects(authUserId: string) {
    const u = (users ?? []).find(x => x.authUserId === authUserId);
    const projects = editing[authUserId] ?? (u?.projects ?? []);
    setSaving(s => ({ ...s, [authUserId]: true }));
    setMsg(null);
    try { await setProjects({ authUserId, projects }); setMsg(`Saved projects for ${authUserId}`); } catch { setMsg(`Failed to save projects for ${authUserId}`); } finally { setSaving(s => ({ ...s, [authUserId]: false })); }
  }
  async function saveTeams(authUserId: string) {
    const u = (users ?? []).find(x => x.authUserId === authUserId);
    const teams = editing[`teams:${authUserId}`] ?? (u?.teams ?? []);
    setSaving(s => ({ ...s, [authUserId]: true })); setMsg(null);
    try { await setTeams({ authUserId, teams }); setMsg(`Saved teams for ${authUserId}`); } catch { setMsg(`Failed to save teams for ${authUserId}`); } finally { setSaving(s => ({ ...s, [authUserId]: false })); }
  }

  async function handleCreateProjectInline() {
    if (!newProjectForm.slug || !newProjectForm.name) return;
    try {
  await createProject({ slug: newProjectForm.slug, name: newProjectForm.name, description: newProjectForm.description, members: [] });
  setLocalProjects(lp => lp.some(p => p.slug === newProjectForm.slug) ? lp : [...lp, { slug: newProjectForm.slug, name: newProjectForm.name }]);
      if (openProjectDialog.userId) {
        // Editing existing user: update their editing selection
        setEditing(s => ({ ...s, [openProjectDialog.userId!]: Array.from(new Set([...(s[openProjectDialog.userId!] ?? ((users ?? []).find(u => u.authUserId === openProjectDialog.userId)?.projects ?? [])), newProjectForm.slug])) }));
      } else {
        // New user form
        setNewUser(n => ({ ...n, projects: Array.from(new Set([...n.projects, newProjectForm.slug])) }));
      }
      setNewProjectForm({ slug: "", name: "", description: "" });
      setOpenProjectDialog({ open: false });
    } catch { }
  }

  function handleCreateTeamInline() {
    if (!newTeamName.trim()) return;
    const team = newTeamName.trim();
    if (openTeamDialog.userId) {
      setEditing(s => ({ ...s, [`teams:${openTeamDialog.userId!}`]: Array.from(new Set([...(s[`teams:${openTeamDialog.userId!}`] ?? ((users ?? []).find(u => u.authUserId === openTeamDialog.userId)?.teams ?? [])), team])) }));
    } else {
      setNewUser(n => ({ ...n, teams: Array.from(new Set([...n.teams, team])) }));
    }
    setExtraTeams(t => Array.from(new Set([...t, team])));
    setNewTeamName("");
    setOpenTeamDialog({ open: false });
  }

  async function createUser() {
    if (!newUser.email || !newUser.name || !newUser.tempPassword) return;
    const res = await fetch("/api/admin/user/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: newUser.email, name: newUser.name, tempPassword: newUser.tempPassword, role: newUser.role }) });
    if (res.ok) {
      const { user } = await res.json();
      await upsertFromAuth({ authUserId: user.id, email: user.email, name: user.name ?? undefined, role: user.role ?? undefined });
      if (newUser.projects.length > 0) await setProjects({ authUserId: user.id, projects: newUser.projects });
      if (newUser.teams.length > 0) await setTeams({ authUserId: user.id, teams: newUser.teams });
      setNewUser({ email: "", name: "", tempPassword: "", role: "user", projects: [], teams: [] });
      setMsg("User created");
    }
  }

  // Compose dynamic team options including newly created session teams (must be before early returns for hook order)
  const augmentedTeamOptions = useMemo(() => {
    const set = new Set<string>(canonicalTeams);
    for (const t of extraTeams) set.add(t);
    return Array.from(set).map(t => ({ value: t, label: t }));
  }, [canonicalTeams, extraTeams]);

  // permission gate
  if (!me) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><LoadingSpinner size="sm" /> Loading…</div>;
  }
  if (!isPrivileged) {
    return <div className="p-6 text-sm text-muted-foreground">Not authorized to view this page.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Admin — Users</h1>
      {msg && <div className="text-sm text-muted-foreground">{msg}</div>}

      {/* New user creation with projects/teams */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Create user</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-4 gap-2">
            <Input placeholder="Email" value={newUser.email} onChange={e => setNewUser(s => ({ ...s, email: e.target.value }))} />
            <Input placeholder="Name" value={newUser.name} onChange={e => setNewUser(s => ({ ...s, name: e.target.value }))} />
            <Input placeholder="Temp password" value={newUser.tempPassword} onChange={e => setNewUser(s => ({ ...s, tempPassword: e.target.value }))} />
            <select className="border rounded px-2 py-1 text-sm" value={newUser.role} onChange={e => setNewUser(s => ({ ...s, role: e.target.value }))}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Projects</Label>
              <MultipleSelector
                placeholder="Select projects"
                options={projectOptions}
                value={toOptions(newUser.projects)}
                onChange={opts => setNewUser(s => ({ ...s, projects: fromOptions(opts) }))}
                addButtonLabel="Add Project"
                onAddClick={() => setOpenProjectDialog({ open: true })}
                emptyIndicator={<p className="text-center text-sm">No results found</p>}
              />

            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teams</Label>
              <MultipleSelector
                placeholder="Select teams"
                options={augmentedTeamOptions}
                value={toOptions(newUser.teams)}
                onChange={opts => setNewUser(s => ({ ...s, teams: fromOptions(opts) }))}
                addButtonLabel="Add Team"
                onAddClick={() => setOpenTeamDialog({ open: true })}
                emptyIndicator={<p className="text-center text-sm">No results found</p>}
              />
            </div>
          </div>
          <div>
            <Button onClick={createUser} disabled={!newUser.email || !newUser.name || !newUser.tempPassword}>Create</Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing users list */}
      <div className="space-y-4">
        {(users ?? []).map(u => (
          <Card key={u._id}>
            <CardHeader><CardTitle className="text-sm">{u.name ?? u.email ?? u.authUserId}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-2">
                <div className="text-xs text-muted-foreground">{u.email}</div>
                <div>
                  <Label className="text-xs">Projects</Label>
                  <MultipleSelector
                    placeholder={(u.projects ?? []).join(", ") || "Select projects"}
                    options={projectOptions}
                    value={toOptions(editing[u.authUserId] ?? (u.projects ?? []))}
                    onChange={opts => setEditing(s => ({ ...s, [u.authUserId]: fromOptions(opts) }))}
                    addButtonLabel="Add Project"
                    onAddClick={() => setOpenProjectDialog({ open: true, userId: u.authUserId })}
                    emptyIndicator={<p className="text-center text-sm">No results found</p>}
                  />
                </div>
                <div>
                  <Label className="text-xs">Teams</Label>
                  <MultipleSelector
                    placeholder={(u.teams ?? []).join(", ") || "Select teams"}
                    options={augmentedTeamOptions}
                    value={toOptions(editing[`teams:${u.authUserId}`] ?? (u.teams ?? []))}
                    onChange={opts => setEditing(s => ({ ...s, [`teams:${u.authUserId}`]: fromOptions(opts) }))}
                    addButtonLabel="Add Team"
                    onAddClick={() => setOpenTeamDialog({ open: true, userId: u.authUserId })}
                    emptyIndicator={<p className="text-center text-sm">No results found</p>}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveProjects(u.authUserId)} disabled={saving[u.authUserId]}> {saving[u.authUserId] ? "Saving…" : "Save"}</Button>
                  <Button size="sm" onClick={() => saveTeams(u.authUserId)} disabled={saving[u.authUserId]}> {saving[u.authUserId] ? "Saving…" : "Save Teams"}</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Project Dialog */}
      <Dialog open={openProjectDialog.open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Create a project and assign it immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div>
              <Label className="text-xs">Slug</Label>
              <Input value={newProjectForm.slug} onChange={e => setNewProjectForm(f => ({ ...f, slug: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={newProjectForm.name} onChange={e => setNewProjectForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={newProjectForm.description} onChange={e => setNewProjectForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenProjectDialog({ open: false })}>Cancel</Button>
            <Button onClick={handleCreateProjectInline} disabled={!newProjectForm.slug || !newProjectForm.name}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Dialog */}
      <Dialog open={openTeamDialog.open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Team</DialogTitle>
            <DialogDescription>Create a team and assign it immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div>
              <Label className="text-xs">Team name</Label>
              <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenTeamDialog({ open: false })}>Cancel</Button>
            <Button onClick={handleCreateTeamInline} disabled={!newTeamName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
