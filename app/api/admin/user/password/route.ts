import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const { userId, newPassword } = (await req.json()) as { userId?: string; newPassword?: string };
    if (!userId || !newPassword) return new NextResponse("Bad Request", { status: 400 });

    const result = await auth.api.setUserPassword({ body: { userId, newPassword } });
    if (!result.status) return new NextResponse("Failed", { status: 400 });

    return NextResponse.json({ ok: true });
  } catch {
    return new NextResponse("Server Error", { status: 500 });
  }
}
