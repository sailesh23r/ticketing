import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

type OpenAIChatCompletion = {
  choices?: { message?: { content?: string } }[];
};

export const suggestReply = action({
  args: { ticketId: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const thread = (await ctx.runQuery(api.myFunctions.getTicketThread, { ticketId: args.ticketId })) as
      | { ticket: Doc<"tickets">; messages: Doc<"messages">[] }
      | null;
    const apiKey: string | undefined = process.env.OPENAI_API_KEY;
    const conversation: string = (thread?.messages as Doc<"messages">[] | undefined)
      ?.map((m) => `${m.role}: ${m.content}`)
      .join("\n") ?? "";
    if (!apiKey) {
      return `Based on the conversation, please try the following steps and provide logs if the issue persists.`;
    }
    try {
      const res: Response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helpful IT support assistant. Provide concise, step-by-step guidance." },
            { role: "user", content: `Ticket conversation so far:\n${conversation}\n\nSuggest the next helpful reply.` },
          ],
          temperature: 0.2,
        }),
      });
      const data: OpenAIChatCompletion = (await res.json()) as OpenAIChatCompletion;
      return data.choices?.[0]?.message?.content ?? "No suggestion available.";
    } catch {
      return "AI suggestion failed. Please try again later.";
    }
  },
});
