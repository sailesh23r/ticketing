import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Require authentication on all app pages except login (and exclude api/static via matcher)
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Allow public assets and common static files through without auth
  const isStaticAsset = /\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|bmp|css|js|map|txt|xml|json|woff2?|ttf|otf|mp4|webm|mp3|wav|ogg)$/i.test(
    pathname,
  );
  if (
    isStaticAsset ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.json" ||
    // Next.js generated image routes without extensions
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-touch-icon") ||
    pathname.startsWith("/opengraph-image") ||
    pathname.startsWith("/twitter-image")
  ) {
    return NextResponse.next();
  }

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
  runtime:  "nodejs",
  // Intercept most pages, but skip Next internals, static assets, and ALL /api routes
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|sw.js|assets/|public/|images/|api/).*)",
  ],
};
