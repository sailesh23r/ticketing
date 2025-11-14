"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import MultipleSelector, { Option as MSOption } from "@/components/ui/multiselect";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Pen, Trash } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";
// import Link from "next/link";

export default function AdminProjectsPage() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id as string | undefined;

  const projects = useQuery(api.projects.listProjects) as
    | { _id: string; slug: string; name: string; description?: string; members?: string[]; suspended?: boolean; slaP0Hours?: number; slaP1Hours?: number; slaP2Hours?: number; slaP3Hours?: number }[]
    | undefined;

  // Fetch all users to derive dynamic membership counts (users who have the project in their projects array)
  const users = useQuery(api.users.listAll, {}) as | { authUserId: string; email: string; name?: string; projects?: string[] }[] | undefined;

  const projectUserCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users ?? []) {
      for (const proj of (u.projects ?? [])) {
        map.set(proj, (map.get(proj) ?? 0) + 1);
      }
    }
    return map;
  }, [users]);

  const userOptions = useMemo<MSOption[]>(() => {
    return (users ?? []).map(u => ({
      value: u.authUserId,
      label: `${u.name || u.email || u.authUserId} · ${u.authUserId}`,
    }));
  }, [users]);

  const me = useQuery(api.users.getByAuthId, { authUserId: userId ?? "" });

  const sessionRole = ((session?.user as unknown as { role?: string })?.role ?? "").toLowerCase();
  const meRoles = ((me?.roles ?? []) as string[]).map((r) => r?.toLowerCase?.()).filter(Boolean) as string[];
  const PRIV_SET = new Set(["admin", "it_support", "irt", "security_delegate", "senior_management", "legal", "comms", "external_specialists"]);
  const isPrivileged = meRoles.some((r) => PRIV_SET.has(r)) || PRIV_SET.has(sessionRole);

  const createProject = useMutation(api.projects.createProject);
  const updateProject = useMutation(api.projects.updateProject);
  const deleteProject = useMutation(api.projects.deleteProject);
  const setProjectMembers = useMutation(api.projects.setProjectMembers);

  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  // Keep slug only for identifying an existing project on edit; on create we compute from name.
  const [form, setForm] = useState<{ slug: string; name: string; description?: string; members: string[]; slaP0?: string; slaP1?: string; slaP2?: string; slaP3?: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Using Sonner toasts for feedback
  const [projectSearch, setProjectSearch] = useState("");

  function slugify(name: string) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function startCreate() {
    setEditingSlug(null);
  setForm({ slug: "", name: "", description: "", members: [], slaP0: "", slaP1: "", slaP2: "", slaP3: "" });
    setFormOpen(true);
    setFormError(null);
  }

  function startEdit(p: { slug: string; name: string; description?: string; members?: string[]; slaP0Hours?: number; slaP1Hours?: number; slaP2Hours?: number; slaP3Hours?: number }) {
    setEditingSlug(p.slug);
    setForm({
      slug: p.slug,
      name: p.name,
      description: p.description ?? "",
      members: p.members ?? [],
      slaP0: (p.slaP0Hours ?? "").toString(),
      slaP1: (p.slaP1Hours ?? "").toString(),
      slaP2: (p.slaP2Hours ?? "").toString(),
      slaP3: (p.slaP3Hours ?? "").toString(),
    });
    setFormOpen(true);
    setFormError(null);
  }

  async function save() {
    if (!form) return;
    try {
  const members = form.members;
      const toNum = (v?: string) => {
        if (v === undefined) return undefined;
        const trimmed = v.trim();
        if (!trimmed) return undefined;
        const n = Number(trimmed);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      };
      if (editingSlug === null) {
        const computedSlug = slugify(form.name);
        await createProject({
          slug: computedSlug,
          name: form.name,
          description: form.description,
          members,
          slaP0Hours: toNum(form.slaP0),
          slaP1Hours: toNum(form.slaP1),
          slaP2Hours: toNum(form.slaP2),
          slaP3Hours: toNum(form.slaP3),
        });
        if (members.length > 0) {
          await setProjectMembers({ slug: computedSlug, members });
        }
        toast.success("Project created");
      } else {
        await updateProject({
          slug: form.slug,
          name: form.name,
          description: form.description,
          members,
          slaP0Hours: toNum(form.slaP0),
          slaP1Hours: toNum(form.slaP1),
          slaP2Hours: toNum(form.slaP2),
          slaP3Hours: toNum(form.slaP3),
        });
        await setProjectMembers({ slug: form.slug, members });
        toast.success("Project updated");
      }
      setForm(null);
      setEditingSlug(null);
      setFormOpen(false);
      setFormError(null);
    } catch (err: unknown) {
      const message = errorMessage(err, "Failed to save project");
      setFormError(message);
      toast.error(message);
    }
  }

  async function remove(slug: string) {
    try {
      await deleteProject({ slug });
      toast.success("Project deleted");
    } catch (err: unknown) {
      const message = errorMessage(err, "Failed to delete project");
      toast.error(message);
    }
  }

  const filteredProjects = useMemo(() => {
    const list = projects ?? [];
    const q = projectSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q)
    );
  }, [projects, projectSearch]);

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Admin — Projects</CardTitle>
          <Button onClick={startCreate}>New Project</Button>
        </CardHeader>
        <CardContent>
      {!me ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoadingSpinner size="sm" /> Loading…</div>
      ) : !isPrivileged ? (
        <div className="text-sm text-muted-foreground">Not authorized to view this page.</div>
      ) : (
        <>
          {/* Feedback is displayed via Sonner toasts */}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={projectSearch}
                onChange={e => setProjectSearch(e.target.value)}
                placeholder="Search name / slug / description"
                className="h-8 w-[280px] rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-1"
              />
              <span className="text-[11px] text-muted-foreground">{filteredProjects.length} project{filteredProjects.length === 1 ? "" : "s"}</span>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs table-fixed border-collapse [&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-wide" aria-label="Projects administration table">
                <thead className="text-muted-foreground select-none">
                  <tr className="bg-muted/30">
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[220px]">Name</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[160px]">Slug</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Description</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[220px]">SLA (hours P0–P3)</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[120px]">Users</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[150px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="[&_tr]:transition-colors">
                  {filteredProjects.map(proj => {
                    const explicitMembers = proj.members?.length ?? 0;
                    const dynamicUsers = projectUserCounts.get(proj.slug) ?? 0;
                    const showBoth = explicitMembers > 0 && explicitMembers !== dynamicUsers;
                    return (
                      <tr key={proj._id} className="hover:bg-muted/40">
                        <td className="px-3 py-2 border border-border whitespace-nowrap" title={proj.name}>
                          <div className="flex items-center gap-2 max-w-[240px]">
                            <span className="font-medium text-[11px] leading-tight truncate" title={proj.name}>{proj.name}</span>
                            {proj.suspended && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 uppercase tracking-wide">Suspended</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 border border-border font-mono text-[11px]">{proj.slug}</td>
                        <td className="px-3 py-2 border border-border max-w-[420px] truncate text-muted-foreground">{proj.description || '—'}</td>
                        <td className="px-3 py-2 border border-border">
                          <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                            <span title="P0" className="px-1.5 py-0.5 rounded bg-muted">P0: {typeof proj.slaP0Hours === 'number' ? proj.slaP0Hours : '—'}</span>
                            <span title="P1" className="px-1.5 py-0.5 rounded bg-muted">P1: {typeof proj.slaP1Hours === 'number' ? proj.slaP1Hours : '—'}</span>
                            <span title="P2" className="px-1.5 py-0.5 rounded bg-muted">P2: {typeof proj.slaP2Hours === 'number' ? proj.slaP2Hours : '—'}</span>
                            <span title="P3" className="px-1.5 py-0.5 rounded bg-muted">P3: {typeof proj.slaP3Hours === 'number' ? proj.slaP3Hours : '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 border border-border">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">
                              {dynamicUsers} user{dynamicUsers === 1 ? '' : 's'}
                            </span>
                            {showBoth && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-muted/70 text-muted-foreground" title="Explicit members stored on project record">
                                {explicitMembers} listed
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 border border-border">
                          <div className="flex items-center gap-2">
                            <Button size="icon" variant="outline" className="h-7 text-[11px]" asChild>
                              <Link href={`/new-dash/admin/projects/${proj.slug}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button size="icon" variant="outline" className="h-7 text-[11px]" onClick={() => startEdit(proj)}>
                              <Pen className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="destructive" className="h-7 text-[11px]" onClick={() => remove(proj.slug)}>
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProjects.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground border border-border">No projects found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <Dialog open={formOpen && !!form}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingSlug === null ? "Create project" : `Edit ${editingSlug}`}</DialogTitle>
                <DialogDescription>{editingSlug === null ? "Add a new project" : "Modify project details"}</DialogDescription>
              </DialogHeader>
              {form && (
                <div className="space-y-3 py-2">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    {formError && <p className="text-xs text-red-500 mt-1">{formError}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Members</Label>
                    <MultipleSelector
                      options={userOptions}
                      value={userOptions.filter(o => form.members.includes(o.value))}
                      onChange={(opts) => setForm({ ...form!, members: opts.map(o => o.value) })}
                      placeholder="Select members"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">SLA P0 (hours)</Label>
                      <Input value={form.slaP0 ?? ""} onChange={(e) => setForm({ ...form, slaP0: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-xs">SLA P1 (hours)</Label>
                      <Input value={form.slaP1 ?? ""} onChange={(e) => setForm({ ...form, slaP1: e.target.value })} placeholder="1" />
                    </div>
                    <div>
                      <Label className="text-xs">SLA P2 (hours)</Label>
                      <Input value={form.slaP2 ?? ""} onChange={(e) => setForm({ ...form, slaP2: e.target.value })} placeholder="2" />
                    </div>
                    <div>
                      <Label className="text-xs">SLA P3 (hours)</Label>
                      <Input value={form.slaP3 ?? ""} onChange={(e) => setForm({ ...form, slaP3: e.target.value })} placeholder="4" />
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setForm(null); setEditingSlug(null); setFormOpen(false); }}>Cancel</Button>
                <Button onClick={save} disabled={!form || !form.name}>{editingSlug === null ? "Create" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
        </CardContent>
      </Card>
    </div>
  );
}
