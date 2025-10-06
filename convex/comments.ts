import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
// types from server runtime are not required in this file
import { userRoles } from "./myFunctions";

export const list = query({
  args: { ticketId: v.string() },
  handler: async (ctx, args) => {
    // Return the message thread for a ticket with basic author info
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .order("asc")
      .collect();

    // Resolve author names/emails
    const authorIds = Array.from(new Set(rows.map((r) => r.authorId).filter(Boolean)));
    const authorsMap: Record<string, { name?: string; email?: string }> = {};
    await Promise.all(
      authorIds.map(async (id) => {
        const u = await ctx.db
          .query("users")
          .withIndex("by_authUserId", (q) => q.eq("authUserId", id))
          .first();
        if (u) authorsMap[id] = { name: u.name, email: u.email };
      }),
    );

    const mapped = await Promise.all(rows.map(async (r) => {
      const atts = await Promise.all((r.attachments ?? []).map(async (a) => {
        try {
          const url = await ctx.storage.getUrl(a.storageId);
          return { ...a, url: url ?? undefined };
        } catch {
          return { ...a, url: undefined };
        }
      }));
      return {
        _id: r._id,
        content: r.content,
        _creationTime: r._creationTime,
        author: r.authorId ? authorsMap[r.authorId] ?? { name: r.authorId, email: "" } : null,
        attachments: atts,
      };
    }));
    return mapped;
  },
});

export const create = mutation({
  args: {
    ticketId: v.string(),
    content: v.string(),
    isInternal: v.optional(v.boolean()),
    userId: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.string(),
          fileName: v.string(),
          fileSize: v.optional(v.number()),
          contentType: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const effectiveUserId = (args.userId && args.userId.trim()) || identity.subject;

    const ticket = await ctx.db
      .query("tickets")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .first();
    if (!ticket) throw new Error("Ticket not found");

    // Permission checks: allow creator, assignee, assigned team members, or privileged roles
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
    const privileged = roles.some((r) => {
      const allowed = new Set(["admin", "it_support", "irt", "security_delegate", "senior_management", "legal", "comms", "external_specialists", "support"]);
      return allowed.has(r?.toLowerCase?.());
    });

    const allowed =
      ticket.createdBy === effectiveUserId ||
      ticket.assignedToUser === effectiveUserId ||
      inAssignedTeam ||
      privileged;
    if (!allowed) {
      console.log(`[Forbidden] action=comments.create denied actor=${effectiveUserId} ticketId=${args.ticketId} roles=${roles.join(",")}`);
      throw new Error("Forbidden");
    }

    const messageId = await ctx.db.insert("messages", {
      ticketId: args.ticketId,
      authorId: effectiveUserId,
      role: privileged ? "agent" : "user",
      content: args.content,
  attachments: args.attachments ?? [],
    });

    await ctx.db.insert("ticket_events", {
      ticketId: args.ticketId,
      type: "comment",
      actorId: effectiveUserId,
      details: args.content.slice(0, 200),
    });

    // --- Mention Notification Logic ---
    // Strategy:
    // 1. Extract raw @ mention tokens from content (support multi-word names up to 5 words).
    // 2. Attempt to match against users.name (case-insensitive) first, then email local part.
    // 3. Deduplicate user ids, exclude author, create in_app notifications.
    // 4. Store minimal meta (ticketId, messageId, mentionName).
    try {
      const raw = args.content;
      // Match @Something or @First Last (up to 5 tokens) - stop at newline or punctuation
      const mentionPattern = /@([A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+){0,4})/g;
      const found = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = mentionPattern.exec(raw)) !== null) {
        const token = m[1].trim();
        if (token.length) found.add(token);
      }
      if (found.size) {
        // Load all potential users once (could optimize by indexing search; for now small user base assumption)
        const usersAll = await ctx.db.query("users").collect();
        const resolvedAuthIds = new Set<string>();
        for (const nameCandidate of found) {
          const lower = nameCandidate.toLowerCase();
            // exact match on full name
          const byName = usersAll.find(u => (u.name || '').toLowerCase() === lower);
          if (byName) { resolvedAuthIds.add(byName.authUserId); continue; }
          // partial tokens: try first token matches name start
          const firstToken = lower.split(/\s+/)[0];
          const byFirst = usersAll.find(u => (u.name || '').toLowerCase().startsWith(firstToken+" "));
          if (byFirst) { resolvedAuthIds.add(byFirst.authUserId); continue; }
          // fallback: email local part
          const byEmailLocal = usersAll.find(u => (u.email || '').split('@')[0].toLowerCase() === lower);
          if (byEmailLocal) { resolvedAuthIds.add(byEmailLocal.authUserId); continue; }
        }
        // Exclude self
        resolvedAuthIds.delete(effectiveUserId);
        // Insert notifications
        for (const uid of resolvedAuthIds) {
          await ctx.db.insert("notifications", {
            userId: uid,
            channel: "in_app",
            title: `Mention in ticket ${ticket.ticketId}`,
            body: `You were mentioned by ${identity.name || identity.email || 'someone'}`,
            read: false,
            meta: { ticketId: ticket.ticketId, messageId, actorId: effectiveUserId },
          });
        }
      }
    } catch (err) {
      console.log(`[mentions] failed ticketId=${args.ticketId} error=${(err as Error).message}`);
    }
  },
});
