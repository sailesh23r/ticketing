"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import Link from "next/link";

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
  const [form, setForm] = useState<{ slug: string; name: string; description?: string; members?: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function startCreate() {
    setEditingSlug(null);
    setForm({ slug: "", name: "", description: "", members: "" });
    setFormOpen(true);
  }

  function startEdit(p: { slug: string; name: string; description?: string; members?: string[] }) {
    setEditingSlug(p.slug);
    setForm({ slug: p.slug, name: p.name, description: p.description ?? "", members: (p.members ?? []).join(", ") });
    setFormOpen(true);
  }

  async function save() {
    if (!form) return;
    setMsg(null);
    try {
      const members = form.members ? form.members.split(",").map((s) => s.trim()).filter(Boolean) : [];
      if (editingSlug === null) {
        await createProject({ slug: form.slug, name: form.name, description: form.description, members });
        setMsg("Project created");
      } else {
        await updateProject({ slug: form.slug, name: form.name, description: form.description, members });
        setMsg("Project updated");
      }
      setForm(null);
      setEditingSlug(null);
      setFormOpen(false);
    } catch {
      setMsg("Failed to save project");
    }
  }

  async function remove(slug: string) {
    setMsg(null);
    try {
      await deleteProject({ slug });
      setMsg("Project deleted");
    } catch {
      setMsg("Failed to delete project");
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Admin — Projects</h1>
      {!me ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoadingSpinner size="sm" /> Loading…</div>
      ) : !isPrivileged ? (
        <div className="text-sm text-muted-foreground">Not authorized to view this page.</div>
      ) : (
        <>
          {msg && <div className="mb-4 text-sm text-muted-foreground">{msg}</div>}
          <div className="mb-4 flex items-center gap-2">
            <Button onClick={startCreate}>Create project</Button>
          </div>
          <div className="space-y-4">
            {(projects ?? []).map((proj) => {
              const explicitMembers = proj.members?.length ?? 0;
              const dynamicUsers = projectUserCounts.get(proj.slug) ?? 0;
              // Prefer dynamic user count if available; show both if they differ
              const showBoth = explicitMembers > 0 && explicitMembers !== dynamicUsers;
              return (
                <Card key={proj._id}>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                      <span>{proj.name} <span className="text-xs text-muted-foreground">({proj.slug})</span></span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">
                        {dynamicUsers} user{dynamicUsers === 1 ? "" : "s"}
                      </span>
                      {showBoth && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-muted/70 text-muted-foreground" title="Explicit members stored on project record">
                          {explicitMembers} listed
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2">
                      <div className="text-xs text-muted-foreground">{proj.description}</div>
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant="outline"><Link href={`/admin/projects/${proj.slug}`}>View</Link></Button>
                        <Button size="sm" onClick={() => startEdit(proj)}>Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => remove(proj.slug)}>Delete</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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
                    <Label className="text-xs">Slug</Label>
                    <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
                <Button onClick={save} disabled={!form || !form.slug || !form.name}>{editingSlug === null ? "Create" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
