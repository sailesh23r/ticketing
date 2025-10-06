"use client"

import * as React from "react"
import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const description = "An interactive area chart"

// Data loaded from Convex stats series; five series mapped to statuses

const chartConfig = {
  visitors: { label: "Tickets" },
  open: { label: "Open", color: "var(--chart-1)" },
  in_progress: { label: "In progress", color: "var(--chart-2)" },
  resolved: { label: "Resolved", color: "var(--chart-3)" },
  closed: { label: "Closed", color: "var(--chart-4)" },
  escalated: { label: "Escalated", color: "var(--chart-5)" },
} satisfies ChartConfig

interface ChartAreaInteractiveProps {
  team?: string;
  project?: string;
  days?: number; // override internal timeRange days
  start?: number; // (reserved for future use if backend supports date bounding)
  end?: number;
  hideControls?: boolean;
}

export function ChartAreaInteractive(props: ChartAreaInteractiveProps = {}) {
  const [timeRange, setTimeRange] = useState("7d")
  // Local state only used when external props not provided
  const [localTeam, setLocalTeam] = useState<string | undefined>(undefined)
  const [localProject, setLocalProject] = useState<string | undefined>(undefined)
  const effectiveTeam = props.team !== undefined ? props.team : localTeam
  const effectiveProject = props.project !== undefined ? props.project : localProject
  const derivedDays = props.days ?? (timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90)
  const series = useQuery(api.stats.ticketStatsSeries, { days: derivedDays, team: effectiveTeam, project: effectiveProject, start: props.start, end: props.end }) as | { isAdmin: boolean; points: Array<{ date: string; open: number; in_progress: number; resolved: number; closed: number; escalated: number }> } | undefined
  const totals = useQuery(api.stats.ticketStats, { project: effectiveProject, team: effectiveTeam }) as | { isAdmin: boolean; totals: { total: number; open: number; in_progress: number; resolved: number; closed: number; escalated: number }; mine: { assignedToMe: number; openAssigned: number; inProgressAssigned: number; resolvedByMe: number; closedByMe: number } } | undefined
  const teams = useQuery(api.stats.listTeams, {}) as string[] | undefined
  const projects = useQuery(api.stats.listProjects, {}) as Array<{ slug: string; name: string }> | undefined
  const filteredData = series?.points ?? []

  const statusBadges = useMemo(() => {
    if (!totals) return null
    if (totals.isAdmin) {
      return [
        { label: 'Open', value: totals.totals.open, variant: 'default' as const },
        { label: 'In progress', value: totals.totals.in_progress, variant: 'secondary' as const },
        { label: 'Resolved', value: totals.totals.resolved, variant: 'outline' as const },
        { label: 'Closed', value: totals.totals.closed, variant: 'secondary' as const },
        { label: 'Escalated', value: totals.totals.escalated, variant: 'destructive' as const },
      ]
    }
    return [
      { label: 'Assigned', value: totals.mine.assignedToMe, variant: 'default' as const },
      { label: 'Open (mine)', value: totals.mine.openAssigned, variant: 'secondary' as const },
      { label: 'In progress (mine)', value: totals.mine.inProgressAssigned, variant: 'secondary' as const },
      { label: 'Resolved by me', value: totals.mine.resolvedByMe, variant: 'outline' as const },
      { label: 'Closed by me', value: totals.mine.closedByMe, variant: 'secondary' as const },
    ]
  }, [totals])

  return (
    <Card className="pt-0">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>Tickets status summary</CardTitle>
          <CardDescription>Chart summarizing tickets with various tasks</CardDescription>
        </div>
        {!props.hideControls && (
          <div className="flex items-center gap-2">
            <Select value={effectiveTeam ?? 'all'} onValueChange={(v) => (props.team !== undefined ? undefined : setLocalTeam(v === 'all' ? undefined : v))}>
              <SelectTrigger className="hidden w-[160px] rounded-lg sm:flex" aria-label="Team">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all" className="rounded-lg">All teams</SelectItem>
                {(teams ?? []).map((t) => (
                  <SelectItem key={t} value={t} className="rounded-lg">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={effectiveProject ?? 'all'} onValueChange={(v) => (props.project !== undefined ? undefined : setLocalProject(v === 'all' ? undefined : v))}>
              <SelectTrigger className="hidden w-[180px] rounded-lg sm:flex" aria-label="Project">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all" className="rounded-lg">All projects</SelectItem>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p.slug} value={p.slug} className="rounded-lg">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="hidden w-[160px] rounded-lg sm:ml-auto sm:flex" aria-label="Select a value">
                <SelectValue placeholder="Last 3 months" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="7d" className="rounded-lg">Last 7 days</SelectItem>
                <SelectItem value="30d" className="rounded-lg">Last 30 days</SelectItem>
                <SelectItem value="90d" className="rounded-lg">Last 3 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {statusBadges && (
          <div className="flex flex-wrap gap-2 mb-3">
            {statusBadges.map((b) => (
              <span key={b.label} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
                <span className="text-muted-foreground">{b.label}:</span>
                <span className="font-medium">{b.value}</span>
              </span>
            ))}
          </div>
        )}
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillOpen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--newTickets)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--newTickets)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillInProgress" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--inprogress)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--inprogress)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillResolved" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--resolvedTickets)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--resolvedTickets)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillClosed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--closedTickets)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--closedTickets)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillEscalated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--pendingResponse)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--pendingResponse)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Area dataKey="open" type="natural" fill="url(#fillOpen)" stroke="var(--newTickets)" stackId="a" />
            <Area dataKey="in_progress" type="natural" fill="url(#fillInProgress)" stroke="var(--inprogress)" stackId="a" />
            <Area dataKey="resolved" type="natural" fill="url(#fillResolved)" stroke="var(--resolvedTickets)" stackId="a" />
            <Area dataKey="closed" type="natural" fill="url(#fillClosed)" stroke="var(--closedTickets)" stackId="a" />
            <Area dataKey="escalated" type="natural" fill="url(#fillEscalated)" stroke="var(--pendingResponse)" stackId="a" />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}