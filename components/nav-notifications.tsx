"use client"

import * as React from "react"
import { Bell, Check, Loader2 } from "lucide-react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface NotificationRow {
  _id: Id<"notifications">
  userId: string
  channel: string
  title: string
  body: string
  read: boolean
  meta?: { ticketId?: string }
}

export function NavNotifications() {
  const notifications = useQuery(api.notifications.listMyNotifications, {}) as NotificationRow[] | undefined
  const markRead = useMutation(api.notifications.markRead)
  const unread = (notifications || []).filter(n => !n.read)
  const [open, setOpen] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)

  async function markAll() {
    if (!notifications) return
    setBulkBusy(true)
    try {
      const unreadIds = notifications.filter(n => !n.read).slice(0, 100).map(n => n._id)
      await Promise.all(unreadIds.map(id => markRead({ id })))
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Notifications</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <SidebarMenuButton className="relative" tooltip="Notifications">
                <Bell />
                <span>Notifications</span>
                {unread.length > 0 && (
                  <span className="absolute right-2 top-2 rounded-full bg-red-600 text-[10px] leading-none text-white px-1 py-[2px] font-medium min-w-[16px] text-center">
                    {unread.length > 99 ? "99+" : unread.length}
                  </span>
                )}
              </SidebarMenuButton>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="text-xs font-medium">Notifications</div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" disabled={bulkBusy || unread.length === 0} onClick={markAll} className="h-6 px-2 text-[11px]">
                    {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    <span className="ml-1">Mark all</span>
                  </Button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y scrollbar-thin scrollbar-thumb-border/60 scrollbar-track-transparent">
                {!notifications && (
                  <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
                  </div>
                )}
                {notifications && notifications.length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground">No notifications</div>
                )}
                {notifications && notifications.map(n => (
                  <div key={n._id} className={cn("p-3 text-xs space-y-1", !n.read && "bg-muted/50")}> 
                    <div className="font-medium text-[11px] flex items-center gap-2">
                      {n.title}
                      {!n.read && (
                        <button
                          onClick={() => markRead({ id: n._id })}
                          className="ml-auto inline-flex items-center gap-1 rounded border px-1 py-[1px] text-[10px] hover:bg-accent"
                        >
                          <Check className="h-3 w-3" /> Read
                        </button>
                      )}
                    </div>
                    <div className="text-muted-foreground leading-snug line-clamp-3">{n.body}</div>
                    {n.meta?.ticketId && (
                      <div className="text-[10px] text-muted-foreground/80">Ticket: {n.meta.ticketId}</div>
                    )}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
