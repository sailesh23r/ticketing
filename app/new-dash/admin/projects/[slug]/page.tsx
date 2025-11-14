"use client";

import { useMemo, use as usePromise, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import MultipleSelector, { Option as MSOption } from "@/components/ui/multiselect";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";

export default function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = usePromise(params);
  const { data: session } = authClient.useSession();
  const me = useQuery(api.users.getByAuthId, { authUserId: session?.user?.id ?? "" });
  const projects = useQuery(api.projects.listProjects) as | { slug: string; name: string; description?: string; members?: string[]; suspended?: boolean; slaP0Hours?: number; slaP1Hours?: number; slaP2Hours?: number; slaP3Hours?: number }[] | undefined;
  const users = useQuery(api.users.listAll, {}) as | { authUserId: string; email: string; name?: string; roles?: string[]; projects?: string[] }[] | undefined;

  const project = useMemo(() => (projects ?? []).find(p => p.slug === slug), [projects, slug]);

  const updateProject = useMutation(api.projects.updateProject);
  const deleteProject = useMutation(api.projects.deleteProject);
  const setUserProjects = useMutation(api.users.setProjects);
  const setProjectMembers = useMutation(api.projects.setProjectMembers);

  const [editOpen, setEditOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<{ slaP0?: string; slaP1?: string; slaP2?: string; slaP3?: string } | null>(null);

  function openEdit() {
    if (!project) return;
    setForm({
      slaP0: project.slaP0Hours?.toString() ?? "",
      slaP1: project.slaP1Hours?.toString() ?? "",
      slaP2: project.slaP2Hours?.toString() ?? "",
      slaP3: project.slaP3Hours?.toString() ?? "",
    });
    setFormError(null);
    setEditOpen(true);
  }

  async function toggleSuspend() {
    if (!project) return;
    try {
      const next = !project.suspended;
      const ok = window.confirm(next ? `Suspend project '${project.name}'?` : `Resume project '${project.name}'?`);
      if (!ok) return;
      await updateProject({ slug: project.slug, suspended: next });
      toast.success(next ? "Project suspended" : "Project resumed");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to toggle suspended"));
    }
  }

  async function removeMember(authUserId: string) {
    if (!project) return;
    try {
      const explicit = new Set(project.members ?? []);
      const user = (users ?? []).find(u => u.authUserId === authUserId);
      const userProjects = Array.isArray(user?.projects) ? user!.projects : [];
      const inProject = explicit.has(authUserId);
      const inUser = userProjects.includes(slug);

      if (!inProject && !inUser) {
        toast.info("This user is not linked to the project explicitly or via their profile.");
        return;
      }

      let doProject = inProject;
      let doUser = inUser;

      if (inProject && inUser) {
        const choice = window.confirm("User is linked both via project members and via their profile. Remove from both? Click Cancel to remove only from project members.");
        doProject = true;
        doUser = choice; // both if confirmed
      }

      // Perform updates
      let nextMembers = project.members ?? [];
      if (doProject) {
        nextMembers = nextMembers.filter(m => m !== authUserId);
      }
      // Always synchronize via setProjectMembers so both sides are kept consistent
      await setProjectMembers({ slug: project.slug, members: nextMembers });
      if (doUser && user) {
        const nextUserProjects = userProjects.filter(p => p !== slug);
        await setUserProjects({ authUserId, projects: nextUserProjects });
      }
      toast.success("Member removed");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to remove member"));
    }
  }

  // Add members dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addSelected, setAddSelected] = useState<MSOption[]>([]);
  const [addError, setAddError] = useState<string | null>(null);

  function openAdd() {
  setAddSelected([]);
    setAddError(null);
    setAddOpen(true);
  }

  async function addMembers() {
    if (!project) return;
    try {
      if (addSelected.length === 0) {
        setAddError("Select at least one user");
        return;
      }
      const newIds = addSelected.map(o => o.value);
      const merged = Array.from(new Set([...(project.members ?? []), ...newIds]));
      await setProjectMembers({ slug: project.slug, members: merged });
      for (const id of newIds) {
        const u = (users ?? []).find(x => x.authUserId === id);
        const userProjects = Array.isArray(u?.projects) ? u!.projects : [];
        if (!userProjects.includes(project.slug)) {
          await setUserProjects({ authUserId: id, projects: [...userProjects, project.slug] });
        }
      }
      toast.success("Members added");
      setAddOpen(false);
    } catch (err: unknown) {
      setAddError(errorMessage(err, "Failed to add members"));
    }
  }

  async function confirmDelete() {
    if (!project) return;
    const ok = window.confirm(`Delete project '${project.name}'? This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteProject({ slug: project.slug });
      toast.success("Project deleted");
      // navigate back
      window.location.href = "/new-dash/admin/projects";
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to delete project"));
    }
  }

  function toNum(v?: string) {
    if (v === undefined) return undefined;
    const trimmed = v.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  async function save() {
    if (!project || !form) return;
    try {
      await updateProject({
        slug: project.slug,
        name: project.name,
        description: project.description,
        members: project.members ?? [],
        slaP0Hours: toNum(form.slaP0),
        slaP1Hours: toNum(form.slaP1),
        slaP2Hours: toNum(form.slaP2),
        slaP3Hours: toNum(form.slaP3),
      });
      toast.success("SLA hours updated");
      setEditOpen(false);
      setForm(null);
    } catch (err: unknown) {
      const message = errorMessage(err, "Failed to update SLAs");
      setFormError(message);
      toast.error(message);
    }
  }

  // privilege check (reuse logic subset)
  const PRIV_SET = new Set(["admin","it_support","irt","security_delegate","senior_management","legal","comms","external_specialists"]);
  const isPrivileged = (me?.roles ?? []).some((r: string) => PRIV_SET.has(r?.toLowerCase?.())) || false;

  const memberRows = useMemo(() => {
    if (!project) return [] as { authUserId: string; email: string; name?: string; roles?: string[]; source: string }[];
    const explicit = new Set(project.members ?? []);
    const rows: { authUserId: string; email: string; name?: string; roles?: string[]; source: string }[] = [];
    for (const u of users ?? []) {
      const inExplicit = explicit.has(u.authUserId);
      const inUserProjects = (u.projects ?? []).includes(slug);
      if (inExplicit || inUserProjects) {
        rows.push({ authUserId: u.authUserId, email: u.email, name: u.name, roles: u.roles, source: inExplicit && inUserProjects ? "both" : inExplicit ? "project" : "user" });
      }
    }
    // stable sort: project source first, then user, then both last (or alphabetical?)
    return rows.sort((a, b) => a.email.localeCompare(b.email));
  }, [project, users, slug]);

  if (!project) {
    if (!projects) {
      return <div className="p-6 text-sm flex items-center gap-2 text-muted-foreground"><LoadingSpinner size="sm" /> Loading project…</div>;
    }
    return <div className="p-6 text-sm text-muted-foreground">Project not found. <Link href="/admin/projects" className="underline">Back</Link></div>;
  }

  if (!isPrivileged) {
    return <div className="p-6 text-sm text-muted-foreground">Not authorized.</div>;
  }

  return (
    <div className=" p-6 space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between gap-2 md:flex-row">
          <div>
            <CardTitle>Project: {project.name}</CardTitle>
            <CardDescription className="text-xs">Slug: {project.slug}</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={openEdit}>Edit SLAs</Button>
            <Button variant="outline" size="sm" onClick={openAdd}>Add Members</Button>
            <Button variant={project.suspended ? "secondary" : "destructive"} size="sm" onClick={toggleSuspend}>
              {project.suspended ? "Resume" : "Suspend"}
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>Delete</Button>
            <Button asChild variant="ghost" size="sm"><Link href="/new-dash/admin/projects">Back</Link></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
      {project.description && <p className="text-sm text-muted-foreground max-w-2xl">{project.description}</p>}

      {project.suspended && (
        <div className="text-xs px-3 py-2 rounded bg-red-50 text-red-600 border border-red-200">
          This project is currently suspended. New tickets should not be created for it until resumed.
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-medium">SLA Hours</h2>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="px-2 py-1 rounded bg-muted">P0: {typeof project.slaP0Hours === 'number' ? project.slaP0Hours : '—'}</span>
          <span className="px-2 py-1 rounded bg-muted">P1: {typeof project.slaP1Hours === 'number' ? project.slaP1Hours : '—'}</span>
          <span className="px-2 py-1 rounded bg-muted">P2: {typeof project.slaP2Hours === 'number' ? project.slaP2Hours : '—'}</span>
          <span className="px-2 py-1 rounded bg-muted">P3: {typeof project.slaP3Hours === 'number' ? project.slaP3Hours : '—'}</span>
        </div>
        <p className="text-[10px] text-muted-foreground">These values determine ticket due dates when creating tickets under this project.</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Members</h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">{memberRows.length}</span>
        </div>
        {users ? (
          memberRows.length === 0 ? (
            <div className="text-xs text-muted-foreground">No users associated with this project yet.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs table-fixed border-collapse [&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-wide" aria-label="Project members table">
                <thead className="text-muted-foreground select-none">
                  <tr className="bg-muted/30">
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[220px]">Name</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[260px]">Email</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Roles</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[120px]">Source</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="[&_tr]:transition-colors">
                  {memberRows.map(u => (
                    <tr key={u.authUserId} className="hover:bg-muted/40">
                      <td className="px-3 py-2 border border-border whitespace-nowrap">
                        <span className="font-medium text-[11px]">{u.name || u.email}</span>
                      </td>
                      <td className="px-3 py-2 border border-border whitespace-nowrap text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-2 border border-border max-w-[420px] truncate text-muted-foreground">
                        {(u.roles ?? []).slice(0,3).join(", ")}{(u.roles ?? []).length > 3 && "…"}
                      </td>
                      <td className="px-3 py-2 border border-border">
                        <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {u.source}
                        </span>
                      </td>
                      <td className="px-3 py-2 border border-border">
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => removeMember(u.authUserId)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoadingSpinner size="sm" /> Loading users…</div>
        )}
      </div>
        </CardContent>
      </Card>
      <Dialog open={editOpen && !!form}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit SLA Hours</DialogTitle>
            <DialogDescription>Set per-priority resolution time in hours (leave blank to fall back to global defaults).</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-4 py-2">
              <div>
                <Label className="text-xs">P0 (hours)</Label>
                <Input type="number" min={0} value={form.slaP0 ?? ''} onChange={(e) => setForm({ ...form, slaP0: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">P1 (hours)</Label>
                <Input type="number" min={0} value={form.slaP1 ?? ''} onChange={(e) => setForm({ ...form, slaP1: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">P2 (hours)</Label>
                <Input type="number" min={0} value={form.slaP2 ?? ''} onChange={(e) => setForm({ ...form, slaP2: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">P3 (hours)</Label>
                <Input type="number" min={0} value={form.slaP3 ?? ''} onChange={(e) => setForm({ ...form, slaP3: e.target.value })} />
              </div>
              {formError && <p className="col-span-2 text-[11px] text-red-500">{formError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditOpen(false); setForm(null); }}>Cancel</Button>
            <Button onClick={save} disabled={!form}>Save SLAs</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={addOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Members</DialogTitle>
            <DialogDescription>Select users to add to this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <MultipleSelector
              options={(users ?? []).map(u => ({ value: u.authUserId, label: `${u.name || u.email || u.authUserId} · ${u.authUserId}`, disable: (project.members ?? []).includes(u.authUserId) }))}
              value={addSelected}
              onChange={setAddSelected}
              placeholder="Search and select users"
            />
            {addError && <p className="text-[11px] text-red-500">{addError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAddOpen(false); }}>Cancel</Button>
            <Button onClick={addMembers} disabled={addSelected.length === 0}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
