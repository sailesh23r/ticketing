"use client";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Fallback Checkbox component if not present
// If a real Checkbox exists in ui/, replace import path above accordingly.

interface UserOption {
  authUserId: string;
  email: string;
  name?: string;
}

interface ProjectMembersMultiselectProps {
  users: UserOption[] | undefined;
  value: string[]; // selected auth user ids
  onChange: (next: string[]) => void;
  label?: string;
  disabledIds?: string[]; // optional list of ids that cannot be unchecked
  placeholder?: string;
  className?: string;
  maxDisplay?: number; // number of options to show before collapsing (optional)
}

export function ProjectMembersMultiselect({
  users,
  value,
  onChange,
  label = "Members",
  disabledIds = [],
  placeholder = "Search users by id, name or email",
  className,
  maxDisplay,
}: ProjectMembersMultiselectProps) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(value), [value]);
  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds]);

  const filtered = useMemo(() => {
    const all = users ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(u =>
      u.authUserId.toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.name || "").toLowerCase().includes(q)
    );
  }, [users, query]);

  const shown = useMemo(() => {
    if (typeof maxDisplay === "number" && filtered.length > maxDisplay) {
      return filtered.slice(0, maxDisplay);
    }
    return filtered;
  }, [filtered, maxDisplay]);

  function toggle(id: string) {
    const next = new Set(selectedSet);
    if (next.has(id)) {
      if (disabledSet.has(id)) return; // cannot remove
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(Array.from(next));
  }

  function clearAll() {
    const keep = Array.from(selectedSet).filter(id => disabledSet.has(id));
    onChange(keep);
  }

  return (
    <div className={className}>
      <Label className="text-xs mb-1 inline-block">{label}</Label>
      <div className="space-y-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
        <div className="max-h-48 overflow-auto rounded border divide-y">
          {shown.map(u => {
            const isChecked = selectedSet.has(u.authUserId);
            const isDisabled = disabledSet.has(u.authUserId);
            return (
              <button
                key={u.authUserId}
                type="button"
                onClick={() => toggle(u.authUserId)}
                className={`flex items-center w-full gap-2 px-2 py-1 text-left text-[11px] hover:bg-muted/50 focus:outline-none ${isDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border ${isChecked ? "bg-primary border-primary" : "bg-background"}`}
                >
                  {isChecked && <span className="block w-2 h-2 bg-primary-foreground rounded" />}
                </span>
                <span className="truncate" title={u.authUserId}>{u.name || u.email || u.authUserId}</span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground" title={u.authUserId}>{u.authUserId}</span>
              </button>
            );
          })}
          {shown.length === 0 && (
            <div className="px-2 py-2 text-[11px] text-muted-foreground">No users match.</div>
          )}
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{selectedSet.size} selected</span>
          <div className="space-x-2">
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={clearAll}
              disabled={selectedSet.size === disabledSet.size}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
      {typeof maxDisplay === "number" && filtered.length > (maxDisplay ?? 0) && (
        <p className="mt-1 text-[10px] text-muted-foreground">Showing first {maxDisplay} of {filtered.length} users. Refine search to narrow.</p>
      )}
    </div>
  );
}
