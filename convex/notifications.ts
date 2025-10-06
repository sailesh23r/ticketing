import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const listMyNotifications = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    // Only show in-app notifications in the UI; exclude email/push rows to avoid duplicates
    return ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .filter((q) => q.eq(q.field("channel"), "in_app"))
  .order("desc")
      .take(50);
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { read: true });
  },
});

export const sendPendingEmails = action({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.runQuery(api.notifications.listPendingEmails, {});
    const endpoint = process.env.NOTIFY_EMAIL_ENDPOINT || "http://localhost:3000/api/notify/send";
    const secret = process.env.EMAIL_WEBHOOK_SECRET || "";

    for (const n of pending) {
      const user = await ctx.runQuery(api.users.getByAuthId, { authUserId: n.userId }).catch(() => null as unknown as { email?: string });
      const to = user?.email;
      if (!to) continue;
      try {
        await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ to, subject: n.title, text: n.body }),
        });
        await ctx.runMutation(api.notifications.markSent, { id: n._id });
      } catch {
        // retry next cycle
      }
    }
  },
});

export const listPendingEmails = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("notifications")
      .withIndex("by_channel", (q) => q.eq("channel", "email"))
      .filter((q) => q.or(q.eq(q.field("sent"), false), q.eq(q.field("sent"), undefined)))
      .take(100);
  },
});

export const markSent = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { sent: true });
  },
});
