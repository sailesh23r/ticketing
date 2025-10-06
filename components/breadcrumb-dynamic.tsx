"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"

export default function BreadcrumbDynamic() {
  const pathname = usePathname() || "/new-dash"
  const parts = React.useMemo(() => pathname.split("/").filter(Boolean), [pathname])

  // Support legacy /dashboard and new /new-dash as the same root label
  const rootAliasSet = new Set(["dashboard", "new-dash"]) // treat both as dashboard
  const isDashboardRoot = parts.length === 1 && rootAliasSet.has(parts[0])
  const rootSegment = rootAliasSet.has(parts[0]) ? parts[0] : null
  const segments = rootSegment ? parts.slice(1) : parts

  // Detect ticket detail like /dashboard/tickets/[ticketId]
  const ticketId = segments.length >= 2 && segments[0] === "tickets" ? segments[1] : null
  const ticket = useQuery(api.myFunctions.getTicketThread, ticketId ? { ticketId } : "skip") as
    | { ticket?: { ticketId?: string; title?: string } }
    | undefined

  function labelForSegment(seg: string): string {
    try {
      seg = decodeURIComponent(seg)
    } catch {}
    // Humanize: replace -/_ with space and capitalize words
    return seg
      .replaceAll("-", " ")
      .replaceAll("_", " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  }

  // Build crumb items; hide intermediary categories like 'admin' and 'tickets'
  // Preserve actual root segment in hrefs to avoid breaking links; label always "Dashboard"
  const baseHref = rootSegment ? `/${rootSegment}` : "/new-dash"
  const crumbs = React.useMemo(() => {
    const items: Array<{ href?: string; label: string }> = []
    // Always start with Dashboard
  items.push({ href: baseHref, label: "Dashboard" })
    if (isDashboardRoot) return items

  const skip = new Set(["admin", "tickets"]) // these segments are not meaningful standalone breadcrumb pages

    // Ticket detail: /dashboard/tickets/[ticketId] -> Dashboard / <Title>
    if (segments.length >= 2 && segments[0] === "tickets") {
      // Optionally show ticket title if loaded
      const title = ticket?.ticket?.title
      const label = title || ticketId || "Ticket"
      items.push({ label })
      return items
    }

    let acc = baseHref
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      acc += "/" + seg // href should reflect the real path (including skipped segments)
      if (skip.has(seg)) continue
      const isLast = i === segments.length - 1
      const label = labelForSegment(seg)
      items.push(isLast ? { label } : { href: acc, label })
    }
    return items
  }, [segments, isDashboardRoot, ticketId, ticket?.ticket?.title, baseHref])

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <BreadcrumbSeparator className="hidden md:block" />}
            <BreadcrumbItem className={idx === 0 ? "hidden md:block" : undefined}>
              {c.href ? (
                <BreadcrumbLink href={c.href}>{c.label}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
