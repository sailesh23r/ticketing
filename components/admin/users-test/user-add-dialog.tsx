"use client";

import { useEffect, useState } from "react";

import { createUser } from "@/utils/auth";
import { addTeamMember } from "@/lib/addTeamMember";
import { useListOrganizations, organization } from "@/lib/auth-client";
import OrgCombobox from "../../comp-230";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface UserAddDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function UserAddDialog({
  isOpen,
  onClose,
  onSuccess,
}: UserAddDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "provider" as "admin" | "provider" | "scribe" | "scribeAdmin" | "demo",
    autoVerify: false,
  });
  const { data: organizations } = useListOrganizations();
  const [orgsLocal, setOrgsLocal] = useState<{ id: string; name: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [isCreateOrgOpen, setIsCreateOrgOpen] = useState(false);

  // Sync organizations from hook into local list for optimistic add
  useEffect(() => {
    if (Array.isArray(organizations)) {
      setOrgsLocal(
        (organizations as { id: string; name: string }[]).map((o) => ({ id: o.id, name: o.name }))
      );
    }
  }, [organizations]);

  function parseOrgCreateResponse(res: unknown): { id: string; name: string } | undefined {
    if (!res || typeof res !== "object") return undefined;
    const root = res as Record<string, unknown>;
    const dataVal = root["data"];
    if (dataVal && typeof dataVal === "object") {
      const orgVal = (dataVal as Record<string, unknown>)["organization"];
      if (orgVal && typeof orgVal === "object") {
        const id = (orgVal as Record<string, unknown>)["id"];
        const name = (orgVal as Record<string, unknown>)["name"];
        if (typeof id === "string" && typeof name === "string") {
          return { id, name };
        }
      }
    }
    const directOrg = root["organization"];
    if (directOrg && typeof directOrg === "object") {
      const id = (directOrg as Record<string, unknown>)["id"];
      const name = (directOrg as Record<string, unknown>)["name"];
      if (typeof id === "string" && typeof name === "string") {
        return { id, name };
      }
    }
    const id = root["id"];
    const name = root["name"];
    if (typeof id === "string" && typeof name === "string") {
      return { id, name };
    }
    return undefined;
  }

  const mapRoleToOrgRole = (r: string): "owner" | "Teamadmin" | "member" | "provider" | "scribe" => {
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

  const handleCreateUser = async () => {
    try {
      setIsLoading(true);
      const res = await createUser(formData);
      const newUserId = res?.data?.user?.id;
      if (newUserId && selectedOrgId) {
        const memberRes = await addTeamMember({
          userId: newUserId,
          organizationId: selectedOrgId,
          role: mapRoleToOrgRole(formData.role),
        });
        if (!memberRes.ok) {
          toast.error("User created but failed to add to organization");
        } else {
          toast.success("User added to organization");
        }
      }
      toast.success(
        formData.autoVerify
          ? "User created and verified successfully"
          : "User created successfully. Verification email sent.",
      );
      onSuccess?.();
      onClose();
      // Reset form
      setFormData({
        name: "",
        email: "",
        password: "",
        role: "provider",
        autoVerify: false,
      });
      setSelectedOrgId(undefined);
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
      onConfirm={handleCreateUser}
      title="Add New User"
      description="Create a new user account with the following details."
      confirmText={isLoading ? "Creating..." : "Create User"}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="Enter user's name"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            placeholder="Enter user's email"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, password: e.target.value }))
            }
            placeholder="Enter user's password"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="role">Role</Label>
          <Select
            value={formData.role}
            onValueChange={(value: "admin" | "provider" | "scribe" | "scribeAdmin" | "demo") =>
              setFormData((prev) => ({ ...prev, role: value }))
            }
          >
            <SelectTrigger id="role" className="w-full">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="provider">Provider</SelectItem>
              <SelectItem value="scribe">Scribe</SelectItem>
              <SelectItem value="scribeAdmin">Scribe Admin</SelectItem>
              <SelectItem value="demo">Demo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Organization selector */}
        <div className="grid gap-2">
          <Label>Organization (optional)</Label>
          <OrgCombobox
            organizations={orgsLocal.length ? orgsLocal.map(o => ({ value: o.id, label: o.name })) : undefined}
            value={selectedOrgId}
            onValueChange={(v: string) => setSelectedOrgId(v || undefined)}
          />
        </div>
        {isCreateOrgOpen && (
          <div className="grid gap-2 border rounded p-3">
            <Label htmlFor="new-org-name">New Organization Name</Label>
            <div className="flex gap-2">
              <Input id="new-org-name" placeholder="Acme Inc" />
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  const nameInput = document.getElementById("new-org-name") as HTMLInputElement | null;
                  const name = nameInput?.value?.trim();
                  if (!name) {
                    toast.error("Organization name is required");
                    return;
                  }
                  try {
                    const slug = name.toLowerCase().replace(/\s+/g, "-");
                    const res = await organization.create({ name, slug });
                    const parsed = parseOrgCreateResponse(res);
                    if (parsed?.id) {
                      setOrgsLocal(prev => prev.some(o => o.id === parsed.id) ? prev : [...prev, parsed]);
                      setSelectedOrgId(parsed.id);
                      toast.success("Organization created");
                      if (nameInput) { nameInput.value = ""; }
                      setIsCreateOrgOpen(false);
                    } else {
                      toast.success("Organization created. Re-open selector to view.");
                      setIsCreateOrgOpen(false);
                    }
                  } catch (e) {
                    console.error("Failed to create organization", e);
                    toast.error("Failed to create organization");
                  }
                }}
              >Create</Button>
              <Button type="button" variant="ghost" onClick={() => setIsCreateOrgOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <Label htmlFor="autoVerify" className="cursor-pointer">
            Auto-verify email
          </Label>
          <Switch
            id="autoVerify"
            checked={formData.autoVerify}
            onCheckedChange={(checked: boolean) =>
              setFormData((prev) => ({ ...prev, autoVerify: checked }))
            }
          />
        </div>
      </div>
    </ConfirmationDialog>
  );
}