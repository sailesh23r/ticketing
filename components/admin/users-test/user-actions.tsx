"use client";

import { useState } from "react";
import { Ban, MoreHorizontal, Trash2, Shield, LogOut, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { UserWithDetails } from "@/utils/users";
import { UserBanDialog } from "./user-ban-dialog";
import { UserUnbanDialog } from "./user-unban-dialog";
import { UserDeleteDialog } from "./user-delete-dialog";
import { UserRevokeSessionsDialog } from "./user-revoke-sessions-dialog";
import { UserRoleDialog } from "./user-role-dialog";
import { UserEditDialog } from "./user-edit-dialog";

interface UserActionsProps {
  user: UserWithDetails;
  onActionComplete: () => void;
  onUserPatched?: (patch: Partial<UserWithDetails> & { id: string }) => void;
}

export function UserActions({ user, onActionComplete, onUserPatched }: UserActionsProps) {
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [showUnbanDialog, setShowUnbanDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRevokeSessionsDialog, setShowRevokeSessionsDialog] =
    useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleDialogClose = (
    setter: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    setter(false);
  };

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-sm">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Actions
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="text-xs"
            onClick={() => {
              setDropdownOpen(false);
              setShowEditDialog(true);
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            <span>Edit User</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={() => {
              setDropdownOpen(false);
              setShowRoleDialog(true);
            }}
          >
            <Shield className="mr-2 h-4 w-4" />
            <span>Update Role</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.banned ? (
            <DropdownMenuItem
              className="text-xs"
              onClick={() => {
                setDropdownOpen(false);
                setShowUnbanDialog(true);
              }}
            >
              <Ban className="mr-2 h-4 w-4" />
              <span>Unban User</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="text-xs"
              onClick={() => {
                setDropdownOpen(false);
                setShowBanDialog(true);
              }}
            >
              <Ban className="mr-2 h-4 w-4" />
              <span>Ban User</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-xs"
            onClick={() => {
              setDropdownOpen(false);
              setShowDeleteDialog(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete User</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={() => {
              setDropdownOpen(false);
              setShowRevokeSessionsDialog(true);
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Revoke All Sessions</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialogs */}
      <UserBanDialog
        user={user}
        isOpen={showBanDialog}
        onClose={() => {
          handleDialogClose(setShowBanDialog);
          onActionComplete();
        }}
      />

      <UserUnbanDialog
        user={user}
        isOpen={showUnbanDialog}
        onClose={() => {
          handleDialogClose(setShowUnbanDialog);
          onActionComplete();
        }}
      />

      <UserDeleteDialog
        user={user}
        isOpen={showDeleteDialog}
        onClose={() => {
          handleDialogClose(setShowDeleteDialog);
          onActionComplete();
        }}
      />

      <UserRevokeSessionsDialog
        user={user}
        isOpen={showRevokeSessionsDialog}
        onClose={() => {
          handleDialogClose(setShowRevokeSessionsDialog);
          onActionComplete();
        }}
      />

      <UserRoleDialog
        user={user}
        isOpen={showRoleDialog}
        onClose={() => {
          handleDialogClose(setShowRoleDialog);
          onActionComplete();
        }}
      />

      <UserEditDialog
        user={user}
        isOpen={showEditDialog}
        onClose={() => {
          handleDialogClose(setShowEditDialog);
        }}
        onSuccess={(patch) => {
          if (patch && onUserPatched) onUserPatched(patch);
          onActionComplete();
        }}
      />
    </>
  );
}