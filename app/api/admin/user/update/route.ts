import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const { userId, email, name } = (await req.json()) as {
      userId?: string;
      email?: string;
      name?: string;
    };

    if (!userId || (!email && !name)) return new NextResponse("Bad Request", { status: 400 });

    const data: { email?: string; name?: string } = {};
    if (typeof email === "string") data.email = email;
    if (typeof name === "string") data.name = name;

    const updated = await prisma.user.update({ where: { id: userId }, data });
    return NextResponse.json({ ok: true, user: { id: updated.id, email: updated.email, name: updated.name } });
  } catch {
    return new NextResponse("Server Error", { status: 500 });
  }
}
