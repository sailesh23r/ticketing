"use client";

import { useMemo, use as usePromise } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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
    <div className=" p-6 space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between gap-2 md:flex-row">
          <div>
            <CardTitle>Project: {project.name}</CardTitle>
            <CardDescription className="text-xs">Slug: {project.slug}</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm"><Link href="/new-dash/admin/projects">Back to projects</Link></Button>
        </CardHeader>
        <CardContent className="space-y-4">
      {project.description && <p className="text-sm text-muted-foreground max-w-2xl">{project.description}</p>}

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
                  </tr>
                </thead>
                <tbody className="[&_tr]:transition-colors">
                  {memberRows.map(u => (
                    <tr key={u.authUserId} className="hover:bg-muted/40">
                      <td className="px-3 py-2 border border-gray-100 whitespace-nowrap">
                        <span className="font-medium text-[11px]">{u.name || u.email}</span>
                      </td>
                      <td className="px-3 py-2 border border-gray-100 whitespace-nowrap text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-2 border border-gray-100 max-w-[420px] truncate text-muted-foreground">
                        {(u.roles ?? []).slice(0,3).join(", ")}{(u.roles ?? []).length > 3 && "…"}
                      </td>
                      <td className="px-3 py-2 border border-gray-100">
                        <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {u.source}
                        </span>
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
    </div>
  );
}
