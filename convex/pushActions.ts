"use node";

import { action } from "./_generated/server";

export const sendPendingPush = action({
  args: {},
  handler: async () => {
    // Using Convex Components for push notifications; no external batching required.
    return { sent: 0 };
  },
});
