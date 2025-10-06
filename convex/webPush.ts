import { action } from "./_generated/server";
import { v } from "convex/values";

export const send = action({
  args: {
    title: v.string(),
    body: v.optional(v.string()),
    url: v.optional(v.string()),
    userIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || "http://host.docker.internal:3000";
    try {
      await fetch(`${base}/api/web-push/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: args.title,
          body: args.body,
          url: args.url,
          userIds: args.userIds,
        }),
      });
    } catch (e) {
      console.log("web push action failed", e);
    }
  },
});
