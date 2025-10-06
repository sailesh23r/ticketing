import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { id: { contains: q } },
            ],
          }
        : undefined,
      select: { id: true, email: true, name: true, role: true, twoFactorEnabled: true },
      orderBy: { createdAt: "asc" },
      take: 1000,
    });

    return NextResponse.json({ users });
  } catch {
    return new NextResponse("Server Error", { status: 500 });
  }
}
