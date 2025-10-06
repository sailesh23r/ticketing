"use client"

import { MoreHorizontal, Eye, ExternalLink, FileText } from "lucide-react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function truncate(str: string, max = 38) {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + "…"
}

export function NavRecentTickets() {
  const { isMobile } = useSidebar()
  const recent = useQuery(api.myFunctions.recentOpenTickets, {}) as Array<{
    _id: string; ticketId: string; title: string; priority: string; project?: string;
  }> | undefined

  if (!recent || recent.length === 0) return null

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recent Tickets</SidebarGroupLabel>
      <SidebarMenu>
        {recent.map(t => {
          const href = `/dashboard/tickets/${t.ticketId}`
          return (
            <SidebarMenuItem key={t._id}>
              <SidebarMenuButton asChild>
                <Link href={href} title={t.title} className="flex items-center gap-2">
                  <FileText />
                  <span className="truncate" style={{ maxWidth: 160 }}>
                    {t.ticketId} – {truncate(t.title, 24)}
                  </span>
                </Link>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction showOnHover>
                    <MoreHorizontal />
                    <span className="sr-only">More</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-48"
                  side={isMobile ? "bottom" : "right"}
                  align={isMobile ? "end" : "start"}
                >
                  <DropdownMenuItem asChild>
                    <Link href={href}>
                      <Eye className="text-muted-foreground" />
                      <span>Open</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={href} target="_blank">
                      <ExternalLink className="text-muted-foreground" />
                      <span>Open in new tab</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled>
                    <span className="text-muted-foreground text-xs">Priority: {t.priority}</span>
                  </DropdownMenuItem>
                  {t.project && (
                    <DropdownMenuItem disabled>
                      <span className="text-muted-foreground text-xs">Project: {t.project}</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
