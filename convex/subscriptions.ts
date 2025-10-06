import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const remove = mutation({
  args: { id: v.id("subscriptions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return { ok: true } as const;
  },
});
