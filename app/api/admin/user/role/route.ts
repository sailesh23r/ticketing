import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const { userId, role } = (await req.json()) as { userId?: string; role?: string };
    if (!userId || !role) return new NextResponse("Bad Request", { status: 400 });

    await prisma.user.update({ where: { id: userId }, data: { role } });

    return NextResponse.json({ ok: true });
  } catch {
    return new NextResponse("Server Error", { status: 500 });
  }
}
