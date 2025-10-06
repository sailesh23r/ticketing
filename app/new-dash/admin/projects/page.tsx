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
    | { _id: string; slug: string; name: string; description?: string; members?: string[] }[]
    | undefined;

  // Fetch all users to derive dynamic membership counts (users who have the project in their projects array)
  const users = useQuery(api.users.listAll, {}) as | { projects?: string[] }[] | undefined;

  const projectUserCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users ?? []) {
      for (const proj of (u.projects ?? [])) {
        map.set(proj, (map.get(proj) ?? 0) + 1);
      }
    }
    return map;
  }, [users]);

  const me = useQuery(api.users.getByAuthId, { authUserId: userId ?? "" });

  const sessionRole = ((session?.user as unknown as { role?: string })?.role ?? "").toLowerCase();
  const meRoles = ((me?.roles ?? []) as string[]).map((r) => r?.toLowerCase?.()).filter(Boolean) as string[];
  const PRIV_SET = new Set(["admin", "it_support", "irt", "security_delegate", "senior_management", "legal", "comms", "external_specialists"]);
  const isPrivileged = meRoles.some((r) => PRIV_SET.has(r)) || PRIV_SET.has(sessionRole);

  const createProject = useMutation(api.projects.createProject);
  const updateProject = useMutation(api.projects.updateProject);
  const deleteProject = useMutation(api.projects.deleteProject);

  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  // Keep slug only for identifying an existing project on edit; on create we compute from name.
  const [form, setForm] = useState<{ slug: string; name: string; description?: string; members?: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Using Sonner toasts for feedback
  const [projectSearch, setProjectSearch] = useState("");

  function slugify(name: string) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function startCreate() {
    setEditingSlug(null);
    setForm({ slug: "", name: "", description: "", members: "" });
    setFormOpen(true);
    setFormError(null);
  }

  function startEdit(p: { slug: string; name: string; description?: string; members?: string[] }) {
    setEditingSlug(p.slug);
    setForm({ slug: p.slug, name: p.name, description: p.description ?? "", members: (p.members ?? []).join(", ") });
    setFormOpen(true);
    setFormError(null);
  }

  async function save() {
    if (!form) return;
    try {
      const members = form.members ? form.members.split(",").map((s) => s.trim()).filter(Boolean) : [];
      if (editingSlug === null) {
        const computedSlug = slugify(form.name);
        await createProject({ slug: computedSlug, name: form.name, description: form.description, members });
        toast.success("Project created");
      } else {
        await updateProject({ slug: form.slug, name: form.name, description: form.description, members });
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
                        <td className="px-3 py-2 border border-gray-100 whitespace-nowrap" title={proj.name}>
                          <div className="flex flex-col">
                            <span className="font-medium text-[11px] leading-tight truncate max-w-[200px]" title={proj.name}>{proj.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 border border-gray-100 font-mono text-[11px]">{proj.slug}</td>
                        <td className="px-3 py-2 border border-gray-100 max-w-[420px] truncate text-muted-foreground">{proj.description || '—'}</td>
                        <td className="px-3 py-2 border border-gray-100">
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
                        <td className="px-3 py-2 border border-gray-100">
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
                      <td colSpan={5} className="text-center py-8 text-xs text-muted-foreground border border-gray-100">No projects found.</td>
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
                    <Label className="text-xs">Members (comma separated auth user ids)</Label>
                    <Input value={form.members} onChange={(e) => setForm({ ...form, members: e.target.value })} />
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
