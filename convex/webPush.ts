"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import * as webpush from "web-push";

export const send = action({
  args: {
    title: v.string(),
    body: v.optional(v.string()),
    url: v.optional(v.string()),
    userIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const pub = process.env.WEBPUSH_VAPID_PUBLIC;
    const priv = process.env.WEBPUSH_VAPID_PRIVATE;
    if (!pub || !priv) {
      console.log("webPush.send: WEBPUSH_VAPID_PUBLIC/PRIVATE env vars not set, skipping");
      return;
    }
    webpush.setVapidDetails("mailto:admin@xeltr.com", pub, priv);

    const payload = JSON.stringify({
      title: args.title,
      body: args.body || "",
      data: { url: args.url || "/" },
    });

    // Gather subscriptions for all target userIds from Convex DB
    const allSubs: { _id: string; userId: string; subscription: unknown }[] = [];
    for (const userId of args.userIds) {
      const userSubs = await ctx.runQuery(api.subscriptions.listByUser, { userId });
      for (const s of userSubs) {
        allSubs.push({ _id: s._id as string, userId: s.userId, subscription: s.subscription });
      }
    }

    if (allSubs.length === 0) {
      console.log("webPush.send: no subscriptions found for", args.userIds.length, "users");
      return;
    }

    console.log(`webPush.send: sending to ${allSubs.length} subscription(s) for ${args.userIds.length} user(s)`);

    // Send push to each subscription, remove stale ones
    for (const rec of allSubs) {
      try {
        await webpush.sendNotification(rec.subscription as any, payload);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          // Subscription expired/unsubscribed — remove from DB
          try {
            await ctx.runMutation(api.subscriptions.remove, { id: rec._id as any });
          } catch {
            // ignore cleanup errors
          }
          console.log("webPush.send: removed stale subscription", rec._id);
        } else {
          console.log("webPush.send: push failed for subscription", rec._id, err);
        }
      }
    }
  },
});
