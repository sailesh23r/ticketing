"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

function StatCard({ label, value, suffix }: { label: string; value: React.ReactNode; suffix?: string }) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
          {suffix ? <span className="ml-1 text-base font-normal text-muted-foreground">{suffix}</span> : null}
        </CardTitle>
        <CardAction />
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="text-muted-foreground">Updated just now</div>
      </CardFooter>
    </Card>
  )
}

export function SectionCards() {
  // Role-aware ticket stats
  const stats = useQuery(api.stats.ticketStats, {}) as
    | {
        isAdmin: boolean
        totals: { total: number; open: number; in_progress: number; resolved: number; closed: number; escalated: number }
        mine: { assignedToMe: number; openAssigned: number; inProgressAssigned: number; resolvedByMe: number; closedByMe: number }
      }
    | undefined

  const isAdmin = !!stats?.isAdmin

  // Admin-only datasets (lazy load once we know admin)
  type UserRow = { _id: string; authUserId: string; email?: string; name?: string; roles: string[] }
  const users = useQuery(api.users.listAll, isAdmin ? {} : "skip") as UserRow[] | undefined
  const teams = useQuery(api.stats.listTeams, isAdmin ? {} : "skip") as string[] | undefined
  const projects = useQuery(api.stats.listProjects, isAdmin ? {} : "skip") as Array<{ slug: string; name: string }> | undefined

  const loadingValue = "—"

  if (!stats) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 @xl/main:grid-cols-4 @5xl/main:grid-cols-4">
        <StatCard label="Loading" value={loadingValue} />
        <StatCard label="Loading" value={loadingValue} />
        <StatCard label="Loading" value={loadingValue} />
        <StatCard label="Loading" value={loadingValue} />
      </div>
    )
  }

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs  md:grid-cols-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {isAdmin ? (
        <>
          <StatCard label="Total Tickets" value={stats?.totals.total ?? loadingValue} />
          <StatCard label="Users" value={users?.length ?? loadingValue} />
          <StatCard label="Projects" value={projects?.length ?? loadingValue} />
          <StatCard label="Teams" value={teams?.length ?? loadingValue} />
        </>
      ) : (
        <>
          <StatCard label="Assigned to Me" value={stats?.mine.assignedToMe ?? 0} />
          <StatCard label="Open Assigned" value={stats?.mine.openAssigned ?? 0} />
          <StatCard label="In Progress" value={stats?.mine.inProgressAssigned ?? 0} />
          <StatCard label="Resolved by Me" value={stats?.mine.resolvedByMe ?? 0} />
        </>
      )}
    </div>
  )
}
