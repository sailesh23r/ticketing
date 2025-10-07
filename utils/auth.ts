import { authClient } from "@/lib/auth-client";

export async function banUser(
  userId: string,
  banReason: string,
  banExpiresIn?: number,
) {
  const res = await authClient.admin.banUser({
    userId,
    banReason,
    banExpiresIn,
  });

  if (res?.error) {
    throw new Error(res.error.message || "Failed to ban user");
  }

  return res;
}

export async function unbanUser(userId: string) {
  const res = await authClient.admin.unbanUser({
    userId,
  });

  if (res?.error) {
    throw new Error(res.error.message || "Failed to unban user");
  }

  return res;
}

export async function deleteUser(userId: string) {
  const res = await authClient.admin.removeUser({
    userId,
  });

  if (res?.error) {
    throw new Error(res.error.message || "Failed to delete user");
  }

  return res;
}

export async function revokeUserSessions(userId: string) {
  const res = await authClient.admin.revokeUserSessions({
    userId,
  });

  if (res?.error) {
    throw new Error(res.error.message || "Failed to revoke user sessions");
  }

  return res;
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role?: "admin" | "provider" | "scribe" | "scribeAdmin" | "demo" | ("admin" | "provider" | "scribe" | "scribeAdmin" | "demo")[];
  data?: Record<string, unknown>;
  autoVerify?: boolean;
}) {
  const { autoVerify, ...userData } = data;

  // Map extended UI roles to Better Auth core roles for the user record
  const toCoreRole = (
    role: typeof data.role,
  ): "user" | "admin" | ("user" | "admin")[] | undefined => {
    if (!role) return undefined;
    if (Array.isArray(role)) {
      return role.includes("admin") ? ["admin"] : ["user"];
    }
    return role === "admin" ? "admin" : "user";
  };
  const coreRole = toCoreRole(data.role);

  // If autoVerify is true, add emailVerified to data
  const createData = {
    name: userData.name,
    email: userData.email,
    password: userData.password,
    ...(coreRole ? { role: coreRole } : {}),
    data: {
      ...userData.data,
      ...(autoVerify ? { emailVerified: true } : {}),
    },
  };

  const res = await authClient.admin.createUser(createData);

  if (res?.error) {
    throw new Error(res.error.message || "Failed to create user");
  }

  // If not auto-verified, send verification email
  if (!autoVerify) {
    try {
      await authClient.sendVerificationEmail({
        email: data.email,
        callbackURL: "/dashboard",
      });
    } catch (error) {
      console.error("Failed to send verification email:", error);
      // Don't throw here as user was created successfully
    }
  }

  return res;
}

export async function updateUserRole(
  userId: string,
  role: "admin" | "provider" | "scribe" | "scribeAdmin" | "demo" | ("admin" | "provider" | "scribe" | "scribeAdmin" | "demo")[]
) {
  // Map to Better Auth core roles
  const core: "user" | "admin" | ("user" | "admin")[] = Array.isArray(role)
    ? (role.includes("admin") ? ["admin"] : ["user"]) 
    : (role === "admin" ? "admin" : "user");

  const res = await authClient.admin.setRole({ userId, role: core });

  if (res?.error) {
    throw new Error(res.error.message || "Failed to update user role");
  }

  return res;
}