import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { PushNotifications } from "@convex-dev/expo-push-notifications";

// Use Better Auth user id (string) as the push recipient id
const pushNotifications = new PushNotifications<string>(components.pushNotifications);

export const recordPushNotificationToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    await pushNotifications.recordToken(ctx, {
      userId: identity.subject,
      pushToken: args.token,
    });
  },
});

export const getPushStatus = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = args.userId ?? identity?.subject;
    if (!userId) return { hasToken: false, paused: false };
    return pushNotifications.getStatusForUser(ctx, { userId });
  },
});

export const pausePush = mutation({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = args.userId ?? identity?.subject;
    if (!userId) throw new Error("Unauthorized");
    await pushNotifications.pauseNotificationsForUser(ctx, { userId });
  },
});

export const unpausePush = mutation({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = args.userId ?? identity?.subject;
    if (!userId) throw new Error("Unauthorized");
    await pushNotifications.unpauseNotificationsForUser(ctx, { userId });
  },
});
