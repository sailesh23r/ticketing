import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const { userId, enable } = (await req.json()) as { userId?: string; enable?: boolean };
    if (!userId || typeof enable !== "boolean") return new NextResponse("Bad Request", { status: 400 });

    if (enable) {
      // Mark enabled; actual enrollment still requires user setup (TOTP/email)
      await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    } else {
      // Force disable: clear secrets and flag
      await prisma.twoFactor.deleteMany({ where: { userId } });
      await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return new NextResponse("Server Error", { status: 500 });
  }
}
