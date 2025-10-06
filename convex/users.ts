import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByAuthId = query({
  args: { authUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    // Note: Auth is currently relaxed. In production, restrict to privileged users.
    const users = await ctx.db.query("users").order("asc").take(1000);
    return users;
  },
});

export const getByAuthIds = query({
  args: { authUserIds: v.array(v.string()) },
  handler: async (ctx, args) => {
  const results: { authUserId: string; name: string; email: string }[] = [];
    for (const id of args.authUserIds) {
      const u = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", id))
        .first();
      if (u) results.push({ authUserId: u.authUserId, name: u.name ?? "", email: u.email ?? "" });
    }
    return results;
  },
});

export const setRoles = mutation({
  args: { authUserId: v.string(), roles: v.array(v.string()) },
  handler: async (ctx, args) => {
    // Note: Auth is currently relaxed. In production, restrict to admins.
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
    if (!existing) {
      await ctx.db.insert("users", {
        authUserId: args.authUserId,
        email: "",
        name: undefined,
        roles: args.roles,
      });
    } else {
      await ctx.db.patch(existing._id, { roles: args.roles });
    }
  },
});

export const createUser = mutation({
  args: {
    authUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    roles: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        roles: args.roles,
      });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      authUserId: args.authUserId,
      email: args.email,
      name: args.name,
      roles: args.roles,
    });
  },
});

export const updateUser = mutation({
  args: {
    authUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    roles: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
    if (!existing) return;
    const patch: { email?: string; name?: string; roles?: string[] } = {};
    if (typeof args.email === "string") patch.email = args.email;
    if (typeof args.name === "string") patch.name = args.name;
    if (Array.isArray(args.roles)) patch.roles = args.roles;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
    }
  },
});

export const deleteUser = mutation({
  args: { authUserId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
    if (!existing) return;
    await ctx.db.delete(existing._id);
  },
});

export const upsertCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return; // TEMP: skip when unauthenticated

    // Try to extract email/name if present on identity
    const maybeEmail = (identity as unknown as { email?: string }).email;
    const maybeName = (identity as unknown as { name?: string }).name;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", identity.subject))
      .first();
    if (!existing) {
      await ctx.db.insert("users", {
        authUserId: identity.subject,
        email: maybeEmail ?? "",
        name: maybeName,
        roles: ["user"],
      });
    } else {
      await ctx.db.patch(existing._id, {
        email: maybeEmail ?? existing.email,
        name: maybeName ?? existing.name,
      });
    }
  },
});

export const upsertFromAuth = mutation({
  args: {
    authUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();

    // Map Better Auth role (single string) to Convex roles array
    const roles: string[] = ["user"]; // default
    if (args.role && args.role !== "user") roles.push(args.role);

    if (!existing) {
      await ctx.db.insert("users", {
        authUserId: args.authUserId,
        email: args.email,
        name: args.name,
        roles,
      });
      return;
    }

    const patch: { email?: string; name?: string; roles?: string[] } = {};
    // Always update email/name if provided
    if (typeof args.email === "string") patch.email = args.email;
    if (typeof args.name === "string") patch.name = args.name;
    // Update roles if provided
    if (typeof args.role === "string") patch.roles = roles;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
    }
  },
});

export const setTeams = mutation({
  args: { authUserId: v.string(), teams: v.array(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
    if (!existing) {
      await ctx.db.insert("users", {
        authUserId: args.authUserId,
        email: "",
        name: undefined,
        roles: ["user"],
        teams: args.teams,
      });
    } else {
      await ctx.db.patch(existing._id, { teams: args.teams });
    }

    // Sync teams table membership and create missing teams by name
    const now = Date.now();
    const teamNames = Array.from(new Set(args.teams.map(t => t.trim()).filter(Boolean)));
    for (const name of teamNames) {
      // ensure team exists
      const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      let team = await ctx.db.query("teams").withIndex("by_slug", q => q.eq("slug", slug)).first();
      if (!team) {
        const id = await ctx.db.insert("teams", { slug, name, members: [args.authUserId], createdAt: now, updatedAt: now });
        team = await ctx.db.get(id);
      } else {
        const members = Array.from(new Set([...(team.members ?? []), args.authUserId]));
        await ctx.db.patch(team._id, { members, updatedAt: now });
      }
    }

    // Also remove this user from teams that they no longer belong to
    const allTeams = await ctx.db.query("teams").take(1000);
    for (const t of allTeams) {
      const name = t.name as string | undefined;
      if (!name) continue;
      const shouldBeMember = teamNames.includes(name);
      const members = Array.isArray(t.members) ? t.members : [];
      const isMember = members.includes(args.authUserId);
      if (isMember && !shouldBeMember) {
        const next = members.filter(m => m !== args.authUserId);
        await ctx.db.patch(t._id, { members: next, updatedAt: now });
      }
    }
  },
});

export const setProjects = mutation({
  args: { authUserId: v.string(), projects: v.array(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
    if (!existing) {
      await ctx.db.insert("users", {
        authUserId: args.authUserId,
        email: "",
        name: undefined,
        roles: ["user"],
        projects: args.projects,
      });
    } else {
      await ctx.db.patch(existing._id, { projects: args.projects });
    }
  },
});

export const setDispatcher = mutation({
  args: { authUserId: v.string(), enable: v.boolean() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
    if (!existing) return;
    const roles = new Set(existing.roles.map((r) => r.toLowerCase()));
    if (args.enable) roles.add("dispatcher"); else roles.delete("dispatcher");
    await ctx.db.patch(existing._id, { roles: Array.from(roles) });
  },
});
