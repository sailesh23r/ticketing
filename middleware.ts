import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Require authentication on all app pages except login (and exclude api/static via matcher)
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Public auth pages
  if (pathname === "/login" || pathname === "/register") {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = new URL("/login", request.url);
    // Send users back to the page they tried to reach after login
    const callback = pathname + (search || "");
    url.searchParams.set("callbackUrl", callback);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Intercept most pages, but skip Next internals, static assets, and ALL /api routes
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|assets/|public/|images/|api/).*)",
  ],
};
