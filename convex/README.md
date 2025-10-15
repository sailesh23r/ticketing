Convex backend overview

- Teams notifications: configure one of these environment variables in your deployment to enable messages to a Microsoft Teams channel via an Incoming Webhook.
  - TEAMS_WEBHOOK_URL (fallback for all messages)
  - TEAMS_WEBHOOK_URL_<PROJECT_SLUG_UPPER>
  - TEAMS_WEBHOOK_URL_TEAM_<TEAM_SLUG_UPPER>
    - Example: for project slug "alpha" set TEAMS_WEBHOOK_URL_ALPHA
    - Example: for team name "IT Support" set TEAMS_WEBHOOK_URL_TEAM_IT_SUPPORT

Events that emit Teams messages (best-effort, non-blocking):
- Ticket created
- Ticket escalated (SLA breach chain)
- Priority auto-raised (SLA)
- Status changed

Web push delivery:
- Subscriptions are accepted at POST /api/web-push/register and stored in .data/subscriptions.json
- Convex action webPush.send calls the Next API /api/web-push/send to fan-out notifications.
- Configure VAPID keys using WEBPUSH_VAPID_PUBLIC/WEBPUSH_VAPID_PRIVATE or VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY.
# Welcome to your Convex functions directory!

Write your Convex functions here.
See https://docs.convex.dev/functions for more.

A query function that takes two arguments looks like:

```ts
// functions.js
import { query } from "./_generated/server";
import { v } from "convex/values";

export const myQueryFunction = query({
  // Validators for arguments.
  args: {
    first: v.number(),
    second: v.string(),
  },

  // Function implementation.
  handler: async (ctx, args) => {
    // Read the database as many times as you need here.
    // See https://docs.convex.dev/database/reading-data.
    const documents = await ctx.db.query("tablename").collect();

    // Arguments passed from the client are properties of the args object.
    console.log(args.first, args.second);

    // Write arbitrary JavaScript here: filter, aggregate, build derived data,
    // remove non-public properties, or create new objects.
    return documents;
  },
});
```

Using this query function in a React component looks like:

```ts
const data = useQuery(api.functions.myQueryFunction, {
  first: 10,
  second: "hello",
});
```

A mutation function looks like:

```ts
// functions.js
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const myMutationFunction = mutation({
  // Validators for arguments.
  args: {
    first: v.string(),
    second: v.string(),
  },

  // Function implementation.
  handler: async (ctx, args) => {
    // Insert or modify documents in the database here.
    // Mutations can also read from the database like queries.
    // See https://docs.convex.dev/database/writing-data.
    const message = { body: args.first, author: args.second };
    const id = await ctx.db.insert("messages", message);

    // Optionally, return a value from your mutation.
    return await ctx.db.get(id);
  },
});
```

Using this mutation function in a React component looks like:

```ts
const mutation = useMutation(api.functions.myMutationFunction);
function handleButtonPress() {
  // fire and forget, the most common way to use mutations
  mutation({ first: "Hello!", second: "me" });
  // OR
  // use the result once the mutation has completed
  mutation({ first: "Hello!", second: "me" }).then((result) =>
    console.log(result),
  );
}
```

Use the Convex CLI to push your functions to a deployment. See everything
the Convex CLI can do by running `npx convex -h` in your project root
directory. To learn more, launch the docs with `npx convex docs`.
