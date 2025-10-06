"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";

const BA_ROLES = ["user", "admin"] as const;

type BA_Role = typeof BA_ROLES[number];

type BAUser = {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  twoFactorEnabled: boolean | null;
};

function InlineEdit({ value, onSave }: { value: string; onSave: (val: string) => Promise<void> }) {
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <>
          <Input value={v} onChange={(e) => setV(e.target.value)} className="h-8" />
          <button className="px-2 py-1 rounded-md border text-xs hover:bg-accent" onClick={async () => { await onSave(v); setEditing(false); }}>Save</button>
          <button className="px-2 py-1 rounded-md border text-xs hover:bg-accent" onClick={() => { setV(value); setEditing(false); }}>Cancel</button>
        </>
      ) : (
        <>
          <span>{value || "—"}</span>
          <button className="px-2 py-1 rounded-md border text-xs hover:bg-accent" onClick={() => setEditing(true)}>Edit</button>
        </>
      )}
    </div>
  );
}

export default function RolesAdminPage() {
  const { data: session } = authClient.useSession();
  const me = useQuery(api.users.getByAuthId, { authUserId: session?.user?.id ?? "" });
  const isPrivileged = (me?.roles ?? []).some((r: string) => [
    "it_support",
    "irt",
    "security_delegate",
    "senior_management",
    "legal",
    "admin",
  ].includes(r?.toLowerCase?.()));

  const upsertFromAuth = useMutation(api.users.upsertFromAuth);

  const [users, setUsers] = useState<BAUser[]>([]);
  const [filter, setFilter] = useState("");
  // Compute filtered list on every render to avoid conditional hooks
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (users ?? []).filter((u) => !q || u.email.toLowerCase().includes(q) || u.id.toLowerCase().includes(q) || (u.name ?? "").toLowerCase().includes(q));
  }, [users, filter]);

  const [createInput, setCreateInput] = useState<{ email: string; name: string; tempPassword: string; role: BA_Role }>(
    { email: "", name: "", tempPassword: "", role: "user" }
  );

  async function refresh(q?: string) {
    try {
      const res = await fetch(`/api/admin/user/list${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users as BAUser[]);
      }
    } finally {
    }
  }

  useEffect(() => {
    refresh(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => refresh(filter), 300);
    return () => clearTimeout(t);
  }, [filter]);

  if (!isPrivileged) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent>You do not have permission to manage users.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Create user (Better Auth) */}
          <div className="border rounded-md p-3 grid gap-3">
            <div className="text-sm font-medium">Create user (Better Auth)</div>
            <div className="grid gap-2 md:grid-cols-4">
              <Input placeholder="Email" value={createInput.email} onChange={(e) => setCreateInput({ ...createInput, email: e.target.value })} />
              <Input placeholder="Name" value={createInput.name} onChange={(e) => setCreateInput({ ...createInput, name: e.target.value })} />
              <Input placeholder="Temp password" value={createInput.tempPassword} onChange={(e) => setCreateInput({ ...createInput, tempPassword: e.target.value })} />
              <select className="border rounded-md px-2 py-1 text-sm" value={createInput.role} onChange={(e) => setCreateInput({ ...createInput, role: e.target.value as BA_Role })}>
                {BA_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <button
                className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
                onClick={async () => {
                  if (!createInput.email || !createInput.name || !createInput.tempPassword) return;
                  const res = await fetch("/api/admin/user/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: createInput.email, name: createInput.name, tempPassword: createInput.tempPassword, role: createInput.role }),
                  });
                  if (res.ok) {
                    const { user } = await res.json();
                    // Mirror to Convex
                    await upsertFromAuth({ authUserId: user.id, email: user.email, name: user.name ?? undefined, role: user.role ?? undefined });
                    setCreateInput({ email: "", name: "", tempPassword: "", role: "user" });
                    refresh(filter);
                  }
                }}
              >Create</button>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <Input placeholder="Search by email, name or id" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" />
          </div>

          {/* Table */}
          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
              <div className="col-span-3">User</div>
              <div className="col-span-3">Email</div>
              <div className="col-span-2">BA Role</div>
              <div className="col-span-2">MFA</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            <div className="divide-y">
              {filtered?.map((u) => (
                <Row key={u.id} u={u} onUpdated={async (nu) => {
                  await upsertFromAuth({ authUserId: nu.id, email: nu.email, name: nu.name ?? undefined, role: nu.role ?? undefined });
                  refresh(filter);
                }} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ u, onUpdated }: { u: BAUser; onUpdated: (u: BAUser) => Promise<void> }) {
  const [role, setRole] = useState<BA_Role>((u.role as BA_Role) ?? "user");
  const [mfa, setMfa] = useState<boolean>(!!u.twoFactorEnabled);

  return (
    <div className="grid grid-cols-12 gap-2 items-center px-3 py-3">
      <div className="col-span-3 font-mono text-xs truncate">{u.id}</div>
      <div className="col-span-3 truncate">
        <InlineEdit value={u.email} onSave={async (val: string) => {
          const res = await fetch("/api/admin/user/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: u.id, email: val }) });
          if (res.ok) {
            const { user } = await res.json();
            await onUpdated({ ...u, email: user.email, name: user.name });
          }
        }} />
      </div>
      <div className="col-span-2">
        <select className="border rounded-md px-2 py-1 text-xs" value={role} onChange={(e) => setRole(e.target.value as BA_Role)}>
          {BA_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <button className={`px-2 py-1 rounded-md border text-xs ${mfa ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={async () => {
          const res = await fetch("/api/admin/user/mfa", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: u.id, enable: !mfa }) });
          if (res.ok) { const next = !mfa; setMfa(next); await onUpdated({ ...u, twoFactorEnabled: next }); }
        }}>{mfa ? "Enabled" : "Disabled"}</button>
      </div>
      <div className="col-span-2 text-right flex items-center justify-end gap-2">
        <button className="px-2 py-1 rounded-md border text-xs hover:bg-accent" onClick={async () => {
          const res = await fetch("/api/admin/user/role", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: u.id, role }) });
          if (res.ok) { await onUpdated({ ...u, role }); }
        }}>Set role</button>
      </div>
    </div>
  );
}
