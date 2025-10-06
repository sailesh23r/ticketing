"use client"

import * as React from "react"
import { Pie, PieChart } from "recharts"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

export const description = "Ticket turnaround time distribution"

// Use explicit fallback colors (still allow theme variables if present) to guarantee visibility.
const chartConfig = {
    under1h: { label: "0-1h", color: "#2563eb" },      // blue
    h1to8: { label: "1-8h", color: "#16a34a" },        // green
    h8to24: { label: "8-24h", color: "#f59e0b" },      // amber
    h24to72: { label: "24-72h", color: "#dc2626" },    // red
    over72h: { label: ">72h", color: "#6b7280" },      // gray
} satisfies ChartConfig

interface TurnaroundResult {
    totalCompleted: number
    buckets: Array<{ key: string; label: string; count: number }>
}

export function ChartPieDonutText({ project, team }: { project?: string; team?: string }) {
    const turnaround = useQuery(api.stats.turnaroundBuckets, { project, team }) as TurnaroundResult | undefined

    const pieData = React.useMemo(() => {
        const buckets = (turnaround?.buckets || []).filter(b => b.count > 0)
        return buckets.map(b => {
            const cfg = chartConfig[b.key as keyof typeof chartConfig]
            return {
                bucket: b.key,
                value: b.count,
                // Prefer direct color fallback; still let user override via --color-<key>
                fill: `var(--color-${b.key}, ${cfg?.color || '#8884d8'})`,
            }
        })
    }, [turnaround])

    const total = pieData.reduce((sum, d) => sum + d.value, 0)

    return (
        <Card className="flex flex-col">
            <CardHeader className="items-center pb-0">
                <CardTitle>Turnaround time distribution</CardTitle>
                <CardDescription>

                    {turnaround && (
                        <p >
                            Based on {turnaround.totalCompleted} completed ticket{turnaround.totalCompleted === 1 ? "" : "s"}.
                        </p>
                    )}
                    

                </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-0">
                <div className="flex flex-col items-center justify-center gap-6 md:flex-row md:items-start md:justify-center">
                    <ChartContainer
                        config={chartConfig}
                        className="mx-auto aspect-square max-h-[250px] w-[250px]"
                    >
                        <PieChart>
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent hideLabel />}
                            />
                            <Pie
                                data={pieData}
                                dataKey="value"
                                nameKey="bucket"
                                innerRadius={40}
                            />
                        </PieChart>
                    </ChartContainer>
                    {turnaround && total > 0 && (
                        <div className="flex flex-col gap-2 text-xs min-w-[140px] self-center">
                            {pieData.map(d => {
                                const pct = ((d.value / total) * 100).toFixed(1)
                                return (
                                    <span key={d.bucket} className="inline-flex items-center gap-2 ">
                                        <span
                                            className="h-2.5 w-2.5 rounded-[2px]"
                                            style={{ background: `var(--color-${d.bucket}, ${chartConfig[d.bucket as keyof typeof chartConfig]?.color || '#8884d8'})` }}
                                        />
                                        <span className="font-medium">{chartConfig[d.bucket as keyof typeof chartConfig]?.label}</span>
                                        <span className="ml-auto tabular-nums">{d.value}</span>
                                        <span className="text-muted-foreground">({pct}%)</span>
                                    </span>
                                )
                            })}
                        </div>
                    )}
                </div>
                {(!turnaround || pieData.length === 0) && (
                    <div className="mt-2 text-center text-xs text-muted-foreground">
                        {turnaround ? "No completed tickets yet" : "Loading..."}
                    </div>
                )}
                {/* {turnaround && (
                    <p className="mt-4 text-center text-xs text-muted-foreground">
                        Based on {turnaround.totalCompleted} completed ticket{turnaround.totalCompleted === 1 ? "" : "s"}.
                    </p>
                )} */}
            </CardContent>
        </Card>
    )
}
