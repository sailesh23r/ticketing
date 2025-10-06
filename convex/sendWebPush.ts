"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import * as webpush from "web-push";

export const send = action({
  args: {
    subscription: v.any(),
    payload: v.object({ title: v.string(), body: v.optional(v.string()), url: v.optional(v.string()) }),
  },
  handler: async (_ctx, args) => {
    const pub = process.env.WEBPUSH_VAPID_PUBLIC || process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.WEBPUSH_VAPID_PRIVATE || process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) throw new Error("Missing WEBPUSH_VAPID_PUBLIC/PRIVATE env vars");
    webpush.setVapidDetails("mailto:admin@example.com", pub, priv);
    await webpush.sendNotification(args.subscription, JSON.stringify(args.payload));
    return { ok: true };
  },
});
