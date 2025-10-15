import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const pathname = url.pathname;

  // Skip static, images, and Next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  if (isApi) return NextResponse.next();

  // Token report links remain public for all users
  if (pathname.startsWith("/reports/token")) {
    return NextResponse.next();
  }

  // Check session via server endpoint to avoid bundling server-only code here
  try {
    const res = await fetch(new URL("/api/session", req.url), {
      headers: { cookie: req.headers.get("cookie") || "" },
    });
    if (res.ok) {
      // Authenticated: normalize to /new-dash for any non-/new-dash routes (including /login)
      if (!pathname.startsWith("/new-dash")) {
        const dest = new URL("/new-dash", req.url);
        return NextResponse.redirect(dest);
      }
      return NextResponse.next();
    }
  } catch {
    // fallthrough to redirect
  }

  // Not authenticated: redirect to login with callbackUrl back to the original
  const loginUrl = new URL("/login", req.url);
  // Allow accessing the login page unauthenticated
  if (pathname === "/login") {
    return NextResponse.next();
  }
  // Temporarily allow registration page without auth
  if (pathname === "/register") {
    return NextResponse.next();
  }
  // After login, land on /new-dash
  loginUrl.searchParams.set("callbackUrl", "/new-dash");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
