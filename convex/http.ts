import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

// Convex HTTP routes to support browser-friendly uploads with proper CORS.
// This provides an alternative to generateUploadUrl when the storage origin
// can't be configured for CORS. The browser will POST the file body to
// /sendImage on the Convex origin, and this route stores it via ctx.storage.

const http = httpRouter();

function parseAllowedOrigins(): string[] {
  const raw = process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins();

function isOriginAllowed(origin: string): boolean {
  if (!allowedOrigins.length) return true; // if unset, allow all (dev-friendly)
  return allowedOrigins.includes(origin);
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
  };
}

// Preflight for /sendImage
http.route({
  path: "/sendImage",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    const headers = request.headers;
    const origin = headers.get("Origin") || "";
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      if (!isOriginAllowed(origin)) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: new Headers({
          ...corsHeaders(origin),
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          // Minimal required headers for a Blob POST; include Digest if you use it
          "Access-Control-Allow-Headers": "Content-Type, Digest",
          "Access-Control-Max-Age": "86400",
        }),
      });
    }
    return new Response(null, { status: 204 });
  }),
});

// Upload endpoint: accept raw file body, store to Convex storage, return { storageId }
http.route({
  path: "/sendImage",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("Origin") || "";
    if (!isOriginAllowed(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    // Optional: enforce a max size by reading Content-Length (may be absent with chunked encoding)
    // const len = Number(request.headers.get("Content-Length") || 0);
    // if (len > 10 * 1024 * 1024) return new Response("Payload too large", { status: 413 });

    const contentType = request.headers.get("Content-Type") || "application/octet-stream";
    const buffer = await request.arrayBuffer();
    const blob = new Blob([buffer], { type: contentType });
    const storageId = await ctx.storage.store(blob);

    return new Response(JSON.stringify({ storageId }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(origin),
      },
    });
  }),
});

export default http;
