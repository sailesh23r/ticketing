"use server";

import { auth } from "./auth";

// Reusable server action to add a user to an organization (and optional team)
// This wraps better-auth's auth.api.addMember so client components can call
// one stable function without duplicating logic / error handling.
// Expand to cover roles used in UI mappings
export type AllowedRole = "user" | "admin" | "owner" | "Teamadmin" | "member" | "provider" | "scribe";

export interface AddTeamMemberParams {
  userId: string;
  organizationId: string;
  role: AllowedRole | AllowedRole[];
  teamId?: string; // optional team id
}

export interface AddTeamMemberResult {
  ok: boolean;
  error?: string;
  // Include raw response data if needed for future expansion/debugging
  data?: unknown;
}

export async function addTeamMember(params: AddTeamMemberParams): Promise<AddTeamMemberResult> {
  const { userId, organizationId, role, teamId } = params;

  if (!userId || !organizationId) {
    return { ok: false, error: "Missing userId or organizationId" };
  }

  try {
    const api: unknown = auth.api as unknown;
    const hasAddMember =
      api && typeof api === "object" && "addMember" in (api as Record<string, unknown>) &&
      typeof (api as Record<string, unknown>)["addMember"] === "function";

    if (!hasAddMember) {
      throw new Error("Organization membership API unavailable. Ensure Better Auth organizations plugin is enabled.");
    }

    const response = await (api as { addMember: (args: { body: { userId: string; organizationId: string; role: AllowedRole | AllowedRole[]; teamId?: string } }) => Promise<unknown> }).addMember({
      body: {
        userId,
        organizationId,
        role,
        ...(teamId ? { teamId } : {}),
      },
    });

    return { ok: true, data: response };
  } catch (err: unknown) {
    console.error("addTeamMember failed", err);
    interface ErrWithMessage { message: string }
    const message = ((): string => {
      if (typeof err === "string") return err;
      if (err && typeof err === "object" && "message" in err) {
        const maybe = (err as unknown as Partial<ErrWithMessage>).message;
        if (typeof maybe === "string") return maybe;
      }
      return "Unknown error";
    })();
    return { ok: false, error: message };
  }
}

// Convenience variant if you ever need to add multiple roles at once from client code
export async function addTeamMemberWithRoles(
  userId: string,
  organizationId: string,
  roles: AllowedRole[],
  teamId?: string
) {
  return addTeamMember({ userId, organizationId, role: roles, teamId });
}
