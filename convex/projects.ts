import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { userRoles } from "./myFunctions"; // reuse helper for role checks

// Note: userRoles lives in myFunctions; depending on module resolution you may need to
// move the helper to a shared file. For now import as-is (workspace supports same-dir imports).

function isAdminRoles(roles: string[]) {
  return roles.map((r) => r.toLowerCase()).includes("admin");
}

export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").order("asc").collect();
  },
});

export const getProject = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    return rows;
  },
});

export const createProject = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    members: v.optional(v.array(v.string())),
    suspended: v.optional(v.boolean()),
    slaP0Hours: v.optional(v.number()),
    slaP1Hours: v.optional(v.number()),
    slaP2Hours: v.optional(v.number()),
    slaP3Hours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const roles = await userRoles(ctx, identity.subject);
    if (!isAdminRoles(roles)) {
      console.log(`[Forbidden] action=createProject denied actor=${identity.subject} reason=not_admin roles=${roles.join(",")}`);
      throw new Error("Forbidden");
    }
    // Uniqueness checks
    const existingBySlug = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existingBySlug) {
      throw new Error("Project with this slug already exists");
    }
    const existingByName = await ctx.db
      .query("projects")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existingByName) {
      throw new Error("Project with this name already exists");
    }
    const now = Date.now();
    return await ctx.db.insert("projects", {
      slug: args.slug,
      name: args.name,
      description: args.description,
      members: args.members ?? [],
      suspended: typeof args.suspended === 'boolean' ? args.suspended : false,
      slaP0Hours: typeof args.slaP0Hours === 'number' ? args.slaP0Hours : undefined,
      slaP1Hours: typeof args.slaP1Hours === 'number' ? args.slaP1Hours : undefined,
      slaP2Hours: typeof args.slaP2Hours === 'number' ? args.slaP2Hours : undefined,
      slaP3Hours: typeof args.slaP3Hours === 'number' ? args.slaP3Hours : undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateProject = mutation({
  args: {
    slug: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    members: v.optional(v.array(v.string())),
    suspended: v.optional(v.boolean()),
    slaP0Hours: v.optional(v.number()),
    slaP1Hours: v.optional(v.number()),
    slaP2Hours: v.optional(v.number()),
    slaP3Hours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const roles = await userRoles(ctx, identity.subject);
    if (!isAdminRoles(roles)) {
      console.log(`[Forbidden] action=updateProject denied actor=${identity.subject} slug=${args.slug} reason=not_admin roles=${roles.join(",")}`);
      throw new Error("Forbidden");
    }
    const existing = await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", args.slug)).first();
    if (!existing) return;
    type Proj = { _id: string; slug: string; name: string } & Record<string, unknown>;
    const current = existing as unknown as Proj;
    // If updating name, ensure no other project already has that name
    if (typeof args.name === "string" && args.name.trim() && args.name.trim() !== current.name) {
      const dupName = (await ctx.db
        .query("projects")
        .withIndex("by_name", (q) => q.eq("name", args.name!.trim()))
        .first()) as unknown as Proj | null;
      if (dupName && dupName._id !== current._id) {
        throw new Error("Project with this name already exists");
      }
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (typeof args.name === "string") patch.name = args.name;
    if (typeof args.description === "string") patch.description = args.description;
    if (Array.isArray(args.members)) patch.members = args.members;
    if (typeof args.suspended === 'boolean') patch.suspended = args.suspended;
    if (typeof args.slaP0Hours === 'number') patch.slaP0Hours = args.slaP0Hours;
    if (typeof args.slaP1Hours === 'number') patch.slaP1Hours = args.slaP1Hours;
    if (typeof args.slaP2Hours === 'number') patch.slaP2Hours = args.slaP2Hours;
    if (typeof args.slaP3Hours === 'number') patch.slaP3Hours = args.slaP3Hours;
    await ctx.db.patch(existing._id, patch);
  },
});

// Synchronize project.members and each user's projects array.
export const setProjectMembers = mutation({
  args: { slug: v.string(), members: v.array(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const roles = await userRoles(ctx, identity.subject);
    if (!isAdminRoles(roles)) {
      throw new Error("Forbidden");
    }
    const proj = await ctx.db.query("projects").withIndex("by_slug", q => q.eq("slug", args.slug)).first();
    if (!proj) throw new Error("Project not found");
    const uniqueMembers = Array.from(new Set(args.members.map(m => m.trim()).filter(Boolean)));
    await ctx.db.patch(proj._id, { members: uniqueMembers, updatedAt: Date.now() });

    // Fetch users that currently list this project or are in uniqueMembers
    const allUsers = await ctx.db.query("users").take(1000);
    const slug = args.slug;
    const memberSet = new Set(uniqueMembers);
    for (const u of allUsers) {
      // users schema contains optional projects: string[]
      const existingProjects: string[] = Array.isArray(u.projects) ? u.projects : [];
      const hasSlug = existingProjects.includes(slug);
      const shouldHave = memberSet.has(u.authUserId);
      if (shouldHave && !hasSlug) {
        await ctx.db.patch(u._id, { projects: [...existingProjects, slug] });
      } else if (!shouldHave && hasSlug) {
        await ctx.db.patch(u._id, { projects: existingProjects.filter(p => p !== slug) });
      }
    }
  },
});

export const deleteProject = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const roles = await userRoles(ctx, identity.subject);
    if (!isAdminRoles(roles)) {
      console.log(`[Forbidden] action=deleteProject denied actor=${identity.subject} slug=${args.slug} reason=not_admin roles=${roles.join(",")}`);
      throw new Error("Forbidden");
    }
    const existing = await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", args.slug)).first();
    if (!existing) return;
    await ctx.db.delete(existing._id);
  },
});
