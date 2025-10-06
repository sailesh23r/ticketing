import { action, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Internal: fetch a ticket by ticketId to get doc id and text
export const getTicketByTicketId = internalQuery({
  args: { ticketId: v.string() },
  handler: async (ctx, args) => {
    const t = await ctx.db
      .query("tickets")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .first();
    if (!t) return null;
    return {
      _id: t._id,
      ticketId: t.ticketId,
      title: t.title,
      description: t.description,
      project: t.project,
      status: t.status,
    } as const;
  },
});

// Internal: save embedding vector onto a ticket doc
export const saveTicketEmbedding = internalMutation({
  args: { id: v.id("tickets"), embedding: v.array(v.float64()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { embedding: args.embedding, updatedAt: Date.now() });
  },
});

// Internal: get only the embedding for a ticket id
export const getTicketEmbeddingById = internalQuery({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.id);
    if (!t) return null as { embedding?: number[] } | null;
    const emb = (t as unknown as { embedding?: number[] }).embedding;
    return { embedding: emb };
  },
});

// Internal: fetch tickets by ids (docs) and map minimal fields
export const fetchTicketsByDocIds = internalQuery({
  args: { ids: v.array(v.id("tickets")) },
  handler: async (ctx, args) => {
    const out: Array<{ _id: Id<"tickets">; ticketId: string; title: string; status: string; project?: string }> = [];
    for (const id of args.ids) {
      const t = await ctx.db.get(id);
      if (t) out.push({ _id: t._id as Id<"tickets">, ticketId: t.ticketId, title: t.title, status: t.status, project: t.project });
    }
    return out;
  },
});

async function embed(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OpenAPI || process.env.OPENAI_KEY;
  if (!apiKey) {
    console.error("[embeddings] Missing OPENAI_API_KEY/OpenAPI/OPENAI_KEY env var — cannot generate embeddings");
    return null;
  }
  const whichKey = process.env.OPENAI_API_KEY ? "OPENAI_API_KEY" : process.env.OpenAPI ? "OpenAPI" : "OPENAI_KEY";
  console.log(`[embeddings] Generating embedding with ${whichKey}; textLen=${text.length}`);
  const body = {
    input: text,
    model: "text-embedding-3-small",
  } as const;
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[embeddings] Fetch to OpenAI failed:", e);
    return null;
  }
  if (!res.ok) {
    const errTxt = await res.text().catch(() => "<no body>");
    console.error(`[embeddings] OpenAI error status=${res.status} ${res.statusText} body=${errTxt}`);
    return null;
  }
  const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) return null;
  // Ensure float64
  console.log(`[embeddings] Received embedding; dims=${vec.length}`);
  return vec.map((x) => Number(x));
}

type SimilarDoc = { _id: Id<"tickets">; ticketId: string; title: string; status: string; project?: string }
type SimilarWithScore = SimilarDoc & { _score: number }

export const similarTicketsForTicket = action({
  args: { ticketId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<SimilarWithScore[]> => {
    console.log(`[similarTickets] start ticketId=${args.ticketId} limit=${args.limit ?? 5}`);
    // Load ticket meta
    const t = await ctx.runQuery(internal.embeddings.getTicketByTicketId, { ticketId: args.ticketId });
    if (!t) return [] as SimilarWithScore[];
    console.log(`[similarTickets] loaded meta titleLen=${t.title?.length ?? 0} hasDesc=${!!t.description} project=${t.project ?? "<none>"}`);

    // Get or create embedding
  let embedding: number[] | null = null;
  // Try to fetch from doc via internal query
  const fresh: { embedding?: number[] } | null = await ctx.runQuery(internal.embeddings.getTicketEmbeddingById, { id: t._id });
    if (fresh && Array.isArray(fresh.embedding)) {
      embedding = fresh.embedding;
      console.log(`[similarTickets] using existing embedding dims=${embedding.length}`);
    }
    if (!embedding) {
      const text = `${t.title}`.slice(0, 1024);
      console.log("[similarTickets] no embedding found; generating now...");
      embedding = await embed(text);
      if (embedding) {
    await ctx.runMutation(internal.embeddings.saveTicketEmbedding, { id: t._id, embedding });
        console.log(`[similarTickets] saved new embedding dims=${embedding.length}`);
      } else {
        console.error("[similarTickets] failed to generate embedding; aborting search");
      }
    }
    if (!embedding) return [];

    // Vector search for similar tickets in same project (if present)
  const results: Array<{ _id: Id<"tickets">; _score: number }> = await ctx.vectorSearch("tickets", "by_embedding", {
      vector: embedding,
      limit: Math.max(1, Math.min(10, args.limit ?? 5)),
      filter: t.project ? ((q) => q.eq("project", t.project as string)) : undefined,
    });
    console.log(`[similarTickets] vector results=${results.length} topScore=${results[0]?._score ?? "<none>"}`);

    // Exclude self and fetch docs
  const ids = results.map((r) => r._id).filter((id) => id !== t._id);
  const docs: SimilarDoc[] = await ctx.runQuery(internal.embeddings.fetchTicketsByDocIds, { ids });
    console.log(`[similarTickets] fetched docs=${docs.length}`);

    // Attach scores
  const scoreMap = new Map(results.map((r) => [r._id, r._score] as const));
  return docs.map((d) => ({ ...d, _score: scoreMap.get(d._id) ?? 0 }));
  },
});

// Generate and save an embedding for a ticket, used by scheduler after creation
export const generateTicketEmbedding = action({
  args: { ticketId: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ status: "ok" | "skipped" | "error"; reason?: string }> => {
    console.log(`[embedGen] start ticketId=${args.ticketId} force=${!!args.force}`);
    const t = await ctx.runQuery(internal.embeddings.getTicketByTicketId, { ticketId: args.ticketId });
    if (!t) {
      console.error("[embedGen] ticket not found");
      return { status: "error", reason: "not_found" };
    }
    if (!args.force) {
      const existing = await ctx.runQuery(internal.embeddings.getTicketEmbeddingById, { id: t._id });
      if (existing?.embedding && existing.embedding.length > 0) {
        console.log(`[embedGen] embedding already exists dims=${existing.embedding.length}`);
        return { status: "skipped" };
      }
    }
  const text = `${t.title}`.slice(0, 1024);
    const vec = await embed(text);
    if (!vec) {
      console.error("[embedGen] failed to generate embedding");
      return { status: "error", reason: "embed_failed" };
    }
    await ctx.runMutation(internal.embeddings.saveTicketEmbedding, { id: t._id, embedding: vec });
    console.log(`[embedGen] saved dims=${vec.length}`);
    return { status: "ok" };
  },
});
