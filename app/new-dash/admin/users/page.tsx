"use client";

import { useState, useMemo } from "react";
import { authClient } from "@/lib/auth-client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import MultipleSelector from "@/components/ui/multiselect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { UsersTable } from "@/components/admin/users-test/users-table";

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

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New user form state
  const [newUser, setNewUser] = useState<{ email: string; name: string; tempPassword: string; role: string; projects: string[]; teams: string[] }>({ email: "", name: "", tempPassword: "", role: "user", projects: [], teams: [] });
  const [newUserDialogOpen, setNewUserDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Dialogs
  // Dialog state with optional target user (undefined => new user form)
  const [openProjectDialog, setOpenProjectDialog] = useState<{ open: boolean; userId?: string }>({ open: false });
  const [openTeamDialog, setOpenTeamDialog] = useState<{ open: boolean; userId?: string }>({ open: false });
  const [newProjectForm, setNewProjectForm] = useState<{ slug: string; name: string; description?: string }>({ slug: "", name: "", description: "" });
  const [newTeamName, setNewTeamName] = useState("");
  // Track adhoc teams created this session but not yet visible via canonical user lists
  const [extraTeams, setExtraTeams] = useState<string[]>([]);

  // Edit user dialog state
  const [editUserDialog, setEditUserDialog] = useState<{
    open: boolean;
    user?: { _id: string; authUserId: string; email: string; name?: string; roles?: string[]; projects?: string[]; teams?: string[] };
  }>({ open: false });
  const [editForm, setEditForm] = useState<{ name: string; role: string; projects: string[]; teams: string[] }>({ name: "", role: "user", projects: [], teams: [] });
  const [editSaving, setEditSaving] = useState<boolean>(false);

  // Per-row inline Save buttons have been replaced by the Edit dialog.

  async function handleCreateProjectInline() {
    if (!newProjectForm.slug || !newProjectForm.name) return;
    try {
  await createProject({ slug: newProjectForm.slug, name: newProjectForm.name, description: newProjectForm.description, members: [] });
  setLocalProjects(lp => lp.some(p => p.slug === newProjectForm.slug) ? lp : [...lp, { slug: newProjectForm.slug, name: newProjectForm.name }]);
      if (openProjectDialog.userId && editUserDialog.open && editUserDialog.user?.authUserId === openProjectDialog.userId) {
        // Editing existing user in dialog: update dialog form
        setEditForm(f => ({ ...f, projects: Array.from(new Set([...(f.projects ?? []), newProjectForm.slug])) }));
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
    if (openTeamDialog.userId && editUserDialog.open && editUserDialog.user?.authUserId === openTeamDialog.userId) {
      // Editing existing user in dialog: update dialog form
      setEditForm(f => ({ ...f, teams: Array.from(new Set([...(f.teams ?? []), team])) }));
    } else {
      setNewUser(n => ({ ...n, teams: Array.from(new Set([...n.teams, team])) }));
    }
    setExtraTeams(t => Array.from(new Set([...t, team])));
    setNewTeamName("");
    setOpenTeamDialog({ open: false });
  }

  async function createUser() {
    if (!newUser.email || !newUser.name || !newUser.tempPassword) {
      setMsg({ type: 'error', text: 'Please fill in all required fields (email, name, and password)' });
      return;
    }
    setCreating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/user/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: newUser.email, name: newUser.name, tempPassword: newUser.tempPassword, role: newUser.role }) });
      if (res.ok) {
        const { user } = await res.json();
        await upsertFromAuth({ authUserId: user.id, email: user.email, name: user.name ?? undefined, role: user.role ?? undefined });
        if (newUser.projects.length > 0) await setProjects({ authUserId: user.id, projects: newUser.projects });
        if (newUser.teams.length > 0) await setTeams({ authUserId: user.id, teams: newUser.teams });
        setNewUser({ email: "", name: "", tempPassword: "", role: "user", projects: [], teams: [] });
        setMsg({ type: 'success', text: `User ${user.email} created successfully!` });
        setNewUserDialogOpen(false);
      } else {
        const errorText = await res.text();
        setMsg({ type: 'error', text: `Failed to create user: ${errorText || 'Unknown error'}` });
      }
    } catch (error) {
      setMsg({ type: 'error', text: `Failed to create user: ${error instanceof Error ? error.message : 'Network error'}` });
    } finally {
      setCreating(false);
    }
  }

  // Compose dynamic team options including newly created session teams (must be before early returns for hook order)
  const augmentedTeamOptions = useMemo(() => {
    const set = new Set<string>(canonicalTeams);
    for (const t of extraTeams) set.add(t);
    return Array.from(set).map(t => ({ value: t, label: t }));
  }, [canonicalTeams, extraTeams]);

  // Search & filtering hooks (must be before early returns)
  const [userSearch, setUserSearch] = useState("");
  const filteredUsers = useMemo(() => {
    const base = users ?? [];
    if (!userSearch.trim()) return base;
    const q = userSearch.toLowerCase();
    return base.filter(u => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || u.authUserId.toLowerCase().includes(q));
  }, [users, userSearch]);

  const roleColor = (role?: string) => {
    if (!role) return 'bg-gray-200 text-gray-700 border border-gray-300';
    switch (role.toLowerCase()) {
      case 'admin': return 'bg-purple-500/15 text-purple-700 border border-purple-300';
      case 'it_support': return 'bg-blue-500/15 text-blue-700 border border-blue-300';
      case 'irt': return 'bg-red-500/15 text-red-700 border border-red-300';
      case 'security_delegate': return 'bg-amber-400/20 text-amber-700 border border-amber-300';
      default: return 'bg-emerald-500/15 text-emerald-700 border border-emerald-300';
    }
  };

  // permission gate
  if (!me) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><LoadingSpinner size="sm" /> Loading…</div>;
  }
  if (!isPrivileged) {
    return <div className="p-6 text-sm text-muted-foreground">Not authorized to view this page.</div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Admin — Users</CardTitle>
          <Button onClick={() => { setMsg(null); setNewUserDialogOpen(true); }}>New User</Button>
        </CardHeader>
        <CardContent>
      {msg && (
        <div className={`mb-4 p-3 rounded-md text-sm ${
          msg.type === 'error' 
            ? 'bg-red-50 text-red-700 border border-red-200' 
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={newUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>Add a new user and optionally assign projects and teams.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setMsg(null); setNewUserDialogOpen(false); }}>Cancel</Button>
            <Button onClick={createUser} disabled={creating || !newUser.email || !newUser.name || !newUser.tempPassword}>{creating ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Users table styled like ticket report */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={userSearch}
            onChange={e=>setUserSearch(e.target.value)}
            placeholder="Search name / email / id"
            className="h-8 w-[240px] rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-1"
          />
          <span className="text-[11px] text-muted-foreground">{filteredUsers.length} user{filteredUsers.length===1?'':'s'}</span>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs table-fixed border-collapse [&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-wide" aria-label="Users administration table">
            <thead className="text-muted-foreground select-none">
              <tr className="bg-muted/30">
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[160px]">Name</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[220px]">Email</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[120px]">Role</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Projects</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Teams</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[150px]">Actions</th>
              </tr>
            </thead>
            <tbody className="[&_tr]:transition-colors">
              {filteredUsers.map(u => {
                const role = (u.roles && u.roles[0]) || undefined;
                return (
                  <tr key={u._id} className="hover:bg-muted/40">
                    <td className="px-3 py-2 border border-gray-100 whitespace-nowrap" title={u.authUserId}>
                      <div className="flex flex-col">
                        <span className="font-medium text-[11px] leading-tight truncate max-w-[150px]" title={u.name || u.email}>{u.name || u.email || u.authUserId}</span>
                        <span className="text-[10px] text-muted-foreground font-mono truncate" title={u.authUserId}>{u.authUserId}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-gray-100 max-w-[220px] truncate" title={u.email}>{u.email}</td>
                    <td className="px-3 py-2 border border-gray-100">
                      <span className={`inline-flex items-center gap-1.5 h-5 text-[10px] font-medium leading-none px-2 py-0.5 rounded ${roleColor(role)}`}>{role || '—'}</span>
                    </td>
                    <td className="px-3 py-2 border border-gray-100 align-top min-w-[260px]">
                      {(u.projects && u.projects.length > 0) ? (
                        <div className="flex flex-wrap gap-1">
                          {u.projects.map(p => (
                            <span key={p} className="inline-flex items-center h-5 px-2 rounded border text-[10px] bg-muted/40">{p}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border border-gray-100 align-top min-w-[240px]">
                      {(u.teams && u.teams.length > 0) ? (
                        <div className="flex flex-wrap gap-1">
                          {u.teams.map(t => (
                            <span key={t} className="inline-flex items-center h-5 px-2 rounded border text-[10px] bg-muted/40">{t}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border border-gray-100">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => {
                          setMsg(null);
                          setEditUserDialog({ open: true, user: u })
                          setEditForm({
                            name: u.name || "",
                            role: (u.roles && u.roles[0]) || "user",
                            projects: [...(u.projects || [])],
                            teams: [...(u.teams || [])],
                          })
                        }}
                      >
                        Edit User
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground border border-gray-100">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </CardContent>
      </Card>

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

      {/* Edit User Dialog */}
      <Dialog open={editUserDialog.open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details and assignments.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={editUserDialog.user?.email || ''} readOnly />
              </div>
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={editForm.name} onChange={e=>setEditForm(f=>({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Role</Label>
                <select className="border rounded px-2 py-1 text-sm w-full" value={editForm.role} onChange={e=>setEditForm(f=>({ ...f, role: e.target.value }))}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Projects</Label>
                <MultipleSelector
                  placeholder={editForm.projects.length ? editForm.projects.join(', ') : 'Select projects'}
                  options={projectOptions}
                  value={toOptions(editForm.projects)}
                  onChange={opts => setEditForm(f => ({ ...f, projects: fromOptions(opts) }))}
                  addButtonLabel="Add Project"
                  onAddClick={() => setOpenProjectDialog({ open: true, userId: editUserDialog.user?.authUserId })}
                  emptyIndicator={<p className="text-center text-xs">No results</p>}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Teams</Label>
                <MultipleSelector
                  placeholder={editForm.teams.length ? editForm.teams.join(', ') : 'Select teams'}
                  options={augmentedTeamOptions}
                  value={toOptions(editForm.teams)}
                  onChange={opts => setEditForm(f => ({ ...f, teams: fromOptions(opts) }))}
                  addButtonLabel="Add Team"
                  onAddClick={() => setOpenTeamDialog({ open: true, userId: editUserDialog.user?.authUserId })}
                  emptyIndicator={<p className="text-center text-xs">No results</p>}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setMsg(null); setEditUserDialog({ open: false }); }}>Cancel</Button>
            <Button
              onClick={async () => {
                const u = editUserDialog.user; if (!u) return;
                setEditSaving(true);
                setMsg(null);
                try {
                  await upsertFromAuth({ authUserId: u.authUserId, email: u.email, name: editForm.name || undefined, role: editForm.role || undefined });
                  await setProjects({ authUserId: u.authUserId, projects: editForm.projects });
                  await setTeams({ authUserId: u.authUserId, teams: editForm.teams });
                  setMsg({ type: 'success', text: `User ${u.email} updated successfully!` });
                  setEditUserDialog({ open: false });
                } catch (error) {
                  setMsg({ type: 'error', text: `Failed to update user: ${error instanceof Error ? error.message : 'Unknown error'}` });
                } finally { setEditSaving(false); }
              }}
              disabled={editSaving || !editUserDialog.user}
            >
              {editSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
