import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { session, user } = await auth.api.getSession({ headers: req.headers });
    if (session && user) {
      return Response.json({ ok: true, session, user });
    }
    return new Response("Unauthorized", { status: 401 });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}
