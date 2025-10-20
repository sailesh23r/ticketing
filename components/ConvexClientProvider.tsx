"use client";

import { ReactNode, useEffect } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

// Resolve Convex URL at runtime to work over LAN without baking 127.0.0.1 into the bundle
function resolveConvexUrl() {
  // Prefer explicit env if it doesn't point to localhost
  const envUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (envUrl && !/^(?:http:\/\/)?(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(envUrl)) {
    return envUrl;
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "https" : "http";
    const host = window.location.hostname; // e.g. 192.168.x.x or your domain
    const port = (process.env.NEXT_PUBLIC_CONVEX_PORT as string) || "3210";
    return `${proto}://${host}:${port}`;
  }
  // Fallback to env (server-side render paths won't call Convex)
  return envUrl || "http://127.0.0.1:3210";
}

const convex = new ConvexReactClient(resolveConvexUrl());

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  useEffect(() => {
    let cancelled = false;
    convex.setAuth(async () => {
      try {
        // Prefer Better Auth's JWT endpoint if available
        const tryEndpoints = [
          "/api/auth/token", // Better Auth jwt plugin exposes this
          "/api/convex/token", // legacy HS256 bridge (dev only)
        ];

        for (const url of tryEndpoints) {
          const res = await fetch(url);
          if (!res.ok) continue;
          // Better Auth returns { token }, same as our legacy endpoint
          const data = (await res.json()) as { token?: string };
          if (data?.token) return cancelled ? null : data.token;
        }
        return null;
      } catch {
        return null;
      }
    });
    return () => {
      cancelled = true;
      convex.clearAuth();
    };
  }, []);

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
