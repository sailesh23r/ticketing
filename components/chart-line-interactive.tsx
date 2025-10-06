"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"
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
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DateRangePicker, DateRangeValue } from "@/components/date-range-picker"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

export const description = "Ticket statuses over time (line)"

// Mirror the area chart config but using lines.
const chartConfig = {
  open: { label: "Open", color: "var(--newTickets)" },
  in_progress: { label: "In progress", color: "var(--inprogress)" },
  resolved: { label: "Resolved", color: "var(--resolvedTickets)" },
  closed: { label: "Closed", color: "var(--closedTickets)" },
  escalated: { label: "Escalated", color: "var(--pendingResponse)" },
} satisfies ChartConfig

interface ChartLineInteractiveProps {
  team?: string;
  project?: string;
  days?: number;
  start?: number;
  end?: number;
  hideControls?: boolean;
}

export function ChartLineInteractive(props: ChartLineInteractiveProps = {}) {
  // Shared filters from the area chart
  const [timeRange, setTimeRange] = useState("7d")
  const [showCustom, setShowCustom] = useState(false)
  const [range, setRange] = useState<DateRangeValue>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);
    return { start, end };
  })
  const [localTeam, setLocalTeam] = useState<string | undefined>(undefined)
  const [localProject, setLocalProject] = useState<string | undefined>(undefined)
  const effectiveTeam = props.team !== undefined ? props.team : localTeam
  const effectiveProject = props.project !== undefined ? props.project : localProject
  const days = props.days ?? (timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 7)
  const startParam = timeRange === 'custom' ? range.start.getTime() : undefined
  const endParam = timeRange === 'custom' ? range.end.getTime() : undefined

  React.useEffect(() => {
    if (timeRange === 'custom') {
      setShowCustom(true)
    } else {
      setShowCustom(false)
    }
  }, [timeRange])

  function rangeLabel() {
    if (timeRange !== 'custom') return 'Custom Range'
    return `${range.start.toLocaleDateString()} - ${range.end.toLocaleDateString()}`
  }

  // Convex queries (reuse same endpoints as area chart)
  const series = useQuery(api.stats.ticketStatsSeries, { days, team: effectiveTeam, project: effectiveProject, start: props.start ?? startParam, end: props.end ?? endParam }) as | { isAdmin: boolean; points: Array<{ date: string; open: number; in_progress: number; resolved: number; closed: number; escalated: number }>; start?: number; end?: number } | undefined
  const totals = useQuery(api.stats.ticketStats, { project: effectiveProject, team: effectiveTeam }) as | { isAdmin: boolean; totals: { total: number; open: number; in_progress: number; resolved: number; closed: number; escalated: number }; mine: { assignedToMe: number; openAssigned: number; inProgressAssigned: number; resolvedByMe: number; closedByMe: number } } | undefined
  const teams = useQuery(api.stats.listTeams, {}) as string[] | undefined
  const projects = useQuery(api.stats.listProjects, {}) as Array<{ slug: string; name: string }> | undefined

  const filteredData = series?.points ?? []

  // Build badges similar to area chart for consistency.
  const statusBadges = useMemo(() => {
    if (!totals) return null
    if (totals.isAdmin) {
      return [
        { label: 'Open', value: totals.totals.open },
        { label: 'In progress', value: totals.totals.in_progress },
        { label: 'Resolved', value: totals.totals.resolved },
        { label: 'Closed', value: totals.totals.closed },
        { label: 'Escalated', value: totals.totals.escalated },
      ]
    }
    return [
      { label: 'Assigned', value: totals.mine.assignedToMe },
      { label: 'Open (mine)', value: totals.mine.openAssigned },
      { label: 'In progress (mine)', value: totals.mine.inProgressAssigned },
      { label: 'Resolved by me', value: totals.mine.resolvedByMe },
      { label: 'Closed by me', value: totals.mine.closedByMe },
    ]
  }, [totals])

  return (
    <Card className="pt-0">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>Tickets status trends</CardTitle>
          <CardDescription>Line visualization of ticket statuses over time</CardDescription>
        </div>
  <div className="flex items-center gap-2 flex-wrap">
          {!props.hideControls && (
          <Select value={effectiveTeam ?? 'all'} onValueChange={(v) => (props.team !== undefined ? undefined : setLocalTeam(v === 'all' ? undefined : v))}>
            <SelectTrigger size="sm" className="hidden w-[160px] rounded-lg sm:flex" aria-label="Team">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="rounded-lg">All teams</SelectItem>
              {(teams ?? []).map((t) => (
                <SelectItem key={t} value={t} className="rounded-lg">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          )}
          {!props.hideControls && (
          <Select value={effectiveProject ?? 'all'} onValueChange={(v) => (props.project !== undefined ? undefined : setLocalProject(v === 'all' ? undefined : v))}>
            <SelectTrigger size="sm" className="hidden w-[180px] rounded-lg sm:flex" aria-label="Project">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="rounded-lg">All projects</SelectItem>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.slug} value={p.slug} className="rounded-lg">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          )}
          {!props.hideControls && (
          <Select value={timeRange} onValueChange={(v) => { setTimeRange(v); }}>
            <SelectTrigger size="sm" className="hidden w-[160px] rounded-lg sm:ml-auto sm:flex" aria-label="Select a value">
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="7d" className="rounded-lg">Last 7 days</SelectItem>
              <SelectItem value="30d" className="rounded-lg">Last 30 days</SelectItem>
              <SelectItem value="90d" className="rounded-lg">Last 3 months</SelectItem>
              <SelectItem value="custom" className="rounded-lg">Custom range</SelectItem>
            </SelectContent>
          </Select>
          )}
          {!props.hideControls && (
          <Popover open={showCustom} onOpenChange={(o) => { setShowCustom(o); if (o) setTimeRange('custom'); }}>
            <PopoverTrigger asChild>
              <Button variant={showCustom ? 'secondary' : 'outline'} size="sm" className="max-w-[240px] truncate">
                {rangeLabel()}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <DateRangePicker value={range} onChange={setRange} />
            </PopoverContent>
          </Popover>
          )}
        </div>
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
          <LineChart data={filteredData} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[180px]"
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  }}
                />
              }
            />
            {/* Individual status lines */}
            <Line dataKey="open" type="monotone" stroke="var(--newTickets)" strokeWidth={2} dot={false} />
            <Line dataKey="in_progress" type="monotone" stroke="var(--inprogress)" strokeWidth={2} dot={false} />
            <Line dataKey="resolved" type="monotone" stroke="var(--resolvedTickets)" strokeWidth={2} dot={false} />
            <Line dataKey="closed" type="monotone" stroke="var(--closedTickets)" strokeWidth={2} dot={false} />
            <Line dataKey="escalated" type="monotone" stroke="var(--pendingResponse)" strokeWidth={2} dot={false} />
            <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
