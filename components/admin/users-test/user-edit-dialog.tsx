"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { updateUserDetails } from "@/lib/updateUser";
import { updateUserRole } from "@/utils/auth";
import type { UserWithDetails } from "@/utils/users";
import OrgCombobox from "@/components/comp-230";
import { useListOrganizations, organization } from "@/lib/auth-client";
import { addTeamMember, AllowedRole } from "@/lib/addTeamMember";
import { toast } from "sonner";

interface UserEditDialogProps {
  user: UserWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (patch?: Partial<UserWithDetails> & { id: string }) => void;
}

const ROLE_OPTIONS = ["admin", "provider", "scribe", "scribeAdmin", "demo"] as const;
type RoleValue = typeof ROLE_OPTIONS[number];

export function UserEditDialog({ user, isOpen, onClose, onSuccess }: UserEditDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleValue | "">("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: orgs } = useListOrganizations();
  const [orgsLocal, setOrgsLocal] = useState<{ id: string; name: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [addingOrg, setAddingOrg] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  useEffect(() => {
    if (Array.isArray(orgs)) {
      const mapped = (orgs as unknown[]).map((o) => {
        if (o && typeof o === 'object') {
          const id = (o as Record<string, unknown>).id;
            const name = (o as Record<string, unknown>).name;
          if (typeof id === 'string' && typeof name === 'string') {
            return { id, name };
          }
        }
        return undefined;
      }).filter(Boolean) as { id: string; name: string }[];
      setOrgsLocal(mapped);
    }
  }, [orgs]);

  useEffect(() => {
    if (user && isOpen) {
      setName(user.name || "");
      setEmail(user.email || "");
      setRole((user.role as RoleValue) || "");
      setEmailVerified(!!user.verified);
      setSelectedOrgId(undefined);
      setAddingOrg(false);
      setCreatingOrg(false);
      setNewOrgName("");
      setError(null);
      setSubmitting(false);
    }
  }, [user, isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      // Update basic fields
      const res = await updateUserDetails({
        userId: user.id,
        name: name.trim() || user.name,
        email: email.trim() || user.email,
        emailVerified,
      });
      if (!res.ok) throw new Error(res.error || "Failed to update user");

      // Update role if changed (reuse existing logic)
      if (role && role !== user.role) {
        await updateUserRole(user.id, role as RoleValue);
      }

      // If an org selected to add – map role to org role (reuse logic from add dialog)
      if (selectedOrgId) {
        const mapRoleToOrgRole = (r: string): AllowedRole => {
          switch (r) {
            case "provider":
              return "provider";
            case "scribe":
              return "scribe";
            case "admin":
              return "Teamadmin";
            case "scribeAdmin":
              return "scribe";
            case "demo":
              return "member";
            default:
              return "member";
          }
        };
        const memberRes = await addTeamMember({ userId: user.id, organizationId: selectedOrgId, role: mapRoleToOrgRole(role || user.role || "member") });
        if (!memberRes.ok) toast.error("Failed to add organization"); else toast.success("Organization added");
      }

      // Build patch for optimistic update
      const patch: Partial<UserWithDetails> & { id: string } = { id: user.id };
      if (name.trim() && name.trim() !== user.name) patch.name = name.trim();
      if (email.trim() && email.trim() !== user.email) patch.email = email.trim();
      patch.verified = emailVerified;
      if (role && role !== user.role) patch.role = role;
      if (selectedOrgId) {
        const orgAdded = orgsLocal.find(o => o.id === selectedOrgId);
        if (orgAdded) {
          const existing = user.organizations || [];
          patch.organizations = existing.some(o => o.id === orgAdded.id)
            ? existing
            : [...existing, { id: orgAdded.id, name: orgAdded.name }];
        }
      }
      onSuccess(patch);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Edit User</DialogTitle>
        </DialogHeader>
        {user ? (
          <form onSubmit={handleSubmit} className="space-y-4 text-sm">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as RoleValue)}>
                <SelectTrigger id="role" className="h-9">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(r => (
                    <SelectItem key={r} value={r}>{r === "scribeAdmin" ? "Scribe Admin" : r.charAt(0).toUpperCase()+r.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 mt-2">
              <Checkbox id="verified" checked={emailVerified} onCheckedChange={(v) => setEmailVerified(!!v)} />
              <Label htmlFor="verified" className="text-xs">Email Verified</Label>
            </div>
            {/* Existing organizations */}
            <div className="space-y-2 pt-2">
              <Label className="text-xs">Organizations</Label>
              {user.organizations && user.organizations.length ? (
                <div className="flex flex-wrap gap-1">
                  {user.organizations.map(o => (
                    <span key={o.id} className="px-2 py-0.5 rounded bg-muted border text-[10px] leading-4">{o.name}</span>
                  ))}
                </div>
              ) : <p className="text-[10px] text-muted-foreground">No organizations</p>}
            </div>
            {/* Add organization section */}
            <div className="space-y-2 pt-2 border-t">
              <button type="button" onClick={() => setAddingOrg(v => !v)} className="text-xs underline text-primary">
                {addingOrg ? "Cancel adding organization" : "Add organization"}
              </button>
              {addingOrg && (
                <div className="space-y-2 border rounded p-3">
                  {!creatingOrg && (
                    <OrgCombobox
                      organizations={orgsLocal.map(o => ({ value: o.id, label: o.name }))}
                      value={selectedOrgId}
                      onSelect={(v) => setSelectedOrgId(v || undefined)}
                      onCreate={() => { setCreatingOrg(true); setNewOrgName(""); }}
                    />
                  )}
                  {creatingOrg && (
                    <div className="space-y-2">
                      <Input placeholder="New organization name" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" disabled={!newOrgName.trim()} onClick={async () => {
                          try {
                            const name = newOrgName.trim();
                            if (!name) return;
                            const slug = name.toLowerCase().replace(/\s+/g, "-");
                            const res = await organization.create({ name, slug });
                            // Attempt to parse same as add dialog
                            const parse = (raw: unknown): { id: string; name: string } | undefined => {
                              if (!raw || typeof raw !== 'object') return undefined;
                              const r = raw as Record<string, unknown>;
                              const dataVal = r['data'];
                              if (dataVal && typeof dataVal === 'object') {
                                const orgVal = (dataVal as Record<string, unknown>)['organization'];
                                if (orgVal && typeof orgVal === 'object') {
                                  const id = (orgVal as Record<string, unknown>)['id'];
                                  const name = (orgVal as Record<string, unknown>)['name'];
                                  if (typeof id === 'string' && typeof name === 'string') return { id, name };
                                }
                              }
                              const directOrg = r['organization'];
                              if (directOrg && typeof directOrg === 'object') {
                                const id = (directOrg as Record<string, unknown>)['id'];
                                const name = (directOrg as Record<string, unknown>)['name'];
                                if (typeof id === 'string' && typeof name === 'string') return { id, name };
                              }
                              const id = r['id'];
                              const name = r['name'];
                              if (typeof id === 'string' && typeof name === 'string') return { id, name };
                              return undefined;
                            };
                            const parsed = parse(res);
                            if (parsed) {
                              setOrgsLocal(prev => prev.some(o => o.id === parsed.id) ? prev : [...prev, parsed]);
                              setSelectedOrgId(parsed.id);
                              toast.success("Organization created");
                            } else toast.success("Organization created");
                          } catch (e) {
                            console.error(e);
                            toast.error("Failed to create organization");
                          } finally {
                            setCreatingOrg(false);
                          }
                        }}>Save</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setCreatingOrg(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">Selecting an organization here will add the user upon saving.</p>
                </div>
              )}
            </div>
            {error && <div className="text-xs text-destructive bg-destructive/10 border border-destructive/40 rounded px-2 py-1">{error}</div>}
            <DialogFooter className="pt-2 flex gap-2">
              <Button type="button" variant="outline" disabled={submitting} onClick={onClose} className="h-8">Cancel</Button>
              <Button type="submit" disabled={submitting} className="h-8">{submitting ? "Saving..." : "Save Changes"}</Button>
            </DialogFooter>
            <p className="text-[10px] text-muted-foreground mt-1">Changing the email will mark it as unverified unless you tick Email Verified.</p>
          </form>
        ) : (
          <div className="text-xs text-muted-foreground">No user selected.</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
