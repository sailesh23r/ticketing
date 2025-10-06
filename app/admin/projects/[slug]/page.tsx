"use client";

import { useMemo, use as usePromise } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = usePromise(params);
  const { data: session } = authClient.useSession();
  const me = useQuery(api.users.getByAuthId, { authUserId: session?.user?.id ?? "" });
  const projects = useQuery(api.projects.listProjects) as | { slug: string; name: string; description?: string; members?: string[] }[] | undefined;
  const users = useQuery(api.users.listAll, {}) as | { authUserId: string; email: string; name?: string; roles?: string[]; projects?: string[] }[] | undefined;

  const project = useMemo(() => (projects ?? []).find(p => p.slug === slug), [projects, slug]);

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
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Project: {project.name}</h1>
          <p className="text-xs text-muted-foreground">Slug: {project.slug}</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/admin/projects">Back to projects</Link></Button>
      </div>
      {project.description && <p className="text-sm text-muted-foreground max-w-2xl">{project.description}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">Members <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">{memberRows.length}</span></CardTitle>
        </CardHeader>
        <CardContent>
          {users ? (
            memberRows.length === 0 ? (
              <div className="text-xs text-muted-foreground">No users associated with this project yet.</div>
            ) : (
              <div className="border rounded-md divide-y">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-[11px] font-medium text-muted-foreground">
                  <div className="col-span-3">User ID</div>
                  <div className="col-span-3">Email</div>
                  <div className="col-span-2">Name</div>
                  <div className="col-span-2">Roles</div>
                  <div className="col-span-2 text-right">Source</div>
                </div>
                {memberRows.map(u => (
                  <div key={u.authUserId} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs">
                    <div className="col-span-3 truncate font-mono">{u.authUserId}</div>
                    <div className="col-span-3 truncate">{u.email}</div>
                    <div className="col-span-2 truncate">{u.name || "—"}</div>
                    <div className="col-span-2 truncate">{(u.roles ?? []).slice(0,3).join(", ")}{(u.roles ?? []).length > 3 && "…"}</div>
                    <div className="col-span-2 text-right">
                      <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {u.source}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoadingSpinner size="sm" /> Loading users…</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
