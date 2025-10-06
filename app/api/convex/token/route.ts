import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SignJWT } from "jose";

const ALG = "HS256";

function getKey() {
  const key = process.env.CONVEX_JWT_SECRET;
  if (!key) throw new Error("Missing CONVEX_JWT_SECRET");
  return new TextEncoder().encode(key);
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const now = Math.floor(Date.now() / 1000);

  // Sign a JWT with the Better Auth user id as sub
  const token = await new SignJWT({
    sub: session.user.id,
    // any other claims if necessary
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 10) // 10 minutes
    .sign(getKey());

  return NextResponse.json({ token });
}
