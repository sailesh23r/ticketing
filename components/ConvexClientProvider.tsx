"use client";

import { ReactNode, useEffect } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
