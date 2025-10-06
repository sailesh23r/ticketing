"use client"

import * as React from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "./ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"

export const description = "A donut chart with text"


export function TopPerformers({ project, team }: { project?: string; team?: string }) {
  const data = useQuery(api.stats.topAgents, { project, team, limit: 3 }) as
    | { isAdmin: boolean; agents: Array<{ userId: string; name: string; image?: string; initials: string; closed: number; total: number }> }
    | undefined;

  const agents = data?.agents || [];

  // Ensure we always show up to 3 slots (for consistent layout)
  const slots = [...agents];
  while (slots.length < 3) {
    slots.push(undefined as unknown as { userId: string; name: string; image?: string; initials: string; closed: number; total: number });
  }

  // Podium layout handled inline below (2nd, 1st, 3rd)

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Top performing agents</CardTitle>
        <CardDescription>Most tickets resolved / closed</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-2 ">
        {!data && (
          <p className="text-center text-xs text-muted-foreground">Loading...</p>
        )}
        {data && agents.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">No resolved tickets yet.</p>
        )}
        {agents.length > 0 && (
          <div className="mt-2 flex items-end justify-center gap-6">
            {[
              { idx: 1, rank: 2 }, // second place (left)
              { idx: 0, rank: 1 }, // first place (center)
              { idx: 2, rank: 3 }, // third place (right)
            ].map(({ idx, rank }) => {
              const a = slots[idx];
              const heightByRank: Record<number, string> = { 1: 'h-28', 2: 'h-20', 3: 'h-16' };
              const pedestalHeight = heightByRank[rank] || 'h-16';
              const isWinner = rank === 1;
              if (!a) {
                return (
                  <div key={idx} className="flex flex-col items-center text-center opacity-40">
                    <Avatar className="mb-2 h-16 w-16">
                      <AvatarFallback>--</AvatarFallback>
                    </Avatar>
                    <div className={`w-24 ${pedestalHeight} rounded-t-md bg-muted`} />
                  </div>
                );
              }
              return (
                <div key={a.userId} className="flex flex-col items-center text-center">
                  <Avatar className={`mb-2 h-16 w-16 ring-2 ${isWinner ? 'ring-yellow-400' : 'ring-transparent'}`}>
                    {a.image && <AvatarImage src={a.image} alt={a.name} />}
                    <AvatarFallback>{a.initials}</AvatarFallback>
                  </Avatar>
                  <div className={`relative flex w-24 flex-col items-center justify-end rounded-t-md bg-muted/70 dark:bg-muted/40 ${pedestalHeight} pb-2 pt-3 shadow-sm`}> 
                    <span className={`absolute -top-3 rounded-full border bg-background px-2 py-0.5 text-[10px] font-semibold shadow ${isWinner ? 'text-yellow-600 border-yellow-400' : 'text-muted-foreground'}`}>#{rank}</span>
                    <h2 className="px-1 text-[11px] font-medium leading-tight truncate w-full" title={a.name}>{a.name}</h2>
                    <Badge className="mt-1 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 text-[10px] font-medium">
                      {a.closed} closed
                    </Badge>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{a.total} total</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
