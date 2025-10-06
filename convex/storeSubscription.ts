import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const store = mutation({
  args: { userId: v.string(), subscription: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const endpoint = typeof (args.subscription as { endpoint?: unknown })?.endpoint === 'string'
      ? (args.subscription as { endpoint: string }).endpoint
      : undefined;
    const dup = existing.find((r) => {
      const sub = r.subscription as { endpoint?: unknown };
      return typeof sub?.endpoint === 'string' && sub.endpoint === endpoint;
    });
    if (dup) return { ok: true, added: false } as const;
    await ctx.db.insert("subscriptions", {
      userId: args.userId,
      subscription: args.subscription,
      createdAt: Date.now(),
    });
    return { ok: true, added: true } as const;
  },
});
