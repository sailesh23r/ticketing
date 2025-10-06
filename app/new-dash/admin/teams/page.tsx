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
import MultipleSelector from "@/components/ui/multiselect";

export default function AdminTeamsPage() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id as string | undefined;

  // Use teams table as canonical; fall back to users if teams table empty
  const teamsTbl = useQuery(api.teams.listAll, {}) as | { slug: string; name: string; members?: string[]; description?: string }[] | undefined;
  const users = useQuery(api.users.listAll, {}) as | { _id: string; authUserId: string; email: string; name?: string; roles?: string[]; projects?: string[]; teams?: string[] }[] | undefined;

  function slugify(name: string) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  type TeamRow = { team: string; slug: string; count: number; description?: string };
  const allTeams = useMemo<TeamRow[]>(() => {
    // Start with canonical teams from the table
    const byName = new Map<string, TeamRow>();
    for (const t of teamsTbl ?? []) {
      const team = t.name;
      const slug = t.slug;
      const count = (t.members ?? []).length;
      byName.set(team, { team, slug, count, description: t.description });
    }
    // Add any teams only present on users.teams (for compatibility)
    const derived = new Map<string, number>();
    for (const u of users ?? []) {
      for (const t of (u.teams ?? [])) {
        derived.set(t, (derived.get(t) ?? 0) + 1);
      }
    }
    for (const [team, count] of derived) {
      if (!byName.has(team)) byName.set(team, { team, slug: slugify(team), count });
    }
    return Array.from(byName.values()).sort((a, b) => a.team.localeCompare(b.team));
  }, [teamsTbl, users]);

  const me = useQuery(api.users.getByAuthId, { authUserId: userId ?? "" });

  const sessionRole = ((session?.user as unknown as { role?: string })?.role ?? "").toLowerCase();
  const meRoles = ((me?.roles ?? []) as string[]).map((r) => r?.toLowerCase?.()).filter(Boolean) as string[];
  const PRIV_SET = new Set(["admin", "it_support", "irt", "security_delegate", "senior_management", "legal", "comms", "external_specialists"]);
  const isPrivileged = meRoles.some((r) => PRIV_SET.has(r)) || PRIV_SET.has(sessionRole);

  const setTeams = useMutation(api.users.setTeams);
  const createTeamTbl = useMutation(api.teams.createTeam);
  const renameTeamTbl = useMutation(api.teams.renameTeam);
  const setTeamDesc = useMutation(api.teams.setDescription);
  const deleteTeamTbl = useMutation(api.teams.deleteTeam);

  // Using Sonner toasts instead of inline messages
  const [teamSearch, setTeamSearch] = useState("");
  const [createDialog, setCreateDialog] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [formDesc, setFormDesc] = useState<string>("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  // Renaming handled in edit dialog
  const [editDialog, setEditDialog] = useState<{ open: boolean; name?: string; slug?: string; description?: string }>({ open: false });
  const [editName, setEditName] = useState<string>("");
  const [editDesc, setEditDesc] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id?: string; label?: string }>({ open: false });

  const userOptions = useMemo(() => {
    return (users ?? []).map(u => ({ value: u.authUserId, label: `${u.name || u.email} (${u.email})` }));
  }, [users]);

  const filteredTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    const list = allTeams;
    if (!q) return list;
    return list.filter(t =>
      t.team.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q)
    );
  }, [allTeams, teamSearch]);

  async function createTeam() {
    if (!newTeamName.trim() || selectedMembers.length === 0) {
      const message = "Enter a team and select at least one member";
      setCreateError(message);
      toast.error(message);
      return;
    }
    setWorking(true);
    try {
      // Prefer teams table creation
      if (createTeamTbl) {
        const desc = formDesc.trim() ? formDesc.trim() : undefined;
        await createTeamTbl({ name: newTeamName.trim(), description: desc, members: selectedMembers });
      } else {
        // Fallback: write into users.teams
        for (const uid of selectedMembers) {
          const u = (users ?? []).find(x => x.authUserId === uid);
          const teams = Array.from(new Set([...(u?.teams ?? []), newTeamName.trim()]));
          await setTeams({ authUserId: uid, teams });
        }
      }
      toast.success(`Team "${newTeamName.trim()}" created`);
      setCreateDialog(false);
      setNewTeamName(""); setSelectedMembers([]); setFormDesc(""); setCreateError(null);
    } catch (err: unknown) {
      const message = errorMessage(err, "Failed to create team");
      setCreateError(message);
      toast.error(message);
    } finally { setWorking(false); }
  }

  // renameTeam handled within Edit dialog save

  async function deleteTeam(id: string, label?: string) {
    setWorking(true);
    try {
      if (deleteTeamTbl) await deleteTeamTbl({ id });
      else {
        const members = (users ?? []).filter(u => (u.teams ?? []).includes(id));
        for (const u of members) {
          const teams = (u.teams ?? []).filter(t => t !== id);
          await setTeams({ authUserId: u.authUserId, teams });
        }
      }
      toast.success(`Deleted team "${label ?? id}"`);
      setConfirmDelete({ open: false });
    } catch (err: unknown) {
      const message = errorMessage(err, "Failed to delete team");
      toast.error(message);
    } finally { setWorking(false); }
  }

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between w-full">
          <CardTitle>Admin — Teams</CardTitle>
          <Button onClick={() => setCreateDialog(true)}>New Team</Button>
        </CardHeader>
        <CardContent>
      {!me ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoadingSpinner size="sm" /> Loading…</div>
      ) : !isPrivileged ? (
        <div className="text-sm text-muted-foreground">Not authorized to view this page.</div>
      ) : (
        <>
          {/* Feedback is shown via Sonner toasts */}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                placeholder="Search team name"
                className="h-8 w-[280px] rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-1"
              />
              <span className="text-[11px] text-muted-foreground">{filteredTeams.length} team{filteredTeams.length===1?"":"s"}</span>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs table-fixed border-collapse [&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-wide" aria-label="Teams administration table">
                <thead className="text-muted-foreground select-none">
                  <tr className="bg-muted/30">
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Team</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[180px]">Slug</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Description</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[140px]">Members</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium w-[180px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="[&_tr]:transition-colors">
                  {filteredTeams.map((t: TeamRow) => (
                    <tr key={t.team} className="hover:bg-muted/40">
                      <td className="px-3 py-2 border border-gray-100 whitespace-nowrap">
                        <span className="font-medium text-[11px]">{t.team}</span>
                      </td>
                      <td className="px-3 py-2 border border-gray-100 whitespace-nowrap">
                        <span className="text-[11px] text-muted-foreground">{t.slug ?? slugify(t.team)}</span>
                      </td>
                      <td className="px-3 py-2 border border-gray-100 max-w-[420px] truncate text-muted-foreground">{t.description ?? '—'}</td>
                      <td className="px-3 py-2 border border-gray-100">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">{t.count} user{t.count===1?'':'s'}</span>
                      </td>
                      <td className="px-3 py-2 border border-gray-100">
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="outline" className="h-7" asChild>
                            <Link href={`/new-dash/admin/teams/${encodeURIComponent(t.slug)}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button size="icon" variant="outline" className="h-7" onClick={() => { setEditDialog({ open: true, name: t.team, slug: t.slug, description: t.description }); setEditName(t.team); setEditDesc(t.description ?? ""); }}>
                            <Pen className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="destructive" className="h-7" onClick={() => setConfirmDelete({ open: true, id: t.slug, label: t.team })}>
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredTeams.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-xs text-muted-foreground border border-gray-100">No teams found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Create team dialog */}
          <Dialog open={createDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create team</DialogTitle>
                <DialogDescription>Teams are created by assigning them to users.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label className="text-xs">Team name</Label>
                  <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} />
                  {createError && (
                    <p className="text-xs text-red-500 mt-1">{createError}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Description (optional)</Label>
                  <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Members</Label>
                  <MultipleSelector
                    placeholder="Select members"
                    options={userOptions}
                    value={selectedMembers.map(id => ({ value: id, label: userOptions.find(o => o.value===id)?.label || id }))}
                    onChange={opts => setSelectedMembers(opts.map(o=>o.value))}
                    emptyIndicator={<p className="text-center text-xs">No results</p>}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setCreateDialog(false); setNewTeamName(""); setSelectedMembers([]); setFormDesc(""); setCreateError(null); }}>Cancel</Button>
                <Button onClick={createTeam} disabled={working || !newTeamName.trim() || selectedMembers.length===0}>{working? 'Creating…':'Create'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit team dialog */}
          <Dialog open={editDialog.open}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit team</DialogTitle>
                <DialogDescription>Change the team name and description.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setEditDialog({ open: false }); setEditName(""); setEditDesc(""); }}>Cancel</Button>
                <Button onClick={async () => {
                  if (!editDialog.name) return;
                  setWorking(true);
                  try {
                    const originalId = (editDialog.slug || editDialog.name).trim();
                    const newName = editName.trim();
                    const desc = editDesc.trim();
                    if (newName && newName !== editDialog.name.trim()) {
                      await renameTeamTbl({ id: originalId, newName });
                    }
                    await setTeamDesc({ id: newName || originalId, description: desc || undefined });
                    toast.success("Team updated");
                    setEditDialog({ open: false }); setEditName(""); setEditDesc("");
                  } catch (err: unknown) {
                    const message = errorMessage(err, "Failed to update team");
                    toast.error(message);
                  } finally { setWorking(false); }
                }}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete confirm dialog */}
          <Dialog open={confirmDelete.open}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete team</DialogTitle>
                <DialogDescription>Remove this team from all members. This cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmDelete({ open: false })}>Cancel</Button>
                <Button variant="destructive" onClick={() => confirmDelete.id && deleteTeam(confirmDelete.id, confirmDelete.label)} disabled={working}>Delete</Button>
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
