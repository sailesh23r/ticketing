/* eslint-disable @typescript-eslint/no-explicit-any */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolveTeamById(ctx: any, id: string) {
  const needle = id.trim();
  // Try slug index
  const bySlug = await ctx.db.query("teams").withIndex("by_slug", (q: any) => q.eq("slug", needle)).first();
  if (bySlug) return bySlug;
  // Fallback scan: match by exact (case-insensitive) name OR by slugified name
  const all = await ctx.db.query("teams").take(1000);
  const lower = needle.toLowerCase();
  const match = all.find((t: any) => {
    const n = (t as any).name as string | undefined;
    if (!n) return false;
    const nl = n.toLowerCase();
    return nl === lower || slugify(n) === needle;
  });
  return match ?? null;
}

// List all teams with members
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("teams").order("asc").take(1000);
    return rows.map((t) => ({
      slug: (t as any).slug as string,
      name: (t as any).name as string,
      description: (t as any).description as string | undefined,
      members: (Array.isArray((t as any).members) ? (t as any).members : []) as string[],
      createdAt: (t as any).createdAt as number | undefined,
      updatedAt: (t as any).updatedAt as number | undefined,
    }));
  },
});

// Get team by slug or exact name (case-insensitive)
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return await resolveTeamById(ctx, args.id);
  },
});

export const createTeam = mutation({
  args: { name: v.string(), description: v.optional(v.string()), members: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Team name required");
    const slug = slugify(name);
    const existing = await ctx.db.query("teams").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    if (existing) throw new Error("Team with this name already exists");
    const now = Date.now();
    const members = Array.from(new Set((args.members ?? []).filter(Boolean)));
    const id = await ctx.db.insert("teams", { slug, name, description: args.description, members, createdAt: now, updatedAt: now });

    // Ensure each member has the team in users.teams
    for (const authUserId of members) {
      const u = await ctx.db.query("users").withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId)).first();
      if (u) {
        const base = Array.isArray(u.teams) ? (u.teams as string[]) : [];
        const teams: string[] = Array.from(new Set([...base, name]));
        await ctx.db.patch(u._id, { teams });
      }
    }
    return id;
  },
});

export const setMembers = mutation({
  args: { id: v.string(), members: v.array(v.string()) },
  handler: async (ctx, args) => {
    const team = await resolveTeamById(ctx, args.id);
    if (!team) throw new Error("Team not found");

    const name = (team as any).name as string;
    const desired = new Set(args.members);

    // Update users: add team name to selected members; remove from others currently having it
    const allUsers = await ctx.db.query("users").take(2000) as Array<{ _id: any; authUserId: string; teams?: string[] }>;
    for (const u of allUsers) {
      const has = (u.teams ?? []).includes(name);
      const should = desired.has(u.authUserId);
      if (has === should) continue;
      if (should) {
        const next = Array.from(new Set([...(u.teams ?? []), name])) as string[];
        await ctx.db.patch(u._id, { teams: next });
      } else {
        const next = (u.teams ?? []).filter((t) => t !== name) as string[];
        await ctx.db.patch(u._id, { teams: next });
      }
    }

    // Update team doc
    await ctx.db.patch((team as any)._id, { members: Array.from(desired) as string[], updatedAt: Date.now() });
  },
});

export const renameTeam = mutation({
  args: { id: v.string(), newName: v.string() },
  handler: async (ctx, args) => {
    const t = await resolveTeamById(ctx, args.id);
    if (!t) throw new Error("Team not found");
    const oldName = (t as any).name as string;
    const newName = args.newName.trim();
    if (!newName || newName === oldName) return;
    const newSlug = slugify(newName);

    // Ensure unique slug
    const existing = await ctx.db.query("teams").withIndex("by_slug", (q) => q.eq("slug", newSlug)).first();
    if (existing && (existing as any)._id !== (t as any)._id) throw new Error("Another team with this name exists");

    // Update team doc
    await ctx.db.patch((t as any)._id, { name: newName, slug: newSlug, updatedAt: Date.now() });

    // Update users.teams occurrences
    const users = await ctx.db.query("users").take(2000);
    for (const u of users) {
      const teams = Array.isArray((u as any).teams) ? (u as any).teams : [];
      if (!teams.includes(oldName)) continue;
      const typed: string[] = (teams as string[]);
      const next: string[] = Array.from(new Set(typed.map((n) => (n === oldName ? newName : n))));
      await ctx.db.patch((u as any)._id, { teams: next });
    }

    // Update tickets.assignedToGroup
    const affectedTickets = await ctx.db
      .query("tickets")
      .withIndex("by_assignedToGroup", (q) => q.eq("assignedToGroup", oldName))
      .take(2000);
    for (const tk of affectedTickets) {
      await ctx.db.patch((tk as any)._id, { assignedToGroup: newName, updatedAt: Date.now() });
    }
  },
});

export const setDescription = mutation({
  args: { id: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const t = await resolveTeamById(ctx, args.id);
    if (!t) throw new Error("Team not found");
    await ctx.db.patch((t as any)._id, { description: args.description, updatedAt: Date.now() });
  },
});

export const deleteTeam = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const t = await resolveTeamById(ctx, args.id);
    if (!t) return;
    const name = (t as any).name as string;

    // Remove from users.teams
    const users = await ctx.db.query("users").take(2000);
    for (const u of users) {
      const base: string[] = Array.isArray((u as any).teams) ? ((u as any).teams as string[]) : [];
      const next: string[] = base.filter((n: string) => n !== name);
      if (next.length !== ((u as any).teams ?? []).length) {
        await ctx.db.patch((u as any)._id, { teams: next });
      }
    }

    // Clear assignedToGroup on tickets matching this team
    const affectedTickets = await ctx.db
      .query("tickets")
      .withIndex("by_assignedToGroup", (q) => q.eq("assignedToGroup", name))
      .take(2000);
    for (const tk of affectedTickets) {
      await ctx.db.patch((tk as any)._id, { assignedToGroup: undefined, updatedAt: Date.now() });
    }

    await ctx.db.delete((t as any)._id);
  },
});
