"use client";

import { useEffect, useMemo, useState, use as usePromise } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";
import { Trash } from "lucide-react";
import Link from "next/link";

export default function TeamDetailPage({ params }: { params: Promise<{ team: string }> }) {
  const { team } = usePromise(params);
  const decodedTeam = useMemo(() => {
    try { return decodeURIComponent(team); } catch { return team; }
  }, [team]);
  const { data: session } = authClient.useSession();
  const me = useQuery(api.users.getByAuthId, { authUserId: session?.user?.id ?? "" });
  const users = useQuery(api.users.listAll, {}) as | { _id: string; authUserId: string; email: string; name?: string; roles?: string[]; teams?: string[] }[] | undefined;
  const teamDoc = useQuery(api.teams.getById, { id: decodedTeam });
  const renameTeamTbl = useMutation(api.teams.renameTeam);
  const setMembers = useMutation(api.teams.setMembers);

  const PRIV_SET = new Set(["admin","it_support","irt","security_delegate","senior_management","legal","comms","external_specialists"]);
  const roles = ((me?.roles ?? []) as string[]).map(r=>r?.toLowerCase?.()).filter(Boolean) as string[];
  const sessionRole = (typeof (session?.user as unknown as { role?: string })?.role === 'string' ? (session?.user as unknown as { role?: string })?.role : "")!.toLowerCase();
  const isPrivileged = roles.some(r=>PRIV_SET.has(r)) || PRIV_SET.has(sessionRole);

  function slugify(name: string) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  type TeamDoc = { name?: string; members?: string[] } | null | undefined;
  const members = useMemo(() => {
    const td = teamDoc as TeamDoc;
    if (td && Array.isArray(td.members)) {
      const ids = new Set(td.members);
      return (users ?? []).filter(u => ids.has(u.authUserId));
    }
    // Fallback: derive by matching users.teams names that slugify to the slug in the URL
    return (users ?? []).filter(u => (u.teams ?? []).some(t => slugify(t) === decodedTeam));
  }, [users, teamDoc, decodedTeam]);

  const [working, setWorking] = useState(false);
  const [rename, setRename] = useState(decodedTeam);

  // Prefer canonical name; otherwise try to infer from users' team names matching the slug
  const derivedName = useMemo(() => {
    if (teamDoc?.name && typeof teamDoc.name === "string" && teamDoc.name.trim()) return teamDoc.name;
    const guess = (users ?? [])
      .flatMap(u => (u.teams ?? []))
      .find(t => slugify(t) === decodedTeam);
    return guess;
  }, [teamDoc?.name, users, decodedTeam]);

  // Initialize rename from loaded teamDoc name if available and user hasn't typed yet
  useEffect(() => {
    if (!derivedName) return;
    // If the current input holds the slug (or its slugified value), swap to the human-readable name
    if (rename === decodedTeam || slugify(rename) === decodedTeam) {
      if (rename !== derivedName) setRename(derivedName);
    }
  }, [derivedName, decodedTeam, rename]);

  async function renameTeam() {
    const newName = rename.trim(); if (!newName || newName === decodedTeam) return;
    setWorking(true);
    try {
      await renameTeamTbl({ id: decodedTeam, newName });
      toast.success(`Renamed to ${newName}`);
  } catch (err: unknown) { toast.error(errorMessage(err, "Failed to rename")); }
    finally { setWorking(false); }
  }

  async function removeMember(userId: string) {
    if (!userId) return;
    setWorking(true);
    try {
      const currentIds = members.map(m => m.authUserId).filter(Boolean);
      const updated = currentIds.filter(id => id !== userId);
      await setMembers({ id: decodedTeam, members: updated });
      toast.success("Removed from team");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to remove user"));
    } finally {
      setWorking(false);
    }
  }

  if (!me) return <div className="p-6 text-sm text-muted-foreground flex gap-2 items-center"><LoadingSpinner size="sm"/> Loading…</div>;
  if (!isPrivileged) return <div className="p-6 text-sm text-muted-foreground">Not authorized.</div>;

  return (
    <div className=" w-full p-6 space-y-6">
      <div className="flex items-center justify-between w-full">
  <h1 className="text-lg font-semibold">Team — {teamDoc?.name ?? (users?.flatMap(u => (u.teams ?? [])).find(t => slugify(t) === decodedTeam) ?? decodedTeam)}</h1>
    <Button asChild variant="outline" size="sm"><Link href="/new-dash/admin/teams">Back to teams</Link></Button>
  
      </div>
  {/* Feedback is provided via Sonner toasts */}

      <div className="space-y-4">
        <div>
          <Label className="text-xs">Rename team</Label>
          <div className="flex gap-2 items-center">
            <Input className="max-w-sm" value={rename} onChange={e=>setRename(e.target.value)} />
            <Button onClick={renameTeam} disabled={working || !rename.trim()}>Save</Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Members</Label>
            <span className="text-[11px] text-muted-foreground">{members.length} member{members.length===1?"":"s"}</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-xs table-fixed border-collapse [&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-wide" aria-label="Team members table">
              <thead className="text-muted-foreground select-none">
                <tr className="bg-muted/30">
                  <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[220px]">Name</th>
                  <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[260px]">Email</th>
                  <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Roles</th>
                  {/* <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[120px]">Actions</th> */}
                </tr>
              </thead>
              <tbody className="[&_tr]:transition-colors">
                {members.map(u => (
                  <tr key={u._id} className="hover:bg-muted/40">
                    <td className="px-3 py-2 border border-gray-100 whitespace-nowrap">
                      <span className="font-medium text-[11px]">{u.name || u.email}</span>
                    </td>
                    <td className="px-3 py-2 border border-gray-100 whitespace-nowrap text-muted-foreground">{u.email}</td>
                    <td className="px-3 py-2 border border-gray-100 max-w-[420px] truncate text-muted-foreground">
                      {(u.roles ?? []).join(", ") || "—"}
                    </td>
                    {/* <td className="px-3 py-2 border border-gray-100">
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="destructive" className="h-7" onClick={() => removeMember(u.authUserId)} disabled={working}>
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </td> */}
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-xs text-muted-foreground border border-gray-100">No members found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
