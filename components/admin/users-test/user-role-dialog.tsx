"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateUserRole } from "@/utils/auth";
import { Label } from "@/components/ui/label";
import { UserWithDetails } from "@/utils/users";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserRoleDialogProps {
  user: UserWithDetails;
  isOpen: boolean;
  onClose: () => void;
}

type RoleValue = "admin" | "provider" | "scribe" | "scribeAdmin" | "demo";

const ROLE_OPTIONS: { label: string; value: RoleValue }[] = [
  { label: "Admin", value: "admin" },
  { label: "Provider", value: "provider" },
  { label: "Scribe", value: "scribe" },
  { label: "Scribe Admin", value: "scribeAdmin" },
  { label: "Demo", value: "demo" },
];

export function UserRoleDialog({ user, isOpen, onClose }: UserRoleDialogProps) {
  const initialRole: RoleValue = ((): RoleValue => {
    const r = (user.role || "").toLowerCase();
    switch (r) {
      case "admin":
        return "admin";
      case "provider":
        return "provider";
      case "scribe":
        return "scribe";
      case "scribeadmin":
        return "scribeAdmin";
      case "demo":
        return "demo";
      default:
        return "provider"; // sensible default
    }
  })();
  const [selectedRole, setSelectedRole] = useState<RoleValue>(initialRole);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdateRole = async () => {
    try {
      setIsLoading(true);
  await updateUserRole(user.id, selectedRole);
      toast.success(`User role updated to ${selectedRole}`);
      onClose();
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleUpdateRole}
      title={`Update Role: ${user.name || user.email}`}
      description="Change the user's role in the system."
      confirmText={isLoading ? "Processing..." : "Update Role"}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="role">Select Role</Label>
          <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as RoleValue)}>
            <SelectTrigger id="role" className="w-full">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="hover:bg-muted"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </ConfirmationDialog>
  );
}