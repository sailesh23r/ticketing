"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

interface UpdateUserParams {
  userId: string;
  name?: string;
  email?: string;
  emailVerified?: boolean;
}

export interface UpdateUserResult {
  ok: boolean;
  error?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    role: string | null;
  };
}

// Lightweight email format check – real validation handled by auth system when needed
function isValidEmail(email: string) {
  return /.+@.+\..+/.test(email);
}

export async function updateUserDetails(params: UpdateUserParams): Promise<UpdateUserResult> {
  const { userId, name, email, emailVerified } = params;

  if (!userId) return { ok: false, error: "Missing userId" };
  if (email && !isValidEmail(email)) return { ok: false, error: "Invalid email format" };

  try {
    // Ensure caller is authorized (admin or Teamadmin same as list route)
  // Build a minimal NextRequest-like object using current headers so auth can resolve the session
  const h = await headers();
  const req = new NextRequest("http://localhost/api/auth/session", { headers: h });
  const session = await auth.api.getSession(req);
    if (!session || (session.user.role !== "admin" && session.user.role !== "Teamadmin")) {
      return { ok: false, error: "Unauthorized" };
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) return { ok: false, error: "User not found" };

    const emailChanged = email && email !== existing.email;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(emailChanged ? { emailVerified: false } : {}),
        ...(emailVerified !== undefined ? { emailVerified } : {}),
        updatedAt: new Date(),
      },
      select: { id: true, name: true, email: true, emailVerified: true, role: true },
    });

    return { ok: true, user: updated };
  } catch (err) {
    console.error("updateUserDetails failed", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
