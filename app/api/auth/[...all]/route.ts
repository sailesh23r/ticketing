import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const { GET: _GET, POST: _POST } = toNextJsHandler(auth);

// Thin debug wrappers — pass the raw Request straight through
export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path.includes("/callback/microsoft")) {
    console.log("[AUTH DEBUG] Microsoft callback hit:", path);
  }
  if (path.includes("/get-session")) {
    console.log("[AUTH DEBUG] get-session called");
  }
  try {
    const res = await _GET(req);
    console.log("[AUTH DEBUG] GET", path, "→", res.status);
    return res;
  } catch (err) {
    console.error("[AUTH DEBUG] GET", path, "ERROR:", err);
    throw err;
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;
  console.log("[AUTH DEBUG] POST", path);
  try {
    const res = await _POST(req);
    console.log("[AUTH DEBUG] POST", path, "→", res.status);
    return res;
  } catch (err) {
    console.error("[AUTH DEBUG] POST", path, "ERROR:", err);
    throw err;
  }
}