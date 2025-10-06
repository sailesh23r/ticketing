import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const { email, name, role, tempPassword } = (await req.json()) as {
      email?: string;
      name?: string;
      role?: string;
      tempPassword?: string;
    };

    if (!email || !name || !tempPassword) return new NextResponse("Bad Request", { status: 400 });

    const bodyRole: "user" | "admin" | undefined = role === "admin" ? "admin" : "user";
    const result = await auth.api.createUser({ body: { email, password: tempPassword, name, role: bodyRole } });

    return NextResponse.json({ ok: true, user: result.user });
  } catch {
    return new NextResponse("Server Error", { status: 500 });
  }
}
