"use client";

import { useState, useMemo } from "react";
import Link from 'next/link';
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Progress } from "./ui/progress";

type PriorityKey = "P0" | "P1" | "P2" | "P3";

interface SectionCardsNewProps {
  project?: string;
  team?: string; // future, some queries don't use team yet
  hideControls?: boolean;
  paddings?: string; 
}

export function SectionCardsNew(props: SectionCardsNewProps = {}) {
  const [localProject, setLocalProject] = useState<string | undefined>();
  const projectFilter = props.project !== undefined ? props.project : localProject;
  const [range, setRange] = useState<"7d" | "30d" | "90d">("7d"); // placeholder (future server usage)

  const stats = useQuery(api.stats.ticketStats, { project: projectFilter, team: props.team }) as
    | { isAdmin: boolean; totals: { total: number; open: number; in_progress: number; resolved: number; closed: number; escalated: number }; mine: { assignedToMe: number; openAssigned: number; inProgressAssigned: number; resolvedByMe: number; closedByMe: number } }
    | undefined;
  const userExtras = useQuery(api.stats.userDashboardExtras, { project: projectFilter }) as { avgTurnaroundMs: number; sample: number } | null | undefined;
  const projects = useQuery(api.stats.listProjects, {}) as Array<{ slug: string; name: string }> | undefined;
  const ticketsForPriority = useQuery(api.myFunctions.listTicketsByProject, projectFilter ? { project: projectFilter } : "skip") as Array<{ priority: PriorityKey; status: string }> | undefined;
  const avgResp = useQuery(api.stats.avgResponseTime, { project: projectFilter }) as { averageMs: number; sample: number } | undefined;

  const loading = !stats;
  const isAdmin = stats?.isAdmin;
  const totalTickets = stats?.totals.total ?? 0;
  const resolvedTickets = stats?.totals.resolved ?? 0;
  const resolutionRate = totalTickets ? Math.round((resolvedTickets / totalTickets) * 100) : 0;

  const priorityDist = useMemo(() => {
    const base: Record<PriorityKey, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    if (!ticketsForPriority) return { total: 0, dist: base };
    for (const t of ticketsForPriority) base[t.priority]++;
    const total = ticketsForPriority.length || 1;
    return { total, dist: base };
  }, [ticketsForPriority]);
  const pct = (n: number) => Math.round((n / (priorityDist.total || 1)) * 100);

  function formatDuration(ms: number): string {
    if (!ms) return "—";
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    if (hr > 0) return `${hr}h ${remMin}m`;
    if (min > 0) return `${min}m`;
    return `${sec}s`;
  }
  const avgResponse = avgResp ? formatDuration(avgResp.averageMs) : "…";
  const personalTurnaround = userExtras ? formatDuration(userExtras.avgTurnaroundMs) : "…";

  // Layout columns: admins get extra cards (6 on wide), users fewer.
  const gridCols = isAdmin ? '@5xl/main:grid-cols-4 lg:grid-cols-4' : '@5xl/main:grid-cols-4';

  return (
    <div className={`grid grid-cols-1 gap-4 ${props.paddings ? props.paddings : "px-4 lg:px-6"  }   @xl/main:grid-cols-2 @5xl/main:grid-cols-4 lg:grid-cols-4 ${gridCols}`}>
    

      {/* Total Tickets */}
      <Card className="@container/card bg-primary text-primary-foreground">
        <CardHeader>
            <CardDescription className="mt-2 text-background font-medium text-base">Total Tickets{projectFilter ? ` • ${projectFilter}` : ""}</CardDescription>
            <CardAction>
              <Select value={range} onValueChange={(v: "7d" | "30d" | "90d") => setRange(v)}>
                <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 3 months</SelectItem>
                </SelectContent>
              </Select>
            </CardAction>
        </CardHeader>
        <CardContent>
          {isAdmin && <p className="text-sm font-medium">All active support tickets.</p>}
        </CardContent>
        <CardFooter className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{loading ? "…" : totalTickets}</CardFooter>
      </Card>

      {/* Avg Response Time */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="mt-2 text-foreground font-medium text-base">Average Response Time</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">First non-creator reply latency.</p>
        </CardContent>
        <CardFooter className="text-2xl font-semibold tabular-nums">{avgResponse}</CardFooter>
      </Card>

      {/* Resolution Rate */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="mt-2 text-foreground font-medium text-base">Resolution Rate</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">Resolved tickets ÷ total tickets.</p>
        </CardContent>
        <CardFooter className="text-2xl font-semibold tabular-nums flex items-center gap-2">
          {loading ? "…" : `${resolutionRate}%`}
          <span className="text-muted-foreground text-sm">Resolved</span>
        </CardFooter>
      </Card>

      {/* Priority Distribution */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="mt-2 text-foreground font-medium text-base">Ticket Priority</CardDescription>
          <CardAction>
            {!props.hideControls && (
              <Select value={projectFilter ?? "all"} onValueChange={(v) => (props.project !== undefined ? undefined : setLocalProject(v === "all" ? undefined : v))}>
                <SelectTrigger className="w-[140px]" size="sm"><SelectValue placeholder="All Projects" /></SelectTrigger>
                <SelectContent className="rounded-xl max-h-72">
                  <SelectItem value="all">All Projects</SelectItem>
                  {(projects ?? []).map(p => <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-6 grid-rows-4 items-center gap-y-3 text-sm">
            <span className="col-span-2 font-medium text-red-600">Critical</span>
            <Progress value={pct(priorityDist.dist.P0)} className="w-full col-span-3 [&>div]:bg-red-500" />
            <span className="col-span-1 ml-3 text-muted-foreground">{pct(priorityDist.dist.P0)}%</span>
            <span className="col-span-2 font-medium text-orange-600">High</span>
            <Progress value={pct(priorityDist.dist.P1)} className="w-full col-span-3 [&>div]:bg-orange-500" />
            <span className="col-span-1 ml-3 text-muted-foreground">{pct(priorityDist.dist.P1)}%</span>
            <span className="col-span-2 font-medium text-yellow-600">Medium</span>
            <Progress value={pct(priorityDist.dist.P2)} className="w-full col-span-3 [&>div]:bg-yellow-500" />
            <span className="col-span-1 ml-3 text-muted-foreground">{pct(priorityDist.dist.P2)}%</span>
            <span className="col-span-2 font-medium text-green-600">Low</span>
            <Progress value={pct(priorityDist.dist.P3)} className="w-full col-span-3 [&>div]:bg-green-500" />
            <span className="col-span-1 ml-3 text-muted-foreground">{pct(priorityDist.dist.P3)}%</span>
          </div>
        </CardContent>
      </Card>

      {/* {isAdmin && (
        <Card className="@container/card">
          <CardHeader>
            <CardDescription className="mt-2 text-foreground font-medium text-base">SLA & Escalations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 text-[11px]">
              <div className="flex justify-between" title="Active tickets by priority (open/in progress/escalated)."><span>Open Critical (P0)</span><span className="font-semibold">{adminExtras?.openByPriority.P0 ?? "…"}</span></div>
              <div className="flex justify-between"><span>Open High (P1)</span><span className="font-semibold">{adminExtras?.openByPriority.P1 ?? "…"}</span></div>
              <div className="flex justify-between"><span>Open Medium (P2)</span><span className="font-semibold">{adminExtras?.openByPriority.P2 ?? "…"}</span></div>
              <div className="flex justify-between"><span>Open Low (P3)</span><span className="font-semibold">{adminExtras?.openByPriority.P3 ?? "…"}</span></div>
              <div className="mt-1 flex justify-between text-red-600" title="Past SLA due time."><span>SLA Breaches</span><span className="font-semibold">{adminExtras?.slaBreaches ?? "…"}</span></div>
              <div className="flex justify-between text-rose-600" title="Escalation events (current window vs previous).">
                <span>Escalated</span>
                <span className="font-semibold flex items-center gap-1">{adminExtras?.escalated ?? "…"} {escalatedDelta && <DeltaBadge {...escalatedDelta} />}</span>
              </div>
              <div className="flex justify-between text-orange-600" title="Tickets auto raised by SLA logic.">
                <span>Auto Raised</span>
                <span className="font-semibold flex items-center gap-1">{adminExtras?.autoRaised ?? "…"}{adminExtras && <span className="text-[10px] text-muted-foreground">({adminExtras.autoRaisedPercent}%)</span>} {autoRaisedDelta && <DeltaBadge {...autoRaisedDelta} />}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )} */}

      {/* {isAdmin && (
        <Card className="@container/card">
          <CardHeader>
            <CardDescription className="mt-2 text-foreground font-medium text-base">Avg Turnaround</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs mb-2">Creation → resolution/closure.</p>
            <div className="text-2xl font-semibold tabular-nums flex items-center gap-2">{avgTurnaround} {turnaroundDelta && <DeltaBadge {...turnaroundDelta} />}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Sample: {adminExtras?.avgTurnaroundSample ?? 0}</div>
            <div className="mt-2 text-[11px]"><a href="/reports" className="text-blue-600 hover:underline">View detailed report →</a></div>
          </CardContent>
        </Card>
      )} */}

      {!isAdmin && userExtras && (
        <Card className="@container/card">
          <CardHeader>
            <CardDescription className="mt-2 text-foreground font-medium text-base">My Avg Turnaround</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs mb-2">For tickets you created or are assigned.</p>
            <div className="text-2xl font-semibold tabular-nums">{personalTurnaround}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Sample: {userExtras.sample}</div>
            <div className="mt-2 text-[11px]"><Link href="/reports" className="text-blue-600 hover:underline" aria-label="Open reports page">Open my ticket report →</Link></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// DeltaBadge and trend deltas removed for now (unused in condensed version)
