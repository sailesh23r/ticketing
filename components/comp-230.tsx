"use client";
import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type OrgOption = { value: string; label: string };

export default function OrgCombobox({
  label = "Organization",
  organizations,
  value,
  onValueChange,
  placeholder = "Select organization",
  disabled,
}: {
  label?: string;
  organizations?: OrgOption[];
  value?: string;
  onValueChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const opts = useMemo(() => organizations ?? [], [organizations]);
  return (
    <div className="grid gap-2">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className="h-8">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
