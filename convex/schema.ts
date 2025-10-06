import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Define the schema for the application
export default defineSchema({
  // Table to store user information
  users: defineTable({
    // Mirror of auth user identifiers (Better Auth user id). Optional convenience cache.
    authUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    // role could be "user", "it_support", "irt", "security_delegate", "senior_management", "legal", "comms", "external_specialist"
    roles: v.array(v.string()),
    // Memberships for routing/notifications (teams/organizations)
  teams: v.optional(v.array(v.string())),
  // Projects the user is a member of (project slugs or names)
  projects: v.optional(v.array(v.string())),
  }).index("by_authUserId", ["authUserId"]).index("by_email", ["email"]),

  // Teams workspace table (new)
  teams: defineTable({
    // short stable slug, e.g. "it-support", "irt"
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    // Optional membership list of auth user ids
    members: v.optional(v.array(v.string())),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_slug", ["slug"]).index("by_name", ["name"]),

  // Table to store counter values
  counters: defineTable({ name: v.string(), value: v.number() }).index(
    "by_name",
    ["name"],
  ),

  // Table to store ticket information
  tickets: defineTable({
    ticketId: v.string(), // human friendly ID like TCK-YYYYMMDD-0001
    title: v.string(),
    description: v.string(),
    priority: v.union(
      v.literal("P0"),
      v.literal("P1"),
      v.literal("P2"),
      v.literal("P3"),
    ),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed"),
      v.literal("escalated"),
    ),
    createdBy: v.string(), // Better Auth user id
    assignedToGroup: v.optional(v.string()), // e.g., "IT Support", "IRT"
    assignedToUser: v.optional(v.string()), // Better Auth user id assignee
    dueAt: v.optional(v.number()), // SLA deadline (ms since epoch)
    lastEscalationLevel: v.optional(v.number()), // 0..3 for P3..P0 escalation chain steps
  autoPriority: v.optional(v.boolean()), // whether system may auto-raise priority along SLA ladder
    attachments: v.optional(v.array(v.string())), // screenshot URLs
    category: v.optional(v.string()), // e.g., "Infrastructure", "Network", etc.
  // Optional project association (slug or name)
  project: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  // Vector embedding for semantic similarity (OpenAI 1536-dim)
  embedding: v.optional(v.array(v.float64())),
  })
    .index("by_ticketId", ["ticketId"]) // unique by convention
    .index("by_createdBy", ["createdBy"]) // list my tickets
    .index("by_status", ["status"]) // dashboards
    .index("by_priority", ["priority"])
    .index("by_assignedToUser", ["assignedToUser"])
    .index("by_assignedToGroup", ["assignedToGroup"])
    .index("by_project", ["project"]) // db index
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["project", "status", "assignedToGroup"],
    }),

  // Table to store ticket event information
  ticket_events: defineTable({
    ticketId: v.string(),
    type: v.string(), // created, status_changed, assigned, escalated, comment, system
    actorId: v.optional(v.string()), // user id
    details: v.optional(v.string()),
  }).index("by_ticketId", ["ticketId"]),

  // Table to store messages related to tickets
  messages: defineTable({
    ticketId: v.string(),
    authorId: v.string(), // Better Auth user id or "system/ai"
    role: v.union(v.literal("user"), v.literal("agent"), v.literal("ai"), v.literal("system")),
    content: v.string(),
    // Optional attachment metadata referencing Convex storage
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.string(),
          fileName: v.string(),
          fileSize: v.optional(v.number()),
          contentType: v.optional(v.string()),
        })
      )
    ),
  }).index("by_ticketId", ["ticketId"]),

  // Table to store notifications for users
  notifications: defineTable({
    userId: v.string(),
    channel: v.union(v.literal("in_app"), v.literal("email"), v.literal("push")),
    title: v.string(),
    body: v.string(),
    read: v.boolean(),
    sent: v.optional(v.boolean()), // For email/push delivery tracking
    meta: v.optional(v.any()),
  }).index("by_userId", ["userId"]).index("by_read", ["read"]).index("by_channel", ["channel"]),

  // Expo push tokens per user/device
  push_tokens: defineTable({
    userId: v.string(),
    token: v.string(),
    device: v.optional(v.string()),
  }).index("by_userId", ["userId"]).index("by_token", ["token"]),

  // Web Push subscriptions per user/browser
  subscriptions: defineTable({
    userId: v.string(),
    subscription: v.any(), // Raw PushSubscription JSON
    createdAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  // Table to store known issue patterns and responses
  known_issues: defineTable({
    pattern: v.string(), // simple substring or regex pattern string
    response: v.string(),
    priorityHint: v.optional(v.string()), // e.g. suggest P2
  }),

  // Projects workspace table
  projects: defineTable({
    // short stable slug, e.g. "alpha", "billing"
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    // Optional membership list of auth user ids
    members: v.optional(v.array(v.string())),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_slug", ["slug"]).index("by_name", ["name"]),

  // Ephemeral shared report snapshots for export links
  shared_reports: defineTable({
    token: v.string(), // public share token
    params: v.any(),   // filter params used to generate report
    data: v.any(),     // snapshot of tickets (limited)
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),
});
