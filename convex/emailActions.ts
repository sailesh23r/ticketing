"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import nodemailer from "nodemailer";

export const sendPendingEmails = action({
  args: { ids: v.array(v.id("notifications")) },
  handler: async (ctx, args) => {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      console.log("SMTP not configured; skipping email send");
      return { sent: 0 };
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    let sentCount = 0;
    for (const id of args.ids) {
      const notif = await ctx.runQuery(api.myFunctions.getNotification, { id });
      if (!notif || notif.channel !== "email" || notif.sent) continue;
      const userDoc = await ctx.runQuery(api.myFunctions.getUserByAuthId, { authUserId: notif.userId });
      const to = userDoc?.email;
      if (!to) continue;
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || '"IT Support" <support@example.com>',
          to,
          subject: notif.title,
          text: notif.body,
        });
        await ctx.runMutation(api.myFunctions.markNotificationSent, { id });
    console.log(`[EmailSent] id=${id} to=${to} subject="${notif.title}"`);
        sentCount++;
      } catch (e) {
        console.log("Failed to send email", e);
      }
    }
  console.log(`sendPendingEmails complete: sent=${sentCount} of requested=${args.ids.length}`);
    return { sent: sentCount };
  },
});
