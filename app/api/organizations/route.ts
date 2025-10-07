import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

type Org = { id: string; name: string };

export async function GET() {
  try {
    // Prefer Better Auth organizations API if the plugin is enabled
    const api = auth.api as unknown as { listOrganizations?: (args?: unknown) => Promise<{ organizations?: Org[] }> };
    if (api && typeof api.listOrganizations === "function") {
      const res = await api.listOrganizations({});
      const orgs = Array.isArray(res?.organizations) ? res.organizations : [];
      return NextResponse.json(orgs.map((o) => ({ id: o.id, name: o.name })));
    }
    // Fallback: no organizations plugin configured yet
    return NextResponse.json([]);
  } catch (err) {
    console.error("Failed to list organizations", err);
    // Return empty array to avoid breaking UI while orgs are not configured
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const { name, slug } = await req.json();
    if (!name || !slug) {
      return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
    }
    const api = auth.api as unknown as { organization?: { create: (args: { body: { name: string; slug: string } }) => Promise<unknown> } };
    if (api.organization?.create) {
      const created = await api.organization.create({ body: { name, slug } });
      return NextResponse.json(created);
    }
    return NextResponse.json({ error: "Organizations API not available" }, { status: 404 });
  } catch (err) {
    console.error("Failed to create organization", err);
    return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
  }
}
