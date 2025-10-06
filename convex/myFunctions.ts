import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { PushNotifications } from "@convex-dev/expo-push-notifications";

const pushNotifications = new PushNotifications<string>(components.pushNotifications);

import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { api } from "./_generated/api";

function formatDate(y: number, m: number, d: number) {
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}${mm}${dd}`;
}

async function nextSequenceForToday(ctx: MutationCtx, prefix: string) {
  const now = new Date();
  const key = `${prefix}-${formatDate(now.getFullYear(), now.getMonth(), now.getDate())}`;
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", key))
    .first();
  if (!existing) {
    await ctx.db.insert("counters", { name: key, value: 1 });
    return 1;
  }
  await ctx.db.patch(existing._id, { value: existing.value + 1 });
  return existing.value + 1;
}

async function requireIdentity(ctx: QueryCtx | MutationCtx): Promise<{ subject: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return { subject: identity.subject };
}

export async function userRoles(ctx: QueryCtx, userId: string): Promise<string[]> {
  const u = await ctx.db
    .query("users")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", userId))
    .first();
  return u?.roles ?? [];
}

function isPrivileged(roles: string[]) {
  const allowed = new Set([
    "admin",
    "it_support",
    "irt",
    "security_delegate",
    "senior_management",
    "legal",
    "comms",
    "external_specialists",
    // Map legacy/simple role naming
    "support",
  ]);
  return roles.some((r) => allowed.has(r.toLowerCase()));
}

export const createTicket = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    priority: v.union(v.literal("P0"), v.literal("P1"), v.literal("P2"), v.literal("P3")),
    // Optional Better Auth user info passed from the client
    createdBy: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    attachments: v.optional(v.array(v.string())), // screenshot URLs
    category: v.optional(v.string()),
  team: v.optional(v.string()), // assign to a specific team when creating
  project: v.optional(v.string()), // optional project association
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);

    const creatorId = (args.createdBy && args.createdBy.trim()) || identity.subject || "anon";

    const seq = await nextSequenceForToday(ctx, "TCK");
    const today = new Date();
    const ticketId = `TCK-${formatDate(today.getFullYear(), today.getMonth(), today.getDate())}-${String(seq).padStart(4, "0")}`;

    const dueAt = computeSlaDueAt(args.priority, Date.now());
    const now = Date.now();

    // Upsert a basic user record so notifications/role lookups work
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", creatorId))
      .first();
    if (!existingUser) {
      await ctx.db.insert("users", {
        authUserId: creatorId,
        email: args.email ?? "",
        name: args.name,
        roles: ["user"],
      });
    }

  const assignedToGroup = args.team || initialAssignmentForPriority(args.priority);

    const id = await ctx.db.insert("tickets", {
      ticketId,
      title: args.title,
      description: args.description,
      priority: args.priority,
      status: "open",
      createdBy: creatorId,
      assignedToGroup,
      assignedToUser: undefined,
      dueAt,
      lastEscalationLevel: 0,
      autoPriority: args.priority === "P3", // only auto-raise if started as lowest priority by default
      attachments: args.attachments ?? [],
      category: args.category,
  project: args.project,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("ticket_events", {
      ticketId,
      type: "created",
      actorId: creatorId,
  details: JSON.stringify({ priority: args.priority, team: assignedToGroup, project: args.project, attachments: (args.attachments ?? []).length }),
    });

    // Activity log (parity with older code)
    await ctx.db.insert("ticket_events", {
      ticketId,
      type: "system",
      actorId: creatorId,
      details: JSON.stringify({ action: "created", description: "Ticket created" }),
    });

    await createNotifications(ctx, ticketId, args.priority, "Ticket created", `Your ticket ${ticketId} has been created.`);
    // Kick off embedding generation (non-blocking)
    try {
      await ctx.scheduler.runAfter(0, api.embeddings.generateTicketEmbedding, { ticketId });
    } catch (e) {
      console.log("[createTicket] failed to schedule embedding generation:", e);
    }

    return { id, ticketId };
  },
});

// Alternative cursor-based pagination query usable with useQuery
export const listTicketsPage = query({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed"),
      v.literal("escalated"),
    )),
    priority: v.optional(v.union(v.literal("P0"), v.literal("P1"), v.literal("P2"), v.literal("P3"))),
    group: v.optional(v.string()),
    project: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: null as unknown as string };

    const subject = identity.subject;
    const roles = await userRoles(ctx, subject);
    const isAdmin = isPrivileged(roles);

    const numItems = Math.max(1, Math.min(100, args.numItems ?? 10));

    let qb = ctx.db.query("tickets");

    if (!isAdmin) {
      const me = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", subject))
        .first();
      const teams = (me?.teams ?? []) as string[];
      const projects = (me?.projects ?? []) as string[];
      qb = qb.filter((f) => {
        let expr = f.or(
          f.eq(f.field("createdBy"), subject),
          f.eq(f.field("assignedToUser"), subject),
        );
        for (const t of teams) expr = f.or(expr, f.eq(f.field("assignedToGroup"), t));
        for (const p of projects) expr = f.or(expr, f.eq(f.field("project"), p));
        return expr;
      });
    }

    const { status, priority, group, project, from, to } = args;
    if (status) qb = qb.filter((f) => f.eq(f.field("status"), status));
    if (priority) qb = qb.filter((f) => f.eq(f.field("priority"), priority));
    if (group && group !== "all") qb = qb.filter((f) => f.eq(f.field("assignedToGroup"), group));
    if (project) qb = qb.filter((f) => f.eq(f.field("project"), project));
    if (from && to) {
      qb = qb.filter((f) => f.and(
        f.gte(f.field("createdAt"), from),
        f.lte(f.field("createdAt"), to),
      ));
    } else if (from) {
      qb = qb.filter((f) => f.gte(f.field("createdAt"), from));
    } else if (to) {
      qb = qb.filter((f) => f.lte(f.field("createdAt"), to));
    }

    return qb.order("desc").paginate({ cursor: args.cursor ?? null, numItems });
  },
});

function initialAssignmentForPriority(priority: "P0" | "P1" | "P2" | "P3") {
  if (priority === "P3") return "IT Support";
  if (priority === "P2") return "IRT";
  if (priority === "P1") return "IRT+Senior";
  return "Exec Escalation"; // P0
}

function computeSlaDueAt(priority: "P0" | "P1" | "P2" | "P3", now: number) {
  const hours = priority === "P3" ? 4 : priority === "P2" ? 2 : priority === "P1" ? 1 : 0;
  return hours === 0 ? now : now + hours * 60 * 60 * 1000;
}
// Escalation chain timing (after each escalation level is reached, schedule the next)
// Level 0 (initial) -> after 4h escalate to level 1
// Level 1 -> after 2h escalate to level 2
// Level 2 -> after 1h escalate to level 3
// Level 3 -> terminal (no further escalation)
function nextEscalationDueAt(levelAfterUpdate: number, now: number): number | undefined {
  if (levelAfterUpdate === 0) return now + 4 * 60 * 60 * 1000; // not used (initial assignment)
  if (levelAfterUpdate === 1) return now + 2 * 60 * 60 * 1000;
  if (levelAfterUpdate === 2) return now + 1 * 60 * 60 * 1000;
  return undefined; // level 3 terminal
}

// New recipients added at each escalation level (cumulative chain semantics)
function newRecipientsForLevel(level: number): string[] {
  switch (level) {
    case 1: // escalate from P3 base -> add Security Delegate + IRT
      return ["security_delegate", "irt"]; 
    case 2: // add Senior Management
      return ["senior_management"]; 
    case 3: // final: add Legal + Comms + External Specialists
      return ["legal", "comms", "external_specialists"]; 
    default:
      return []; // level 0 (initial) no added recipients beyond assigned / creator
  }
}

export const addMessage = mutation({
  args: {
    ticketId: v.string(),
    content: v.string(),
    userId: v.optional(v.string()), // Optional Better Auth user id from client
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const ticket = await ctx.db
      .query("tickets")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .first();
    if (!ticket) throw new Error("Ticket not found");

    const effectiveUserId = (args.userId && args.userId.trim()) || identity.subject;

    // Allow creator; privileged roles; assigned user; members of the assigned group
    const roles = await userRoles(ctx, effectiveUserId);
    let inAssignedTeam = false;
    if (ticket.assignedToGroup) {
      const me = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", effectiveUserId))
        .first();
      const teams = (me?.teams ?? []).map((t) => t.toLowerCase());
      inAssignedTeam = teams.includes(ticket.assignedToGroup.toLowerCase());
    }
    const allowed =
      ticket.createdBy === effectiveUserId ||
      ticket.assignedToUser === effectiveUserId ||
      inAssignedTeam ||
      isPrivileged(roles);
    if (!allowed) {
      console.log(`[Forbidden] action=addMessage denied actor=${effectiveUserId} ticketId=${args.ticketId} reason=not_creator_not_assignee_not_team_not_privileged roles=${roles.join(",")}`);
      throw new Error("Forbidden");
    }

    await ctx.db.insert("messages", {
      ticketId: args.ticketId,
      authorId: effectiveUserId,
      role: isPrivileged(roles) ? "agent" : "user",
      content: args.content,
    });

    // Auto-response for known issues
    const known = (await ctx.db.query("known_issues").collect()) as Doc<"known_issues">[];
    const lower = args.content.toLowerCase();
    const hit = known.find((k) => lower.includes(k.pattern.toLowerCase()));
    if (hit) {
      await ctx.db.insert("messages", {
        ticketId: args.ticketId,
        authorId: "system/ai",
        role: "ai",
        content: hit.response,
      });
    }

    await ctx.db.insert("ticket_events", {
      ticketId: args.ticketId,
      type: "comment",
      actorId: effectiveUserId,
      details: args.content.slice(0, 200),
    });
  },
});

export const listMyTickets = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const subject = (args.userId && args.userId.trim()) || identity.subject;
    const items = await ctx.db
      .query("tickets")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", subject))
      .order("desc")
      .take(100);
    return items;
  },
});

export const getTicketThread = query({
  args: { ticketId: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const subject = (args.userId && args.userId.trim()) || identity.subject;
    const ticket = await ctx.db
      .query("tickets")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .first();
    if (!ticket) return null;

    const roles = await userRoles(ctx, subject);
    // Also allow: assignee can view; any member of the assigned group can view
    let inAssignedTeam = false;
    let inSameProject = false;
    let shareAnyTeam = false;
    if (ticket.assignedToGroup) {
      const me = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", subject))
        .first();
      const teams = (me?.teams ?? []).map((t) => t.toLowerCase());
      inAssignedTeam = teams.includes(ticket.assignedToGroup.toLowerCase());
      // Determine if user shares ANY team with ticket (even if not the assigned group)
      const userTeams = new Set(teams);
      const ticketTeam = ticket.assignedToGroup?.toLowerCase();
      shareAnyTeam = !!(ticketTeam && userTeams.has(ticketTeam));
      // Project overlap (if both user and ticket have projects attribute)
  const ticketProject: string | undefined = (ticket as unknown as { project?: string }).project;
      if (ticketProject && Array.isArray(me?.projects)) {
        inSameProject = (me.projects as string[]).some((p) => p.toLowerCase() === ticketProject.toLowerCase());
      }
    }
    const allowed =
      ticket.createdBy === subject ||
      ticket.assignedToUser === subject ||
      inAssignedTeam ||
      shareAnyTeam ||
      inSameProject ||
      isPrivileged(roles);
    if (!allowed) {
      console.log(`[Forbidden] action=getTicketThread denied actor=${subject} ticketId=${args.ticketId} reason=not_creator_not_assignee_not_team_not_privileged roles=${roles.join(",")}`);
      throw new Error("Forbidden");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .order("asc")
      .collect();

    const events = await ctx.db
      .query("ticket_events")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .order("asc")
      .collect();

    // Map storage IDs to URLs for client rendering
    const urls = await Promise.all((ticket.attachments ?? []).map(async (id) => (await ctx.storage.getUrl(id)) ?? ""));
    const safeTicket = { ...ticket, attachments: urls.filter(Boolean) } as typeof ticket & { attachments: string[] };

    return { ticket: safeTicket, messages, events };
  },
});

export const listActiveTickets = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const providedUserId = args.userId && args.userId.trim();

    if (!identity && !providedUserId) {
      // Not signed in and no identifiers provided: return empty
      return [];
    }

    const subject = providedUserId || identity!.subject;

    const roles = await userRoles(ctx, subject);
  if (!isPrivileged(roles)) {
      // Non-privileged: show tickets created by the user OR assigned to the user OR routed to their teams
      const [created, assigned] = await Promise.all([
        ctx.db
          .query("tickets")
          .withIndex("by_createdBy", (q) => q.eq("createdBy", subject))
          .order("desc")
          .take(100),
        ctx.db
          .query("tickets")
          .withIndex("by_assignedToUser", (q) => q.eq("assignedToUser", subject))
          .order("desc")
          .take(100),
      ]);

  // Fetch user teams and projects
      const user = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", subject))
        .first();
      const teamsRaw = user?.teams ?? [];
  const projectsRaw = user?.projects ?? [];
      const teams = teamsRaw.map((t) => t.toLowerCase());
  // normalized projects not needed; queries use raw project names

      let teamTickets: Doc<"tickets">[] = [];
      if (teamsRaw.length > 0) {
        const results: Doc<"tickets">[][] = [];
        for (const teamName of teamsRaw) {
          const rows = await ctx.db
            .query("tickets")
            .withIndex("by_assignedToGroup", (q) => q.eq("assignedToGroup", teamName))
            .order("desc")
            .take(100);
          results.push(rows);
        }
        const seen = new Map<string, Doc<"tickets">>();
        for (const arr of results) {
          for (const t of arr) {
            const g = (t.assignedToGroup ?? "").toLowerCase();
            if (teams.includes(g)) seen.set(t._id, t);
          }
        }
        teamTickets = Array.from(seen.values());
      }

      const map = new Map<string, Doc<"tickets">>();
      for (const t of created) map.set(t._id, t);
      for (const t of assigned) map.set(t._id, t);
      for (const t of teamTickets) map.set(t._id, t);

      // Also include tickets that belong to any of the user's projects
      if (projectsRaw.length > 0) {
        for (const projName of projectsRaw) {
          const rows = await ctx.db
            .query("tickets")
            .withIndex("by_project", (q) => q.eq("project", projName))
            .order("desc")
            .take(100);
          for (const r of rows) map.set(r._id, r);
        }
      }

      return Array.from(map.values())
        .sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0))
        .slice(0, 200);
    }
    // Privileged: show all tickets
    return ctx.db.query("tickets").order("desc").take(500);
  },
});

// Recent open tickets (max 5) respecting the same access control semantics as listActiveTickets
export const recentOpenTickets = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const subject = identity.subject;
    const roles = await userRoles(ctx, subject);
    const isAdminUser = isPrivileged(roles);

    if (isAdminUser) {
      // Admin: simply the latest 5 open tickets overall
      const all = await ctx.db
        .query("tickets")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .order("desc")
        .take(5);
      return all;
    }
    // Optimized non-admin path: single scan of newest open tickets, filter by access rules, early exit.
    // Rationale: Original implementation fanned out many parallel queries (created, assigned,
    // per-team, per-project) which can exceed the 1s Convex query execution limit for users
    // with many memberships. We only need the top 5 newest open tickets, so a single indexed
    // scan on status=open is much cheaper; we then apply access filtering in memory and stop early.

    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", subject))
      .first();
    const teams = new Set((user?.teams ?? []).map((t: string) => t.toLowerCase()));
    const projects = new Set((user?.projects ?? []).map((p: string) => p));

    // Fetch a modest batch of newest open tickets; adjust batch size if needed.
    // Typically 50 is enough to find 5 accessible ones; if not, we could loop with pagination.
    const batch = await ctx.db
      .query("tickets")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(50);

    const result: Doc<"tickets">[] = [];
    for (const t of batch) {
      const accessible =
        t.createdBy === subject ||
        t.assignedToUser === subject ||
        (t.assignedToGroup && teams.has(t.assignedToGroup.toLowerCase())) ||
        (t.project && projects.has(t.project));
      if (accessible) {
        result.push(t);
        if (result.length >= 5) break; // early exit
      }
    }
    return result;
  },
});

// Server-side paginated tickets with filters and access control
export const listTicketsPaginated = query({
  args: {
    // Accept missing numItems on subsequent pages; we'll default it server-side
    paginationOpts: v.object({
      cursor: v.union(v.string(), v.null()),
      endCursor: v.optional(v.union(v.string(), v.null())),
      id: v.optional(v.float64()),
      maximumBytesRead: v.optional(v.float64()),
      maximumRowsRead: v.optional(v.float64()),
      // numItems is optional because usePaginatedQuery omits it on follow-up fetches.
      numItems: v.optional(v.float64()),
    }),
    status: v.optional(v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed"),
      v.literal("escalated"),
    )),
    priority: v.optional(v.union(v.literal("P0"), v.literal("P1"), v.literal("P2"), v.literal("P3"))),
    group: v.optional(v.string()), // assignedToGroup
    project: v.optional(v.string()),
    from: v.optional(v.number()), // ms epoch
    to: v.optional(v.number()), // ms epoch
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: null as unknown as string };

    const subject = identity.subject;
    const roles = await userRoles(ctx, subject);
    const isAdmin = isPrivileged(roles);

    // Base query
    let qb = ctx.db.query("tickets");

    // Apply access control for non-privileged users
    if (!isAdmin) {
      // Load user's teams and projects
      const me = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", subject))
        .first();
      const teams = (me?.teams ?? []) as string[];
      const projects = (me?.projects ?? []) as string[];

      qb = qb.filter((f) => {
        // Start with createdBy OR assignedToUser
        let expr = f.or(
          f.eq(f.field("createdBy"), subject),
          f.eq(f.field("assignedToUser"), subject),
        );
        // OR in each team and project condition
        for (const t of teams) {
          expr = f.or(expr, f.eq(f.field("assignedToGroup"), t));
        }
        for (const p of projects) {
          expr = f.or(expr, f.eq(f.field("project"), p));
        }
        return expr;
      });
    }

    // Apply filters
  const { status, priority, group, project, from, to } = args;
    if (status) qb = qb.filter((f) => f.eq(f.field("status"), status));
    if (priority) qb = qb.filter((f) => f.eq(f.field("priority"), priority));
    if (group && group !== "all") qb = qb.filter((f) => f.eq(f.field("assignedToGroup"), group));
    if (project) qb = qb.filter((f) => f.eq(f.field("project"), project));
    if (from && to) {
      qb = qb.filter((f) => f.and(
        f.gte(f.field("createdAt"), from),
        f.lte(f.field("createdAt"), to),
      ));
    } else if (from) {
      qb = qb.filter((f) => f.gte(f.field("createdAt"), from));
    } else if (to) {
      qb = qb.filter((f) => f.lte(f.field("createdAt"), to));
    }

    // Sort newest first and paginate (normalize numItems if missing)
    const po = args.paginationOpts as unknown as {
      cursor: string | null;
      endCursor?: string | null;
      id?: number;
      maximumBytesRead?: number;
      maximumRowsRead?: number;
      numItems?: number;
    };
    const normalized = {
      cursor: po.cursor ?? null,
      endCursor: po.endCursor,
      id: po.id,
      maximumBytesRead: po.maximumBytesRead,
      maximumRowsRead: po.maximumRowsRead,
      numItems: Math.max(1, Math.min(100, po.numItems ?? 10)),
    } as const;
    const res = await qb.order("desc").paginate(normalized);
    return res;
  },
});

export const getAllTickets = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("in_progress"),
        v.literal("resolved"),
        v.literal("closed"),
        v.literal("escalated"),
      ),
    ),
    priority: v.optional(v.union(v.literal("P0"), v.literal("P1"), v.literal("P2"), v.literal("P3"))),
    assigned: v.optional(v.union(v.literal("assigned"), v.literal("unassigned"))),
  },
  handler: async (ctx, args) => {
    let rows: Doc<"tickets">[] = [];
    if (args.status) {
      rows = await ctx.db
        .query("tickets")
        .withIndex("by_status", (s) => s.eq("status", args.status as Doc<"tickets">["status"]))
        .order("desc")
        .collect();
    } else if (args.priority) {
      rows = await ctx.db
        .query("tickets")
        .withIndex("by_priority", (p) => p.eq("priority", args.priority as Doc<"tickets">["priority"]))
        .order("desc")
        .collect();
    } else {
      rows = await ctx.db.query("tickets").order("desc").collect();
    }

    if (args.assigned === "assigned") {
      rows = rows.filter((t) => !!(t.assignedToUser || t.assignedToGroup));
    } else if (args.assigned === "unassigned") {
      rows = rows.filter((t) => !t.assignedToUser && !t.assignedToGroup);
    }
    return rows;
  },
});

export const getUnassignedTickets = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("tickets")
      .filter((q) => q.and(q.eq(q.field("assignedToUser"), undefined), q.eq(q.field("assignedToGroup"), undefined)))
      .order("desc")
      .collect();
  },
});

export const getTicketActivities = query({
  args: { ticketId: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("ticket_events")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .collect();
    return events;
  },
});

// Action to generate a signed upload URL for client-side file uploads.
export const getUploadUrl = action({
  args: {},
  handler: async (ctx) => {
    // Convex provides a storage writer that can generate an upload URL.
    // The runtime syscall returns an object like { url, storageId }
    const writer = ctx.storage;
    // generateUploadUrl returns an object expected by client: { url, storageId }
    const res = await writer.generateUploadUrl();
    return res;
  },
});

export const getTicketStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("tickets").collect();
    const stats = {
      total: all.length,
      open: all.filter((t) => t.status === "open").length,
      inProgress: all.filter((t) => t.status === "in_progress").length,
      escalated: all.filter((t) => t.status === "escalated").length,
      resolved: all.filter((t) => t.status === "resolved").length,
      closed: all.filter((t) => t.status === "closed").length,
      P0: all.filter((t) => t.priority === "P0").length,
      P1: all.filter((t) => t.priority === "P1").length,
      P2: all.filter((t) => t.priority === "P2").length,
      P3: all.filter((t) => t.priority === "P3").length,
    };
    return stats;
  },
});

export const listTicketsByProject = query({
  args: { project: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("tickets")
      .withIndex("by_project", (q) => q.eq("project", args.project))
      .order("desc")
      .take(500);
    return rows;
  },
});

export const listTicketsByTeam = query({
  args: { team: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("tickets")
      .withIndex("by_assignedToGroup", (q) => q.eq("assignedToGroup", args.team))
      .order("desc")
      .take(500);
    return rows;
  },
});

export const escalateIfDue = mutation({
  args: { ticketId: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const t = await ctx.db
      .query("tickets")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .first();
    if (!t) return { changed: false };
    if (t.status === "resolved" || t.status === "closed") return { changed: false };
    if (!t.dueAt || args.now < t.dueAt) return { changed: false };
    const currentLevel = t.lastEscalationLevel ?? 0;
    if (currentLevel >= 3) return { changed: false }; // terminal
    const nextLevel = currentLevel + 1;
    const nextDue = nextEscalationDueAt(nextLevel, args.now);

    await ctx.db.patch(t._id, {
      status: "escalated",
      lastEscalationLevel: nextLevel,
      dueAt: nextDue,
    });
    await ctx.db.insert("ticket_events", {
      ticketId: t.ticketId,
      type: "escalated",
      details: JSON.stringify({ from: currentLevel, to: nextLevel }),
    });

    // Determine newly added roles for this escalation stage
    const newRoles = newRecipientsForLevel(nextLevel).map((r) => r.toLowerCase());
    const notified = new Set<string>();
    const users = (await ctx.db.query("users").collect()) as Doc<"users">[];
    for (const u of users) {
      const rolesLower = (u.roles ?? []).map((r) => r.toLowerCase());
      if (rolesLower.some((r) => newRoles.includes(r))) notified.add(u.authUserId);
    }
    // Add cumulative semantics: always include creator and current assignee (if any) so they see escalation trail
    notified.add(t.createdBy);
    if (t.assignedToUser) notified.add(t.assignedToUser);

    const title = `Ticket ${t.ticketId} escalated (level ${nextLevel})`;
    const body = nextLevel === 1
      ? `Escalated: Security Delegate + IRT engaged.`
      : nextLevel === 2
        ? `Escalated: Senior Management engaged.`
        : `Escalated: Full Executive, Legal, Comms & External Specialists engaged.`;

    for (const uid of notified) {
      if (!uid) continue;
      await ctx.db.insert("notifications", {
        userId: uid,
        channel: "in_app",
        title,
        body,
        read: false,
        meta: { ticketId: t.ticketId, escalationLevel: nextLevel },
      });
      await ctx.db.insert("notifications", {
        userId: uid,
        channel: "email",
        title,
        body,
        read: true,
        sent: false,
        meta: { ticketId: t.ticketId, escalationLevel: nextLevel },
      });
      try {
        await pushNotifications.sendPushNotification(ctx, {
          userId: uid,
          notification: { title, body, data: { ticketId: t.ticketId, escalationLevel: String(nextLevel) } },
        });
      } catch {
        // ignore push errors
      }
    }
    return { changed: true };
  },
});

// Determine next higher priority (P3->P2->P1->P0). Returns same if already highest.
function nextHigherPriority(p: "P0" | "P1" | "P2" | "P3"): "P0" | "P1" | "P2" | "P3" {
  if (p === "P3") return "P2";
  if (p === "P2") return "P1";
  if (p === "P1") return "P0";
  return "P0";
}

// Mutation: Automatically raise priority if SLA (dueAt) passed, adjust group, notify.
export const autoRaisePriorityIfDue = mutation({
  args: { ticketId: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const t = await ctx.db
      .query("tickets")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .first();
    if (!t) return { changed: false, reason: "not_found" };
    if (t.status === "resolved" || t.status === "closed") return { changed: false, reason: "completed" };
    if (!t.autoPriority) return { changed: false, reason: "auto_priority_disabled" };
    if (!t.dueAt || args.now < t.dueAt) return { changed: false, reason: "not_due" };

    const currentPriority = t.priority as "P0" | "P1" | "P2" | "P3";
    const elevated = nextHigherPriority(currentPriority);
    if (elevated === currentPriority) {
      // Already at top; disable further auto changes.
      await ctx.db.patch(t._id, { autoPriority: false });
      return { changed: false, reason: "already_highest" };
    }

    const newDueAt = computeSlaDueAt(elevated, args.now);
    const newGroup = initialAssignmentForPriority(elevated);
    await ctx.db.patch(t._id, {
      priority: elevated,
      assignedToGroup: newGroup,
      dueAt: newDueAt,
      updatedAt: args.now,
      // Keep autoPriority true unless we reached P0 (will be disabled below)
      autoPriority: elevated !== "P0",
    });

    await ctx.db.insert("ticket_events", {
      ticketId: t.ticketId,
      type: "priority_auto_raised",
      details: JSON.stringify({ from: currentPriority, to: elevated, previousGroup: t.assignedToGroup, newGroup, dueAt: newDueAt }),
    });

    // Notify users by role/team membership - simple approach: users whose teams array includes newGroup (case-insensitive) OR roles matching pattern inside group label.
    const users = (await ctx.db.query("users").collect()) as Doc<"users">[];
    const recipients: string[] = [];
    const groupLower = newGroup.toLowerCase();
    for (const u of users) {
      const teams = (u.teams ?? []).map((g) => g.toLowerCase());
      if (teams.includes(groupLower)) recipients.push(u.authUserId);
    }
    // Always include creator
    recipients.push(t.createdBy);
    if (t.assignedToUser) recipients.push(t.assignedToUser);

    const unique = Array.from(new Set(recipients.filter(Boolean)));
    const title = `Ticket ${t.ticketId} priority raised to ${elevated}`;
    const body = `Automatic SLA escalation: priority ${currentPriority} -> ${elevated}. New group: ${newGroup}.`;
    for (const uid of unique) {
      await ctx.db.insert("notifications", {
        userId: uid,
        channel: "in_app",
        title,
        body,
        read: false,
        meta: { ticketId: t.ticketId, priorityFrom: currentPriority, priorityTo: elevated },
      });
      await ctx.db.insert("notifications", {
        userId: uid,
        channel: "email",
        title,
        body,
        read: true,
        sent: false,
        meta: { ticketId: t.ticketId, priorityFrom: currentPriority, priorityTo: elevated },
      });
    }

    return { changed: true, newPriority: elevated, newGroup, newDueAt };
  },
});

// Batch mutation: raise overdue priorities for many tickets at once.
export const autoRaiseOverduePriorities = mutation({
  args: { now: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(500, args.limit ?? 100));
    const now = args.now;
    // naive scan; in production you'd index/filter tighter
    const tickets = await ctx.db.query("tickets").take(2000);
    const results: Array<{ ticketId: string; changed: boolean }> = [];
    for (const t of tickets as Doc<"tickets">[]) {
      if (results.length >= limit) break;
      if (!t.autoPriority) continue;
      if (!t.dueAt || now < t.dueAt) continue;
      if (t.status === "resolved" || t.status === "closed") continue;
      const res = await ctx.runMutation(api.myFunctions.autoRaisePriorityIfDue, { ticketId: t.ticketId, now });
      results.push({ ticketId: t.ticketId, changed: res.changed });
    }
    return { processed: results.length, results };
  },
});

export const slaSweep = action({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const tickets = await ctx.runQuery(api.myFunctions.listActiveTickets, {});
    for (const t of tickets) {
      await ctx.runMutation(api.myFunctions.escalateIfDue, { ticketId: t.ticketId, now });
    }
  },
});

export const reportSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const roles = await userRoles(ctx, identity.subject);
    if (!isPrivileged(roles)) {
      console.log(`[Forbidden] action=reportSummary denied actor=${identity.subject} reason=not_privileged roles=${roles.join(",")}`);
      throw new Error("Forbidden");
    }
    const all = await ctx.db.query("tickets").collect();
    const byPriority = all.reduce<Record<string, number>>((acc, t) => {
      acc[t.priority] = (acc[t.priority] ?? 0) + 1;
      return acc;
    }, {});
    const byStatus = all.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    }, {});
    return { total: all.length, byPriority, byStatus };
  },
});

async function createNotifications(
  ctx: MutationCtx,
  ticketId: string,
  priority: "P0" | "P1" | "P2" | "P3",
  title: string,
  body: string,
) {
  // Notify creator and groups according to escalation matrix
  const ticket = await ctx.db
    .query("tickets")
    .withIndex("by_ticketId", (q) => q.eq("ticketId", ticketId))
    .first();
  if (!ticket) return;

  const recipients = new Set<string>();
  recipients.add(ticket.createdBy);

  // Team members by explicit team membership
  const members = (await ctx.db.query("users").collect()) as Doc<"users">[];
  for (const u of members) {
    const inTeam = ticket.assignedToGroup && (u.teams ?? []).some((t) => t.toLowerCase() === ticket.assignedToGroup?.toLowerCase());
    const inMatrix = u.roles?.some((r) => groupsForPriority(priority).includes(r.toLowerCase()));
    if (inTeam || inMatrix) recipients.add(u.authUserId);
  }

  for (const uid of recipients) {
    if (!uid) continue;
    // In-app
    await ctx.db.insert("notifications", {
      userId: uid,
      channel: "in_app",
      title,
      body,
      read: false,
      meta: { ticketId },
    });
    // Email
    await ctx.db.insert("notifications", {
      userId: uid,
      channel: "email",
      title,
      body,
      read: true,
      sent: false,
      meta: { ticketId },
    });
    // Push via Convex Components
    try {
      await pushNotifications.sendPushNotification(ctx, {
        userId: uid,
        notification: { title, body, data: { ticketId } },
      });
    } catch {
      // ignore push errors; component will retry internally
    }
  }
}

// Mutation to enqueue outbound email notifications for unsent email channel notifications
export const enqueueEmails = mutation({
  args: {},
  handler: async (ctx) => {
    // Find unsent email notifications
    const unsent = await ctx.db
      .query("notifications")
      .withIndex("by_channel", (q) => q.eq("channel", "email"))
      .filter((q) => q.eq(q.field("sent"), false))
      .take(50); // batch size
    // Schedule background action to send them (so we don't block mutations)
    if (unsent.length > 0) {
  await ctx.scheduler.runAfter(0, api.emailActions.sendPendingEmails, { ids: unsent.map((n) => n._id) });
    }
    return { queued: unsent.length };
  },
});

export const getNotification = query({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getUserByAuthId = query({
  args: { authUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .first();
  },
});

export const markNotificationSent = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { sent: true });
  },
});

function groupsForPriority(priority: "P0" | "P1" | "P2" | "P3") {
  switch (priority) {
    case "P3":
      return ["it_support"];
    case "P2":
      return ["security_delegate", "irt"];
    case "P1":
      return ["security_delegate", "irt", "senior_management"];
    case "P0":
      return [
        "security_delegate",
        "irt",
        "senior_management",
        "legal",
        "comms",
        "external_specialists",
      ];
  }
}

export const setTicketStatus = mutation({
  args: {
    ticketId: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed"),
      v.literal("escalated"),
    ),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const actorId = (args.userId && args.userId.trim()) || identity.subject;

    const t = await ctx.db
      .query("tickets")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .first();
    if (!t) throw new Error("Ticket not found");

    const roles = await userRoles(ctx, actorId);

    // Allow privileged users, the ticket creator closing their own ticket,
    // the currently assigned user, or members of the assigned group.
    let inAssignedTeam = false;
    if (t.assignedToGroup) {
      const me = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", actorId))
        .first();
      const teams = (me?.teams ?? []).map((tm) => tm.toLowerCase());
      inAssignedTeam = teams.includes(t.assignedToGroup.toLowerCase());
    }

    const actorIsPrivileged = isPrivileged(roles);
    const actorIsAssignee = t.assignedToUser === actorId;
    const creatorClosingOwn = t.createdBy === actorId && args.status === "closed";

    if (!actorIsPrivileged && !creatorClosingOwn && !actorIsAssignee && !inAssignedTeam) {
      console.log(`[Forbidden] action=setTicketStatus denied actor=${actorId} ticketId=${args.ticketId} reason=not_privileged_not_creator_not_assignee_not_team roles=${roles.join(",")}`);
      throw new Error("Forbidden");
    }

    const patch: { status: Doc<"tickets">["status"]; dueAt?: number; updatedAt?: number } = { status: args.status, updatedAt: Date.now() };
    if (args.status === "resolved" || args.status === "closed") {
      patch.dueAt = undefined as unknown as number; // remove field
    }

    await ctx.db.patch(t._id, { status: args.status, updatedAt: Date.now() });

    await ctx.db.insert("ticket_events", {
      ticketId: t.ticketId,
      type: "status_changed",
      actorId,
      details: JSON.stringify({ from: t.status, to: args.status }),
    });

    // Activity log style entry
    await ctx.db.insert("ticket_events", {
      ticketId: t.ticketId,
      type: "system",
      actorId,
      details: JSON.stringify({ action: "status_changed", description: `Status changed from ${t.status} to ${args.status}`, oldValue: t.status, newValue: args.status }),
    });

    await createNotifications(
      ctx,
      t.ticketId,
      t.priority,
      `Ticket ${t.ticketId} updated`,
      `Status changed to ${args.status.replace("_", " ")}`,
    );

    // Schedule a web push to browser subscribers for relevant recipients
    try {
      const recipients = new Set<string>();
      recipients.add(t.createdBy);
      const members = (await ctx.db.query("users").collect()) as Doc<"users">[];
      for (const u of members) {
        const inTeam = Boolean(t.assignedToGroup) && (u.teams ?? []).some((g) => g.toLowerCase() === (t.assignedToGroup ?? '').toLowerCase());
  const inMatrix = (u.roles ?? []).some((r) => groupsForPriority(t.priority as "P0"|"P1"|"P2"|"P3").includes(r.toLowerCase()));
        if (inTeam || inMatrix) recipients.add(u.authUserId);
      }
      const userIds = Array.from(recipients).filter((x): x is string => typeof x === 'string' && x.length > 0);
      if (userIds.length > 0) {
        await ctx.scheduler.runAfter(0, api.webPush.send, {
          title: `Ticket ${t.ticketId} updated`,
          body: `Status changed to ${args.status.replace("_", " ")}`,
          url: `/tickets/${t.ticketId}`,
          userIds,
        });
      }
    } catch (e) {
      console.log('schedule web push failed', e);
    }
  },
});

export const assignTicket = mutation({
  args: {
    ticketId: v.string(),
    assigneeUserId: v.string(), // Better Auth user id
    userId: v.optional(v.string()), // actor id override from client
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const actorId = (args.userId && args.userId.trim()) || identity.subject;

    const t = await ctx.db
      .query("tickets")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .first();
    if (!t) throw new Error("Ticket not found");

    const roles = await userRoles(ctx, actorId);
    const privileged = isPrivileged(roles) || roles.map((r) => r.toLowerCase()).includes("dispatcher");

    // Fetch actor user record for team/project membership
    const actorUser = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", actorId))
      .first();

    const actorTeams = (actorUser?.teams ?? []).map((x) => x.toLowerCase());
    const actorProjects = (actorUser?.projects ?? []).map((x) => x.toLowerCase());
    const ticketGroup = t.assignedToGroup?.toLowerCase();
    const ticketProject = (t as unknown as { project?: string }).project?.toLowerCase();

    const sameTeam = ticketGroup ? actorTeams.includes(ticketGroup) : false;
    const sameProject = ticketProject ? actorProjects.includes(ticketProject) : false;

    // Allow self-assignment (only to themselves) if they share team or project
    const selfAssigning = args.assigneeUserId === actorId;
    const selfAssignAllowed = selfAssigning && (sameTeam || sameProject);

    // Allow current assignee to reassign regardless of privilege
    const isCurrentAssignee = t.assignedToUser === actorId;
    const canAssign = privileged || selfAssignAllowed || isCurrentAssignee;
    if (!canAssign) {
      console.log(`[Forbidden] action=assignTicket denied actor=${actorId} ticketId=${args.ticketId} reason=not_authorized roles=${roles.join(",")} selfAssigning=${selfAssigning} sameTeam=${sameTeam} sameProject=${sameProject} isCurrentAssignee=${isCurrentAssignee}`);
      throw new Error("Forbidden");
    }

    await ctx.db.patch(t._id, { assignedToUser: args.assigneeUserId, status: t.status === "open" ? "in_progress" : t.status, updatedAt: Date.now() });

    await ctx.db.insert("ticket_events", {
      ticketId: t.ticketId,
      type: "assigned",
      actorId: actorId,
      details: JSON.stringify({ toUser: args.assigneeUserId }),
    });

    // Activity log style entry
    await ctx.db.insert("ticket_events", {
      ticketId: t.ticketId,
      type: "system",
      actorId,
      details: JSON.stringify({ action: "assigned", description: `Ticket assigned to ${args.assigneeUserId}`, newValue: args.assigneeUserId }),
    });

    // Directly notify the new assignee
    if (args.assigneeUserId) {
      await ctx.db.insert("notifications", {
        userId: args.assigneeUserId,
        channel: "in_app",
        title: `Ticket ${t.ticketId} assigned to you`,
        body: `You are now assigned to ticket ${t.ticketId}`,
        read: false,
        meta: { ticketId: t.ticketId },
      });
      await ctx.db.insert("notifications", {
        userId: args.assigneeUserId,
        channel: "email",
        title: `Ticket ${t.ticketId} assigned to you`,
        body: `You are now assigned to ticket ${t.ticketId}`,
        read: true,
        sent: false,
        meta: { ticketId: t.ticketId },
      });
      // Push via Convex Components
      try {
        await pushNotifications.sendPushNotification(ctx, {
          userId: args.assigneeUserId,
          notification: {
            title: `Ticket ${t.ticketId} assigned to you`,
            body: `You are now assigned to ticket ${t.ticketId}`,
            data: { ticketId: t.ticketId },
          },
        });
      } catch {
        // ignore push errors
      }
    }

    await createNotifications(
      ctx,
      t.ticketId,
      t.priority,
      `Ticket ${t.ticketId} assigned`,
      `Assigned to a new owner`,
    );
  },
});

export const assignToGroup = mutation({
  args: {
    ticketId: v.string(),
    group: v.string(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const actorId = (args.userId && args.userId.trim()) || identity.subject;

    const t = await ctx.db
      .query("tickets")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .first();
    if (!t) throw new Error("Ticket not found");

    const roles = await userRoles(ctx, actorId);
    const canAssign = isPrivileged(roles) || roles.map((r) => r.toLowerCase()).includes("dispatcher");
    if (!canAssign) {
      console.log(`[Forbidden] action=assignToGroup denied actor=${actorId} ticketId=${args.ticketId} reason=not_privileged_not_dispatcher roles=${roles.join(",")}`);
      throw new Error("Forbidden");
    }

    await ctx.db.patch(t._id, { assignedToGroup: args.group, updatedAt: Date.now() });

    await ctx.db.insert("ticket_events", {
      ticketId: t.ticketId,
      type: "assigned",
      actorId: actorId,
      details: JSON.stringify({ toGroup: args.group }),
    });

    await createNotifications(
      ctx,
      t.ticketId,
      t.priority,
      `Ticket ${t.ticketId} group changed`,
      `Assigned to group ${args.group}`,
    );
  },
});

export const changeProject = mutation({
  args: { ticketId: v.string(), project: v.union(v.string(), v.null()) , userId: v.optional(v.string())},
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const actorId = (args.userId && args.userId.trim()) || identity.subject;
    const t = await ctx.db.query("tickets").withIndex("by_ticketId", q => q.eq("ticketId", args.ticketId)).first();
    if (!t) throw new Error("Ticket not found");
    const roles = await userRoles(ctx, actorId);
    const privileged = isPrivileged(roles) || roles.map(r => r.toLowerCase()).includes('dispatcher');
    const isAssignee = t.assignedToUser === actorId;
    // Allow if privileged OR current assignee OR actor shares project/team (for empty → new or switch within their projects)
    const actorUser = await ctx.db.query('users').withIndex('by_authUserId', q => q.eq('authUserId', actorId)).first();
    const actorProjects = (actorUser?.projects ?? []).map(p => p.toLowerCase());
    const shareProject = t.project ? actorProjects.includes(t.project.toLowerCase()) : false;
    const can = privileged || isAssignee || shareProject;
    if (!can) {
      console.log(`[Forbidden] action=changeProject ticketId=${args.ticketId} actor=${actorId}`);
      throw new Error('Forbidden');
    }
    await ctx.db.patch(t._id, { project: args.project || undefined, updatedAt: Date.now() });
    await ctx.db.insert('ticket_events', { ticketId: t.ticketId, type: 'project_changed', actorId, details: JSON.stringify({ project: args.project || null }) });
    await createNotifications(ctx, t.ticketId, t.priority, `Ticket ${t.ticketId} project changed`, `Project set to ${args.project || 'None'}`);
  }
});
