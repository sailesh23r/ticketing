import { query } from "./_generated/server";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Lightweight interfaces for scoping helpers
interface ScopeUser { roles?: string[]; projects?: string[] }
interface ScopeTicket { assignedToUser?: string; createdBy?: string; project?: string; status?: string }

function buildProjectSet(user: ScopeUser | null, isAdmin: boolean): Set<string> | null {
  if (isAdmin || !user || !Array.isArray(user.projects)) return null;
  return new Set(user.projects.filter(Boolean));
}

function canSeeTicket(t: ScopeTicket, authId: string | null, isAdmin: boolean, projectSet: Set<string> | null): boolean {
  if (isAdmin) return true;
  if (!authId) return false;
  if (t.assignedToUser === authId) return true;
  if (t.createdBy === authId) return true;
  if (t.project && projectSet && projectSet.has(t.project)) return true;
  return false;
}

export const ticketStats = query({
  args: {
    project: v.optional(v.string()),
    team: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const authId = identity?.subject ?? null;

    // Load current user and detect admin role
    let me: { roles?: string[] } | null = null;
    if (authId) {
      me = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", authId))
        .first();
    }
    const roles = (me?.roles ?? []).map((r) => r.toLowerCase());
    const isAdmin = roles.includes("admin");

    // Base tickets query; optional future filters: project, team
    let qb = ctx.db.query("tickets");
    if (args.project) qb = qb.filter((f) => f.eq(f.field("project"), args.project!));
    if (args.team && args.team !== "all") qb = qb.filter((f) => f.eq(f.field("assignedToGroup"), args.team!));

    const tickets = await qb.collect();

    // Visibility scoping: non-admin users only see tickets they are assigned to, created, or in their projects
    const projectSet = buildProjectSet(me as ScopeUser | null, isAdmin);

    const totals = {
      total: tickets.length,
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
      escalated: 0,
    };

    let assignedToMe = 0;
    let openAssigned = 0;
    let inProgressAssigned = 0;
    let resolvedByMe = 0;
    let closedByMe = 0;

    for (const t of tickets) {
      if (!canSeeTicket(t as ScopeTicket, authId, isAdmin, projectSet)) continue;
      switch (t.status) {
        case "open": totals.open++; break;
        case "in_progress": totals.in_progress++; break;
        case "resolved": totals.resolved++; break;
        case "closed": totals.closed++; break;
        case "escalated": totals.escalated++; break;
      }

      if (authId && t.assignedToUser === authId) {
        assignedToMe++;
        if (t.status === "open") openAssigned++;
        if (t.status === "in_progress") inProgressAssigned++;
        if (t.status === "resolved") resolvedByMe++;
        if (t.status === "closed") closedByMe++;
      }
    }

    return {
      isAdmin,
      totals,
      mine: {
        assignedToMe,
        openAssigned,
        inProgressAssigned,
        resolvedByMe,
        closedByMe,
      },
    } as const;
  },
});

export const ticketStatsSeries = query({
  args: { days: v.number(), project: v.optional(v.string()), team: v.optional(v.string()), start: v.optional(v.number()), end: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const authId = identity?.subject ?? null;

    // Load current user and detect admin role
    let me: { roles?: string[] } | null = null;
    if (authId) {
      me = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", authId))
        .first();
    }
    const roles = (me?.roles ?? []).map((r) => r.toLowerCase());
    const isAdmin = roles.includes("admin");

    let endTime = Date.now();
    let startTime = endTime - Math.max(1, Math.min(365, args.days)) * 24 * 60 * 60 * 1000;
    if (args.start && args.end) {
      const span = Math.min(366 * 24 * 60 * 60 * 1000, Math.max(1, args.end - args.start));
      startTime = args.start;
      endTime = Math.min(args.end, args.start + span);
    }

  // Fetch recent tickets (cap to 2000 for safety)
  const tickets = await ctx.db.query("tickets").order("desc").take(2000);
    const projectSet = buildProjectSet(me as ScopeUser | null, isAdmin);

    // Build daily buckets from start to now
    function dayKey(ts: number) {
      const d = new Date(ts);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    }

  const days: string[] = [];
  const cursor = new Date(startTime);
    // normalize to UTC midnight
    cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(endTime);
    end.setUTCHours(0, 0, 0, 0);
    for (let d = new Date(cursor); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(dayKey(d.getTime()));
    }

    const series: Record<string, { open: number; in_progress: number; resolved: number; closed: number; escalated: number }> = {};
    for (const d of days) series[d] = { open: 0, in_progress: 0, resolved: 0, closed: 0, escalated: 0 };

    for (const t of tickets as Array<Record<string, unknown>>) {
      const created = (typeof t.createdAt === 'number' ? t.createdAt : typeof (t as Record<string, unknown>)._creationTime === 'number' ? (t as Record<string, unknown>)._creationTime as number : undefined) as number | undefined;
      const updated = (typeof t.updatedAt === 'number' ? t.updatedAt : created) as number | undefined;

      if (!canSeeTicket(t as ScopeTicket, authId, isAdmin, projectSet)) continue;

      if (args.project && (t.project as string | undefined) !== args.project) continue;
      if (args.team && args.team !== 'all' && (t.assignedToGroup as string | undefined) !== args.team) continue;

      const status = typeof t.status === 'string' ? (t.status as 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated') : undefined;
      if (!status) continue;

      // Choose day to attribute this status: 'open' uses creation; others use updated
  const when: number | undefined = status === 'open' ? created : updated;
  if (!when || when < startTime || when > endTime) continue;
      const k = dayKey(when);
      if (!series[k]) continue;
      series[k][status] += 1;
    }

    const points = days.map((d) => ({ date: d, ...series[d] }));

    return { isAdmin, points, start: startTime, end: endTime } as const;
  },
});

export const listTeams = query({
  args: {},
  handler: async (ctx) => {
    const set = new Set<string>();
    // Collect from teams table (preferred canonical list)
    try {
      const teamRows = await ctx.db.query("teams").take(1000);
      for (const t of teamRows as Array<Record<string, unknown>>) {
        const name = typeof t.name === 'string' ? t.name : undefined;
        if (name && name.trim()) set.add(name);
      }
    } catch {
      // table may not exist yet during first deploy
    }
    // Collect from tickets.assignedToGroup
    const ticketRows = await ctx.db.query("tickets").take(2000);
    for (const r of ticketRows as Array<Record<string, unknown>>) {
      const g = typeof r.assignedToGroup === 'string' ? r.assignedToGroup : undefined;
      if (g && g.trim()) set.add(g);
    }
    // Collect from users.teams
    const userRows = await ctx.db.query("users").take(2000);
    for (const u of userRows as Array<Record<string, unknown>>) {
      const teams = Array.isArray(u.teams) ? (u.teams as unknown[]) : [];
      for (const t of teams) {
        const name = typeof t === 'string' ? t : undefined;
        if (name && name.trim()) set.add(name);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  },
});

export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("projects").take(1000);
    return (rows as Array<Record<string, unknown>>).map((p) => ({
      slug: typeof p.slug === 'string' ? p.slug : '',
      name: typeof p.name === 'string' ? p.name : (typeof p.slug === 'string' ? p.slug : ''),
    }));
  },
});

export const listTeamDocs = query({
  args: {},
  handler: async (ctx) => {
    try {
      const rows = await ctx.db.query("teams").take(1000);
      return (rows as Array<Record<string, unknown>>).map(t => ({
        slug: typeof t.slug === 'string' ? t.slug : '',
        name: typeof t.name === 'string' ? t.name : (typeof t.slug === 'string' ? t.slug : ''),
      }));
    } catch { return []; }
  }
});

// Average first response time (creation -> first event by someone else) in milliseconds
export const avgResponseTime = query({
  args: { project: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const authId = identity?.subject ?? null;

    // Load user for project membership (non-admin scoping)
    let me: { roles?: string[]; projects?: string[] } | null = null;
    if (authId) {
      me = await ctx.db.query('users').withIndex('by_authUserId', q => q.eq('authUserId', authId)).first();
    }
    const roles = (me?.roles ?? []).map(r => r.toLowerCase());
    const isAdmin = roles.includes('admin');
    const memberProjects = new Set((me?.projects ?? []).filter(Boolean));

    // Base tickets set (cap) - optionally filter by project
    let qb = ctx.db.query('tickets');
    if (args.project) qb = qb.filter(f => f.eq(f.field('project'), args.project!));
    const tickets = await qb.take(500); // limit to keep cost bounded

    const projectSet = buildProjectSet(me as ScopeUser | null, isAdmin);

    let totalDiff = 0;
    let counted = 0;

    for (const t of tickets as Array<Record<string, unknown>>) {
      const project = t.project as string | undefined;
      if (!canSeeTicket(t as ScopeTicket, authId, isAdmin, projectSet)) continue;
      if (!isAdmin && args.project && project && !memberProjects.has(args.project)) continue;
      const createdAt = typeof t.createdAt === 'number' ? t.createdAt : typeof t._creationTime === 'number' ? t._creationTime : undefined;
      if (!createdAt) continue;
      const createdBy = t.createdBy as string | undefined;
      // Fetch up to first 30 events (ascending)
      const events = await ctx.db.query('ticket_events').withIndex('by_ticketId', q => q.eq('ticketId', t.ticketId as string)).order('asc').take(30);
      const firstResponse = events.find(e => e.actorId && e.actorId !== createdBy && e.type !== 'created');
      if (!firstResponse) continue;
      const firstTs = typeof (firstResponse as Record<string, unknown>)._creationTime === 'number'
        ? (firstResponse as Record<string, unknown>)._creationTime as number
        : undefined;
      if (!firstTs) continue;
      const diff = firstTs - createdAt;
      if (diff < 0) continue;
      totalDiff += diff;
      counted++;
    }

    const averageMs = counted ? Math.round(totalDiff / counted) : 0;
    return { averageMs, sample: counted } as const;
  }
});

// Distribution of ticket turnaround times (creation -> resolution/closure) bucketed.
// Buckets: 0-1h, 1-8h, 8-24h, 24-72h, >72h (only resolved or closed tickets included).
export const turnaroundBuckets = query({
  args: { project: v.optional(v.string()), team: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const authId = identity?.subject ?? null;

    // Determine admin privileges
    let me: { roles?: string[] } | null = null;
    if (authId) {
      me = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", authId))
        .first();
    }
    const roles = (me?.roles ?? []).map((r) => r.toLowerCase());
    const isAdmin = roles.includes("admin");

    // Pull a reasonable cap of tickets to analyze
    let qb = ctx.db.query("tickets");
    if (args.project) qb = qb.filter(f => f.eq(f.field("project"), args.project!));
    if (args.team && args.team !== 'all') qb = qb.filter(f => f.eq(f.field("assignedToGroup"), args.team!));
    const tickets = await qb.take(3000); // cap for performance

    const projectSet = buildProjectSet(me as ScopeUser | null, isAdmin);

    const MS_HOUR = 60 * 60 * 1000;
    const bucketDefs: Array<{ key: string; label: string; min: number; max: number | null }> = [
      { key: 'under1h', label: '0-1h', min: 0, max: 1 * MS_HOUR },
      { key: 'h1to8', label: '1-8h', min: 1 * MS_HOUR, max: 8 * MS_HOUR },
      { key: 'h8to24', label: '8-24h', min: 8 * MS_HOUR, max: 24 * MS_HOUR },
      { key: 'h24to72', label: '24-72h', min: 24 * MS_HOUR, max: 72 * MS_HOUR },
      { key: 'over72h', label: '>72h', min: 72 * MS_HOUR, max: null },
    ];

    const counts: Record<string, number> = Object.fromEntries(bucketDefs.map(b => [b.key, 0]));
    let totalCompleted = 0;

    for (const t of tickets as Array<Record<string, unknown>>) {
      const status = typeof t.status === 'string' ? t.status : undefined;
      if (status !== 'resolved' && status !== 'closed') continue; // Only completed tickets

      if (!canSeeTicket(t as ScopeTicket, authId, isAdmin, projectSet)) continue;
      const createdAt = typeof t.createdAt === 'number' ? t.createdAt : typeof t._creationTime === 'number' ? t._creationTime as number : undefined;
      const finishedAt = typeof t.updatedAt === 'number' ? t.updatedAt : createdAt;
      if (!createdAt || !finishedAt || finishedAt < createdAt) continue;
      const delta = finishedAt - createdAt;
      // Find matching bucket
      const bucket = bucketDefs.find(b => (delta >= b.min) && (b.max === null || delta < b.max));
      if (bucket) {
        counts[bucket.key] += 1;
        totalCompleted++;
      }
    }

    const buckets = bucketDefs.map(b => ({ key: b.key, label: b.label, count: counts[b.key] }));
    return { isAdmin, totalCompleted, buckets } as const;
  }
});

// Top performing agents (by number of resolved or closed tickets)
// Returns up to `limit` agents with their ticket counts and basic profile info.
export const topAgents = query({
  args: {
    project: v.optional(v.string()),
    team: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const authId = identity?.subject ?? null;

    // Determine admin privileges
    let me: { roles?: string[] } | null = null;
    if (authId) {
      me = await ctx.db
        .query("users")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", authId))
        .first();
    }
    const roles = (me?.roles ?? []).map((r) => r.toLowerCase());
    const isAdmin = roles.includes("admin");

    // Fetch a capped set of tickets (similar caps to other stats queries)
    let qb = ctx.db.query("tickets");
    if (args.project) qb = qb.filter(f => f.eq(f.field("project"), args.project!));
    if (args.team && args.team !== 'all') qb = qb.filter(f => f.eq(f.field("assignedToGroup"), args.team!));
    const tickets = await qb.take(3000);

    const projectSet = buildProjectSet(me as ScopeUser | null, isAdmin);

    const counts: Record<string, { total: number; closed: number }> = {};

    for (const t of tickets as Array<Record<string, unknown>>) {
      const assignedUser = typeof t.assignedToUser === 'string' ? t.assignedToUser : undefined;
      if (!assignedUser) continue;
      if (!canSeeTicket(t as ScopeTicket, authId, isAdmin, projectSet)) continue;
      const status = typeof t.status === 'string' ? t.status : undefined;
      if (!counts[assignedUser]) counts[assignedUser] = { total: 0, closed: 0 };
      counts[assignedUser].total += 1;
      if (status === 'resolved' || status === 'closed') counts[assignedUser].closed += 1;
    }

    // Rank primarily by closed (resolved/closed) then by total as a tiebreaker
    const ranking = Object.entries(counts)
      .map(([userId, c]) => ({ userId, closed: c.closed, total: c.total }))
      .filter(r => r.closed > 0)
      .sort((a, b) => {
        if (b.closed !== a.closed) return b.closed - a.closed;
        return b.total - a.total;
      });

    const limit = Math.max(1, Math.min(10, args.limit ?? 3));
    const top = ranking.slice(0, limit);

    // Fetch user profiles
    const results: Array<{ userId: string; name: string; image?: string; closed: number; total: number; initials: string }> = [];
    type AnyUser = { name?: string; displayName?: string; email?: string; image?: string } | null;
    for (const r of top) {
      const user = await ctx.db
        .query('users')
        .withIndex('by_authUserId', q => q.eq('authUserId', r.userId))
        .first() as AnyUser;
      const name = (user?.name && typeof user.name === 'string' && user.name)
        || (user?.displayName && typeof user.displayName === 'string' && user.displayName)
        || (user?.email && typeof user.email === 'string' && user.email.split('@')[0])
        || r.userId.slice(0, 6);
      const image = user?.image && typeof user.image === 'string' ? user.image : undefined;
  const initials = name.split(/\s+/).map((p: string) => p[0] ?? '').join('').slice(0, 2).toUpperCase();
      results.push({ userId: r.userId, name, image, closed: r.closed, total: r.total, initials });
    }

    return { isAdmin, agents: results } as const;
  }
});

// Detailed ticket report with filtering & date range
export const ticketReport = query({
  args: {
    project: v.optional(v.string()),
    team: v.optional(v.string()),
    days: v.optional(v.number()), // last N days window
    limit: v.optional(v.number()), // safety cap
    start: v.optional(v.number()),
    end: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const authId = identity?.subject ?? null;
    let me: { roles?: string[] } | null = null;
    if (authId) {
      me = await ctx.db.query('users').withIndex('by_authUserId', q => q.eq('authUserId', authId)).first();
    }
    const roles = (me?.roles ?? []).map(r => r.toLowerCase());
    const isAdmin = roles.includes('admin');

  const currentTime = Date.now();
  let start = currentTime - Math.max(1, Math.min(365, args.days ?? 30)) * 24 * 60 * 60 * 1000;
  let endTime = currentTime;
  if (args.start && args.end) {
    const spanLimit = 366 * 24 * 60 * 60 * 1000;
    start = args.start;
    endTime = Math.min(args.end, args.start + spanLimit);
  }

    let qb = ctx.db.query('tickets');
    if (args.project) qb = qb.filter(f => f.eq(f.field('project'), args.project!));
    if (args.team && args.team !== 'all') qb = qb.filter(f => f.eq(f.field('assignedToGroup'), args.team!));
    const raw = await qb.take(Math.min(2000, Math.max(100, args.limit ?? 500)));

    const projectSet = buildProjectSet(me as ScopeUser | null, isAdmin);

  interface TicketRowBase { ticketId: string; title: string; status: string; priority: string; project?: string; assignedToGroup?: string; assignedToUser?: string; createdAt: number; updatedAt: number; turnaroundMs?: number; }
    interface RawTicket {
      ticketId?: string; title?: string; status?: string; priority?: string; project?: string; assignedToGroup?: string; assignedToUser?: string; createdAt?: number; _creationTime?: number; updatedAt?: number;
    }
  const rows: Array<Record<string, unknown>> = [];
  const closedStatuses = new Set(["resolved", "closed"]);
  const candidateTickets: Array<{ t: TicketRowBase; createdAt: number }> = [];
    for (const t of raw as Array<Record<string, unknown>>) {
      const createdAt = typeof t.createdAt === 'number' ? t.createdAt : typeof t._creationTime === 'number' ? (t._creationTime as number) : undefined;
  if (!createdAt || createdAt < start || createdAt > endTime) continue;
      if (!canSeeTicket(t as ScopeTicket, authId, isAdmin, projectSet)) continue;
      const rt = t as RawTicket;
      const rec: TicketRowBase = {
        ticketId: String(rt.ticketId ?? ''),
        title: String(rt.title ?? ''),
        status: String(rt.status ?? ''),
        priority: String(rt.priority ?? ''),
        project: rt.project,
        assignedToGroup: rt.assignedToGroup,
        assignedToUser: rt.assignedToUser,
        createdAt,
        updatedAt: typeof rt.updatedAt === 'number' ? rt.updatedAt : createdAt,
      };
      if (rec.status === 'resolved' || rec.status === 'closed') {
        const diff = rec.updatedAt - rec.createdAt;
        if (diff >= 0) rec.turnaroundMs = diff;
      }
      rows.push({ ...rec });
      if (closedStatuses.has(String(t.status))) {
        candidateTickets.push({ t: rec, createdAt });
      }
    }

    // Derive completedBy + assignment/effort data
    const completedByMap: Record<string, string | undefined> = {};
    const autoRaiseInfo: Record<string, { count: number }> = {};
    const lastAssignedByMap: Record<string, string | undefined> = {};
    const workDurationsMap: Record<string, Record<string, number>> = {};

    function parseAssignee(details?: string): string | undefined {
      if (!details) return undefined;
      try {
        const obj: unknown = JSON.parse(details);
        if (obj && typeof obj === 'object') {
          const maybeTo = (obj as { to?: unknown }).to;
          if (typeof maybeTo === 'string') return maybeTo;
          const maybeAssigned = (obj as { assignedToUser?: unknown }).assignedToUser;
          if (typeof maybeAssigned === 'string') return maybeAssigned;
        }
      } catch { /* not json */ }
      const m = details.match(/to[:\s]+([A-Za-z0-9_-]{4,})/i);
      if (m) return m[1];
      const arrow = details.match(/->\s*([A-Za-z0-9_-]{4,})/);
      if (arrow) return arrow[1];
      return undefined;
    }

    function accumulateWork(ticketId: string, events: Array<{ type: string; details?: string; actorId?: string; _creationTime?: number }>, createdAt: number, updatedAt: number, finalAssignee?: string) {
      // Build chronological assignment segments
      const durations: Record<string, number> = {};
      let currentAssignee: string | undefined = undefined;
      let segmentStart = createdAt;
      for (const ev of events) {
        if (ev.type === 'assigned') {
          const newAssignee = parseAssignee(ev.details);
          if (newAssignee) {
            // close previous segment
            if (currentAssignee && typeof ev._creationTime === 'number') {
              const dur = Math.max(0, (ev._creationTime as number) - segmentStart);
              durations[currentAssignee] = (durations[currentAssignee] || 0) + dur;
              segmentStart = ev._creationTime as number;
            } else if (!currentAssignee && typeof ev._creationTime === 'number') {
              segmentStart = ev._creationTime as number; // start counting from assignment time
            }
            currentAssignee = newAssignee;
            lastAssignedByMap[ticketId] = ev.actorId as string | undefined;
          }
        }
      }
      const endTime = updatedAt; // if open we earlier set updatedAt to now or last update
      if (currentAssignee) {
        const dur = Math.max(0, endTime - segmentStart);
        durations[currentAssignee] = (durations[currentAssignee] || 0) + dur;
      } else if (finalAssignee) {
        // No assignment events but we have a current assignee – allocate whole window
        const dur = Math.max(0, endTime - createdAt);
        durations[finalAssignee] = (durations[finalAssignee] || 0) + dur;
      }
      if (Object.keys(durations).length) workDurationsMap[ticketId] = durations;
    }
    for (const { t } of candidateTickets) {
      try {
        const events = await ctx.db.query('ticket_events').withIndex('by_ticketId', q => q.eq('ticketId', t.ticketId)).take(140) as Array<{ type: string; details?: string; actorId?: string; _creationTime?: number }>;
        events.sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0));
        for (const ev of events) {
          if (ev.type === 'status_changed' && typeof ev.details === 'string') {
            const d = ev.details.toLowerCase();
            if (d.includes('resolved') || d.includes('closed')) {
              completedByMap[t.ticketId as string] = ev.actorId as string | undefined;
              break;
            }
          }
        }
        accumulateWork(t.ticketId, events, t.createdAt, t.updatedAt, t.assignedToUser);
      } catch {
        /* ignore */
      }
    }

    // For all tickets (including open), detect auto priority raises (lightweight scan) & collect assignment for open tickets missing data
    for (const r of rows as Array<Record<string, unknown>>) {
      try {
        const events = await ctx.db.query('ticket_events').withIndex('by_ticketId', q => q.eq('ticketId', r.ticketId as string)).order('desc').take(40) as Array<{ type: string; details?: string; actorId?: string; _creationTime?: number }>; 
        let count = 0;
        for (const ev of events) { if (ev.type === 'priority_auto_raised') count++; }
        if (count > 0) autoRaiseInfo[r.ticketId as string] = { count };
        // If no work durations computed yet (open or not in candidate set) compute from ascending copy
        if (!workDurationsMap[r.ticketId as string]) {
          const asc = [...events].sort((a,b)=>(a._creationTime ?? 0)-(b._creationTime ?? 0));
          accumulateWork(r.ticketId as string, asc, r.createdAt as number, r.updatedAt as number, r.assignedToUser as string | undefined);
        }
      } catch { /* ignore */ }
    }

    // Collect all user ids we need names for
    const userIds = new Set<string>();
    for (const r of rows) {
      if (r.assignedToUser) userIds.add(String(r.assignedToUser));
      const cb = completedByMap[r.ticketId as string];
      if (cb) userIds.add(cb);
      if (typeof (r as any).createdBy === 'string') userIds.add(String((r as any).createdBy)); // eslint-disable-line @typescript-eslint/no-explicit-any
      const lab = lastAssignedByMap[r.ticketId as string]; if (lab) userIds.add(lab);
      const wd = workDurationsMap[r.ticketId as string]; if (wd) for (const u of Object.keys(wd)) userIds.add(u);
    }
    const userNameCache: Record<string, { name: string }> = {};
    for (const uid of userIds) {
      const u = await ctx.db.query('users').withIndex('by_authUserId', q => q.eq('authUserId', uid)).first();
      if (u) {
        const name = (u.name && typeof u.name === 'string' && u.name)
          || (u.email && typeof u.email === 'string' && u.email.split('@')[0])
          || uid.slice(0, 6);
        userNameCache[uid] = { name };
      }
    }
    // Attach names & completedBy
    for (const r of rows as Array<Record<string, unknown>>) {
      const ticketId = r.ticketId as string;
      const assignedId = r.assignedToUser as (string | undefined);
      const completedId = completedByMap[ticketId];
      if (assignedId && userNameCache[assignedId]) {
        (r as Record<string, unknown>).assignedToUserName = userNameCache[assignedId].name;
      }
      if (completedId && userNameCache[completedId]) {
        (r as Record<string, unknown>).completedByUserId = completedId;
        (r as Record<string, unknown>).completedByUserName = userNameCache[completedId].name;
      }
      if (autoRaiseInfo[ticketId]) {
        (r as Record<string, unknown>).autoRaisedCount = autoRaiseInfo[ticketId].count;
      }
      const createdBy = (raw.find(x=> (x as any).ticketId === ticketId) as any)?.createdBy; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (createdBy && userNameCache[createdBy]) {
        (r as Record<string, unknown>).createdByUserId = createdBy;
        (r as Record<string, unknown>).createdByUserName = userNameCache[createdBy].name;
      }
      const lab = lastAssignedByMap[ticketId];
      if (lab && userNameCache[lab]) {
        (r as Record<string, unknown>).lastAssignedByUserId = lab;
        (r as Record<string, unknown>).lastAssignedByUserName = userNameCache[lab].name;
      }
      const wd = workDurationsMap[ticketId];
      if (wd) {
        const segments = Object.entries(wd).map(([userId, ms]) => ({ userId, ms, name: userNameCache[userId]?.name || userId.slice(0,6) }));
        (r as Record<string, unknown>).workDurations = segments;
        (r as Record<string, unknown>).workSummary = segments
          .sort((a,b)=>b.ms - a.ms)
          .slice(0,3)
          .map(s => `${s.name} ${Math.round(s.ms/3600000) ? Math.round(s.ms/3600000)+'h' : Math.max(1,Math.round(s.ms/60000))+'m'}`)
          .join(', ');
      }
    }

    return { isAdmin, count: rows.length, rows, start, end: endTime } as const;
  }
});

// Admin-only supplemental dashboard metrics (SLA & escalation visibility)
export const adminDashboardExtras = query({
  args: { project: v.optional(v.string()), team: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const authId = identity?.subject ?? null;
    if (!authId) return null;
    const me = await ctx.db
      .query('users')
      .withIndex('by_authUserId', q => q.eq('authUserId', authId))
      .first() as { roles?: string[] } | null;
    const roles = (me?.roles ?? []).map(r => r.toLowerCase());
    const isAdmin = roles.includes('admin');
    if (!isAdmin) return null; // hide entirely for non-admins

    let qb = ctx.db.query('tickets');
    if (args.project) qb = qb.filter(f => f.eq(f.field('project'), args.project!));
    if (args.team && args.team !== 'all') qb = qb.filter(f => f.eq(f.field('assignedToGroup'), args.team!));
    const now = Date.now();
    const tickets = await qb.take(3000); // soft cap

    const openByPriority: Record<'P0'|'P1'|'P2'|'P3', number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    let slaBreaches = 0;
    let escalated = 0;
    let autoRaised = 0; // approximate using lastEscalationLevel > 0
    let turnaroundSum = 0;
    let turnaroundSample = 0;
    let activeOpen = 0; // open + in_progress + escalated

    for (const t of tickets as Array<Record<string, unknown>>) {
      const status = t.status as string | undefined;
      const priority = t.priority as ('P0'|'P1'|'P2'|'P3'|undefined);
      const isActive = status === 'open' || status === 'in_progress' || status === 'escalated';
      if (isActive && priority && openByPriority[priority] !== undefined) openByPriority[priority]++;
      if (isActive) activeOpen++;
      const dueAt = t.dueAt as number | undefined;
      if (dueAt && dueAt < now && (status !== 'resolved' && status !== 'closed')) slaBreaches++;
      if (status === 'escalated') escalated++;
      const lastEscalationLevel = typeof t.lastEscalationLevel === 'number' ? (t.lastEscalationLevel as number) : 0;
      if (lastEscalationLevel > 0) autoRaised++;
      if (status === 'resolved' || status === 'closed') {
        const createdAt = typeof t.createdAt === 'number' ? t.createdAt : typeof (t as any)._creationTime === 'number' ? (t as any)._creationTime as number : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
        const updatedAt = typeof t.updatedAt === 'number' ? t.updatedAt : createdAt;
        if (createdAt && updatedAt && updatedAt >= createdAt) {
          turnaroundSum += (updatedAt - createdAt);
          turnaroundSample++;
        }
      }
    }

    const avgTurnaroundMs = turnaroundSample ? Math.round(turnaroundSum / turnaroundSample) : 0;
    // Trend windows (last 7 days vs previous 7 days) using events & ticket updates
    const windowMs = 7 * 24 * 60 * 60 * 1000;
    const currentStart = now - windowMs;
    const previousStart = now - 2 * windowMs;
    const previousEnd = currentStart;

    // Collect ticket_events for last 14 days
    const recentEvents = await ctx.db.query('ticket_events').order('desc').take(5000) as Array<Record<string, unknown>>;
    let escalatedCurrent = 0, escalatedPrevious = 0;
    let autoRaisedCurrent = 0, autoRaisedPrevious = 0;
    for (const ev of recentEvents) {
      const ts = typeof (ev as any)._creationTime === 'number' ? (ev as any)._creationTime as number : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!ts || ts < previousStart) break; // events ordered desc
      const type = ev.type as string | undefined;
      if (!type) continue;
      const inCurrent = ts >= currentStart && ts <= now;
      const inPrevious = ts >= previousStart && ts < previousEnd;
      if (type === 'escalated') {
        if (inCurrent) escalatedCurrent++; else if (inPrevious) escalatedPrevious++;
      } else if (type === 'priority_auto_raised') {
        if (inCurrent) autoRaisedCurrent++; else if (inPrevious) autoRaisedPrevious++;
      }
    }

    // Turnaround trend (tickets resolved/closed in each window)
    let turnaroundCurrentSum = 0, turnaroundCurrentSample = 0;
    let turnaroundPreviousSum = 0, turnaroundPreviousSample = 0;
    for (const t of tickets as Array<Record<string, unknown>>) {
      const status = t.status as string | undefined;
      if (status !== 'resolved' && status !== 'closed') continue;
      const updatedAt = typeof t.updatedAt === 'number' ? t.updatedAt : undefined;
      const createdAt = typeof t.createdAt === 'number' ? t.createdAt : typeof (t as any)._creationTime === 'number' ? (t as any)._creationTime as number : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!createdAt || !updatedAt || updatedAt < createdAt) continue;
      const delta = updatedAt - createdAt;
      if (updatedAt >= currentStart && updatedAt <= now) {
        turnaroundCurrentSum += delta; turnaroundCurrentSample++;
      } else if (updatedAt >= previousStart && updatedAt < previousEnd) {
        turnaroundPreviousSum += delta; turnaroundPreviousSample++;
      }
    }
    const avgTurnaroundCurrent = turnaroundCurrentSample ? Math.round(turnaroundCurrentSum / turnaroundCurrentSample) : 0;
    const avgTurnaroundPrevious = turnaroundPreviousSample ? Math.round(turnaroundPreviousSum / turnaroundPreviousSample) : 0;

    const autoRaisedPercent = activeOpen ? Math.round((autoRaised / activeOpen) * 100) : 0;

    return {
      openByPriority,
      slaBreaches,
      escalated,
      autoRaised,
      autoRaisedPercent,
      avgTurnaroundMs,
      avgTurnaroundSample: turnaroundSample,
      trend: {
        escalated: { current: escalatedCurrent, previous: escalatedPrevious },
        autoRaised: { current: autoRaisedCurrent, previous: autoRaisedPrevious },
        turnaroundMs: { currentAvg: avgTurnaroundCurrent, previousAvg: avgTurnaroundPrevious }
      }
    } as const;
  }
});

// User (non-admin) dashboard extras: personal average turnaround for their tickets
export const userDashboardExtras = query({
  args: { project: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const authId = identity?.subject ?? null;
    if (!authId) return null;
    // Basic user record (for potential project membership) - not strictly needed here
    let qb = ctx.db.query('tickets');
    if (args.project) qb = qb.filter(f => f.eq(f.field('project'), args.project!));
    const tickets = await qb.take(2000);
    let turnaroundSum = 0, sample = 0;
    for (const t of tickets as Array<Record<string, unknown>>) {
      const status = t.status as string | undefined;
      if (status !== 'resolved' && status !== 'closed') continue;
      const assigned = t.assignedToUser === authId;
      const created = t.createdBy === authId;
      if (!assigned && !created) continue;
      const createdAt = typeof t.createdAt === 'number' ? t.createdAt : typeof (t as any)._creationTime === 'number' ? (t as any)._creationTime as number : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
      const updatedAt = typeof t.updatedAt === 'number' ? t.updatedAt : createdAt;
      if (!createdAt || !updatedAt || updatedAt < createdAt) continue;
      turnaroundSum += (updatedAt - createdAt);
      sample++;
    }
    const avgTurnaroundMs = sample ? Math.round(turnaroundSum / sample) : 0;
    return { avgTurnaroundMs, sample } as const;
  }
});

// Create an ephemeral shareable report snapshot
export const createSharedReport = mutation({
  args: {
    project: v.optional(v.string()),
    team: v.optional(v.string()),
    days: v.optional(v.number()),
    ttlMinutes: v.optional(v.number()), // default 60
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    statuses: v.optional(v.array(v.string())),
    priorities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const ttlMinutes = Math.max(5, Math.min(240, args.ttlMinutes ?? 60));

    // Re-run subset of ticketReport logic (can't call handler directly)
    const now = Date.now();
    let start = now - Math.max(1, Math.min(365, args.days ?? 30)) * 24 * 60 * 60 * 1000;
    let endTime = now;
    if (args.start && args.end) {
      const spanLimit = 366 * 24 * 60 * 60 * 1000;
      start = args.start;
      endTime = Math.min(args.end, args.start + spanLimit);
    }
  let qb = ctx.db.query('tickets');
  if (args.project) qb = qb.filter(f => f.eq(f.field('project'), args.project!));
  if (args.team && args.team !== 'all') qb = qb.filter(f => f.eq(f.field('assignedToGroup'), args.team!));
  // Pull capped set first, then apply status/priority filters (Convex doesn't support OR lists easily inline)
  const raw = await qb.take(1500);
  interface TicketRowBase { ticketId: string; title: string; status: string; priority: string; project?: string; assignedToGroup?: string; assignedToUser?: string; createdAt: number; updatedAt: number; turnaroundMs?: number; }
  const rows: Array<Record<string, unknown>> = [];
  const closedStatuses = new Set(["resolved", "closed"]);
  const candidateTickets: Array<TicketRowBase> = [];
    const statusSet = args.statuses && args.statuses.length ? new Set(args.statuses) : null;
    const prioritySet = args.priorities && args.priorities.length ? new Set(args.priorities) : null;
    for (const t of raw as Array<Record<string, unknown>>) {
      const createdAt = typeof t.createdAt === 'number' ? t.createdAt : typeof t._creationTime === 'number' ? (t._creationTime as number) : undefined;
  if (!createdAt || createdAt < start || createdAt > endTime) continue;
      if (statusSet && !statusSet.has(String(t.status))) continue;
      if (prioritySet && !prioritySet.has(String(t.priority))) continue;
  const updatedAt: number = typeof t.updatedAt === 'number' ? t.updatedAt : createdAt;
  const turnaroundMs = (t.status === 'resolved' || t.status === 'closed') && typeof updatedAt === 'number' && typeof createdAt === 'number' && updatedAt >= createdAt ? (updatedAt - createdAt) : undefined;
      rows.push({
        ticketId: t.ticketId,
        title: t.title,
        status: t.status,
        priority: t.priority,
        project: t.project,
        assignedToGroup: t.assignedToGroup,
        assignedToUser: t.assignedToUser,
        createdAt,
        updatedAt,
        turnaroundMs,
      });
  if (closedStatuses.has(String(t.status))) candidateTickets.push(t as unknown as TicketRowBase);
    }
    // Completed by enrichment (same logic as ticketReport)
    const completedByMap: Record<string, string | undefined> = {};
    const autoRaiseInfo: Record<string, { count: number }> = {};
    for (const t of candidateTickets) {
      try {
  const events = await ctx.db.query('ticket_events').withIndex('by_ticketId', q => q.eq('ticketId', t.ticketId)).take(100) as Array<{ type: string; details?: string; actorId?: string; _creationTime?: number }>;
  events.sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0));
        for (const ev of events as Array<{ type: string; details?: string; actorId?: string; _creationTime?: number }>) {
          if (ev.type === 'status_changed' && typeof ev.details === 'string') {
            const d = ev.details.toLowerCase();
            if (d.includes('resolved') || d.includes('closed')) {
              completedByMap[t.ticketId as string] = ev.actorId as string | undefined;
              break;
            }
          }
        }
      } catch { /* ignore */ }
    }
    // Auto raise detection for all snapshot rows
    for (const r of rows as Array<Record<string, unknown>>) {
      try {
        const events = await ctx.db.query('ticket_events').withIndex('by_ticketId', q => q.eq('ticketId', r.ticketId as string)).order('desc').take(30) as Array<{ type: string }>; 
        let count = 0; for (const ev of events) if (ev.type === 'priority_auto_raised') count++;
        if (count > 0) autoRaiseInfo[r.ticketId as string] = { count };
      } catch {}
    }
    const userIds = new Set<string>();
    for (const r of rows) {
      if (r.assignedToUser) userIds.add(String(r.assignedToUser));
      const cb = completedByMap[r.ticketId as string];
      if (cb) userIds.add(cb);
    }
    const userNameCache: Record<string, { name: string }> = {};
    for (const uid of userIds) {
      const u = await ctx.db.query('users').withIndex('by_authUserId', q => q.eq('authUserId', uid)).first();
      if (u) {
        const name = (u.name && typeof u.name === 'string' && u.name)
          || (u.email && typeof u.email === 'string' && u.email.split('@')[0])
          || uid.slice(0, 6);
        userNameCache[uid] = { name };
      }
    }
    for (const r of rows as Array<Record<string, unknown>>) {
      const ticketId = r.ticketId as string;
      const assignedId = r.assignedToUser as (string | undefined);
      const completedId = completedByMap[ticketId];
      if (assignedId && userNameCache[assignedId]) r.assignedToUserName = userNameCache[assignedId].name;
      if (completedId && userNameCache[completedId]) {
        r.completedByUserId = completedId;
        r.completedByUserName = userNameCache[completedId].name;
      }
      if (autoRaiseInfo[ticketId]) {
        r.autoRaisedCount = autoRaiseInfo[ticketId].count;
      }
    }
    const report = { count: rows.length, rows, start, end: endTime };

    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    const nowTs = Date.now();
    const expiresAt = nowTs + ttlMinutes * 60 * 1000;
    await ctx.db.insert('shared_reports', {
      token,
  params: { project: args.project, team: args.team, days: args.days, start: args.start, end: args.end, statuses: args.statuses, priorities: args.priorities },
      data: report,
      createdAt: nowTs,
      expiresAt,
    });
    return { token, expiresAt } as const;
  }
});

// Public retrieval of a shared report snapshot (no auth required)
export const getSharedReport = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('shared_reports').withIndex('by_token', q => q.eq('token', args.token)).first();
    if (!rows) return { expired: true } as const;
    if (rows.expiresAt < Date.now()) return { expired: true } as const;
    return { expired: false, report: rows.data, params: rows.params, expiresAt: rows.expiresAt } as const;
  }
});
