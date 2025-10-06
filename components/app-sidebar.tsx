"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Bell, ChevronDownIcon, EyeIcon, FileText, SlidersHorizontal } from "lucide-react"
import { useQuery, useMutation, usePaginatedQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { authClient } from "@/lib/auth-client"
import type { Id } from "@/convex/_generated/dataModel"

// import { NavUser } from "@/components/nav-user" // not used in this trimmed tickets sidebar
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
// popover is not used in this file
import { Badge } from "@/components/ui/badge"
// Loading spinner removed from sidebar
// Popover removed: filters moved into Sheet
// Input removed: not used in sidebar filters
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import type { DateRange } from "react-day-picker"
// cn removed: not used after moving filters into sheet
import { Label } from "@/components/ui/label"
import {
  Sidebar,
  SidebarContent,
  // SidebarFooter, // not used
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  // SidebarMenu,
  // SidebarMenuButton,
  // SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
// Switch not used directly in the header filters (we use Select/Input/Calendar)
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet"
import { ScrollArea } from "./ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// This is sample data
const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Tickets",
      url: "#",
      icon: FileText,
      isActive: true,
    },
    {
      title: "Notifications",
      url: "#",
      icon: Bell,
      isActive: false,
    },
    
  ],
  tickets: [],
}

type TicketItem = {
  status: string | undefined
  assignedToUser: string | undefined
  assignedToGroup?: string | undefined
  priority?: string | undefined
  dueAt?: number | undefined
  createdAt?: number | undefined
  name: string
  email: string
  subject: string
  date: string
  teaser: string
  _ticketId?: string
  _id?: string
}

function AppSidebarInner() {
  const router = useRouter()
  // Note: I'm using state to show active item.
  // IRL you should use the url/router.
  const [activeItem] = React.useState(data.navMain[0])
  const { setOpen } = useSidebar()
  const { data: session } = authClient.useSession()
  const userId = session?.user?.id as string | undefined
  const pathname = usePathname()
  const currentTicketId = React.useMemo(() => {
    if (!pathname) return null
    const parts = pathname.split("/").filter(Boolean)
    // expected /tickets/[ticketId]
    if (parts[0] === "tickets" && parts[1]) return parts[1]
    return null
  }, [pathname])
  // [paginated tickets query is declared later after filters]

  // Current user record to derive projects (for project filter chips)
  const me = useQuery(api.users.getByAuthId, { authUserId: userId ?? "" });
  const projectList = (me?.projects ?? []) as string[];
  const [projectFilter, setProjectFilter] = React.useState<string | null>(null);
  // Project-specific server querying now handled by paginated filters

  // Reintroduce simple search query and team/project queries
  const [query, setQuery] = React.useState("")
  type Priority = "P0" | "P1" | "P2" | "P3"
  const [filterPriority, setFilterPriority] = React.useState<"all" | Priority>("all")
  const [filterStatus, setFilterStatus] = React.useState<"all" | "open" | "in_progress" | "escalated" | "resolved" | "closed">("all")
  const [filterGroup, setFilterGroup] = React.useState<string | "all">("all")
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined)

  // Server-side pagination: tickets with filters (usePaginatedQuery)
  type TicketRow = {
    assignedToGroup?: string | null
    dueAt?: number | null
    _creationTime: number | undefined
    _id: string
    ticketId: string
    title: string
    description?: string
    createdAt?: number
    priority?: string
    status?: string
    assignedToUser?: string
  }
  // Cast through unknown to satisfy PaginatedQueryReference type without using 'any'
  const { results: tickets, status, loadMore } = usePaginatedQuery(
    api.myFunctions.listTicketsPaginated as unknown as Parameters<typeof usePaginatedQuery>[0],
    {
      status: filterStatus === "all" ? undefined : filterStatus,
      priority: filterPriority === "all" ? undefined : filterPriority,
      group: filterGroup === "all" ? undefined : filterGroup,
      project: projectFilter ?? undefined,
      from: (() => {
        if (!dateRange?.from) return undefined as number | undefined
        const d = new Date(dateRange.from)
        d.setHours(0, 0, 0, 0)
        return d.getTime()
      })(),
      to: (() => {
        if (!dateRange?.to && !dateRange?.from) return undefined as number | undefined
        const base = dateRange?.to ? new Date(dateRange.to) : new Date(dateRange.from!)
        base.setHours(23, 59, 59, 999)
        return base.getTime()
      })(),
    },
    { initialNumItems: 10 }
  ) as unknown as { results: TicketRow[] | undefined; status: string; loadMore: () => void }

  // When a team is selected via the Team select, fetch tickets for that team
  // Team-specific server querying now handled by paginated filters

  // Collect assignee IDs from all possible server sources so avatars can resolve
  const assigneeIds = React.useMemo(() => {
    const src = (tickets ?? []) as TicketRow[]
    return Array.from(new Set(src.map((t) => t.assignedToUser).filter(Boolean) as string[]))
  }, [tickets])

  const assignees = useQuery(api.users.getByAuthIds, { authUserIds: assigneeIds }) as
    | Array<{ authUserId: string; name: string; email: string }>
    | undefined

  const assigneeMap = React.useMemo(() => {
    const map = new Map<string, { name: string; email: string }>()
    assignees?.forEach((a) => {
      map.set(a.authUserId, { name: a.name, email: a.email })
    })
    return map
  }, [assignees])

  // Notifications & Push status
  const myNotifications = useQuery(api.notifications.listMyNotifications, {}) as
    | Array<{ _id: string; userId: string; channel: string; title: string; body: string; read: boolean; meta?: { ticketId?: string } }>
    | undefined

  // Unread notifications count (only in_app already filtered server-side)
  // const unreadCount = React.useMemo(() => (myNotifications || []).reduce((acc, n) => acc + (n.read ? 0 : 1), 0), [myNotifications]) // badge not shown in this variant

  const pushStatus = useQuery(api.push.getPushStatus, {}) as
    | { hasToken: boolean; paused: boolean }
    | undefined

  const markRead = useMutation(api.notifications.markRead)
  const storeSubscription = useMutation(api.storeSubscription.store)
  // Infinite scroll counts (notifications only)
  const [notifsVisible, setNotifsVisible] = React.useState(10)
  const ticketSentinelRef = React.useRef<HTMLDivElement | null>(null)
  const notifSentinelRef = React.useRef<HTMLDivElement | null>(null)
  const [webPushSubscribed, setWebPushSubscribed] = React.useState<boolean | null>(null)
  const [webPushBusy, setWebPushBusy] = React.useState(false)
  const [webPushSupported, setWebPushSupported] = React.useState<boolean | null>(null)
  const [webPushMessage, setWebPushMessage] = React.useState<string | null>(null)
  const [webPushLastResult, setWebPushLastResult] = React.useState<null | { sent: number; results: Array<{ endpoint?: string; ok: boolean; status?: number; error?: string }> }>(null)

  function getNotificationHelpUrl() {
    if (typeof navigator === 'undefined') return 'https://support.google.com/chrome/answer/3220216';
    const ua = navigator.userAgent
    if (/Edg\//.test(ua)) return 'https://support.microsoft.com/topic/manage-notifications-in-microsoft-edge-5ae72b2f-2f58-b91c-9606-7a0c7c0e81fb'
    if (/Chrome\//.test(ua)) return 'https://support.google.com/chrome/answer/3220216'
    if (/Firefox\//.test(ua)) return 'https://support.mozilla.org/kb/push-notifications-firefox'
    return 'https://support.google.com/chrome/answer/3220216'
  }

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const hasVapid = Boolean(process.env.NEXT_PUBLIC_WEBPUSH_VAPID)
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && hasVapid
    setWebPushSupported(supported)
    // Check existing subscription if any
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return setWebPushSubscribed(false)
      return reg.pushManager.getSubscription().then((s) => setWebPushSubscribed(Boolean(s))).catch(() => setWebPushSubscribed(false))
    }).catch(() => setWebPushSubscribed(false))
  }, [])

  // Build filtered ticket items from server rows (team > project > all)
  // Simple fuzzy match: case-insensitive, order-preserving subsequence
  function fuzzyMatch(hay: string, needle: string) {
    if (!needle) return true
    hay = (hay || '').toLowerCase()
    needle = (needle || '').toLowerCase()
    if (hay.includes(needle)) return true
    let i = 0
    for (const ch of hay) {
      if (ch === needle[i]) i++
      if (i === needle.length) return true
    }
    return false
  }

  const filteredItems = React.useMemo(() => {
    const q = query.trim()
    const source: TicketRow[] = (tickets ?? []) as TicketRow[]
    const mapped = (source ?? []).map((t: {
      assignedToGroup?: string | null
      dueAt?: number | null
      _creationTime: number | undefined
      _id: string
      ticketId: string
      title: string
      description?: string
      createdAt?: number
      priority?: string
      status?: string
      assignedToUser?: string
    }) => ({
      name: t.ticketId || t.title,
      email: t.ticketId,
      subject: t.title,
      date: t.createdAt ? new Date(t.createdAt).toLocaleString() : "",
      teaser: (t.description ?? "").slice(0, 160),
      _ticketId: t.ticketId,
      _id: t._id,
      status: t.status ?? "",
      assignedToUser: t.assignedToUser,
      assignedToGroup: t.assignedToGroup ?? undefined,
      priority: t.priority,
      dueAt: t.dueAt ?? undefined,
      createdAt: t.createdAt ?? t._creationTime,
    })) as TicketItem[]

    let list = mapped
    if (q) list = list.filter((t) => fuzzyMatch(q, `${t.subject} ${t._ticketId ?? ""}`))
    if (filterPriority !== "all") list = list.filter((t) => t.priority === filterPriority)
    if (filterStatus !== "all") list = list.filter((t) => t.status === filterStatus)
    if (filterGroup !== "all") list = list.filter((t) => (t.assignedToGroup || "").toLowerCase() === filterGroup.toLowerCase())

    const from = dateRange?.from ? new Date(dateRange.from) : undefined
    const to = dateRange?.to ? new Date(dateRange.to) : undefined
    if (from && to) {
      from.setHours(0, 0, 0, 0)
      to.setHours(23, 59, 59, 999)
      const fromTs = from.getTime()
      const toTs = to.getTime()
      list = list.filter((t) => {
        const ct = t.createdAt ?? 0
        return ct >= fromTs && ct <= toTs
      })
    } else if (from && !to) {
      const dayStart = new Date(from)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(from)
      dayEnd.setHours(23, 59, 59, 999)
      const fromTs = dayStart.getTime()
      const toTs = dayEnd.getTime()
      list = list.filter((t) => {
        const ct = t.createdAt ?? 0
        return ct >= fromTs && ct <= toTs
      })
    }

    return list
  }, [tickets, query, filterPriority, filterStatus, filterGroup, dateRange])

  // No ticketsVisible with server pagination
  React.useEffect(() => {
    setNotifsVisible(10)
  }, [myNotifications?.length])

  // Tickets infinite scroll observer
  const canLoadMore = status === 'CanLoadMore'
  React.useEffect(() => {
    if (!ticketSentinelRef.current) return
    const el = ticketSentinelRef.current
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          if (canLoadMore) loadMore()
        }
      },
      { root: null, rootMargin: '200px', threshold: 0.1 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [canLoadMore, loadMore])

  // Notifications infinite scroll observer (only when panel is active)
  const notificationsActive = activeItem?.title === "Notifications"
  React.useEffect(() => {
    if (!notificationsActive || !notifSentinelRef.current) return
    const el = notifSentinelRef.current
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && myNotifications) {
          setNotifsVisible((v) => Math.min(v + 10, myNotifications.length))
        }
      },
      { root: null, rootMargin: '200px', threshold: 0.1 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [notificationsActive, myNotifications])


  // Only show this sidebar on the root or ticket detail routes
  // (Sidebar visibility logic removed; always render in current layout)

  // Admin roles logic removed; not needed in isolated tickets sidebar

  return (
    <Sidebar collapsible="none" className="hidden md:flex h-svh min-w-[380px] bg-accent">
        <SidebarHeader className="gap-3.5 border-b p-4">
          <div className="flex w-full items-center justify-between">
            <div className="text-foreground text-base font-medium">
              {activeItem?.title}
            </div>
            <div>


              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7"><SlidersHorizontal /> </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>Refine the ticket list</SheetDescription>
                  </SheetHeader>

                  <ScrollArea className="h-52 w-full ">
                    <div className="grid flex-1 auto-rows-min gap-6 px-4">
                      <div className=" items-center grid gap-3">
                        <Label className="text-xs">Priority</Label>
                        <Select value={filterPriority} onValueChange={(v: "all" | Priority) => setFilterPriority(v)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="All" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="P3">P3</SelectItem>
                            <SelectItem value="P2">P2</SelectItem>
                            <SelectItem value="P1">P1</SelectItem>
                            <SelectItem value="P0">P0</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className=" items-center grid gap-3">
                        <Label className="text-xs">Status</Label>
                        <Select value={filterStatus} onValueChange={(v: "all" | "open" | "in_progress" | "escalated" | "resolved" | "closed") => setFilterStatus(v)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="All" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In progress</SelectItem>
                            <SelectItem value="escalated">Escalated</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className=" items-center grid gap-3">
                        <Label className="text-xs">Team</Label>
                        <Select value={filterGroup} onValueChange={(v) => setFilterGroup(v)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="All" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="IT Support">IT Support</SelectItem>
                            <SelectItem value="IRT">IRT</SelectItem>
                            <SelectItem value="IRT+Senior">IRT+Senior</SelectItem>
                            <SelectItem value="Exec Escalation">Exec Escalation</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>


                      <div className="  grid gap-3 w-full">
                        <Label className="text-xs">Date range</Label>

                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              id="dates"
                              className="w-full justify-between font-normal"
                            >
                              {dateRange?.from && dateRange?.to
                                ? `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}`
                                : "Select date"}
                              <ChevronDownIcon />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                            <Calendar
                              mode="range"
                              selected={dateRange}
                              captionLayout="dropdown"
                              onSelect={(range) => {
                                setDateRange(range)
                              }}
                            />
                          </PopoverContent>
                        </Popover>

                        {dateRange && (
                          <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)} className="mt-2">
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                  <SheetFooter>
                    <Button onClick={() => setOpen(false)}>Apply</Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

            </div>
          </div>

          {/* Project chips (user's projects) */}
          {projectList.length > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <div className="text-xs text-muted-foreground mr-2">Projects:</div>
              <Button size="sm" variant={projectFilter === null ? "secondary" : "ghost"} onClick={() => setProjectFilter(null)}>
                All projects
              </Button>
              {projectList.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={projectFilter === p ? "secondary" : "ghost"}
                  onClick={() => setProjectFilter(projectFilter === p ? null : p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          )}

          <SidebarInput placeholder="Type to search..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </SidebarHeader>
        {/* SidebarContent already has overflow-auto, but only works if parent has a fixed height (we added h-svh above). */}
        <SidebarContent className="flex-1">
          <SidebarGroup className="px-0">
            {/* Wrap scrollable ticket/notification region in its own flex column with min-h-0 to allow inner overflow. */}
            <SidebarGroupContent className="flex flex-col min-h-0">
              {/* If Notifications is active, show notifications panel */}
              {activeItem?.title === "Notifications" ? (
                <div className="p-4">
                  <div className="mb-2 text-sm font-medium">Notifications</div>
                  {!myNotifications ? (
                    <div className="flex justify-center p-4"><LoadingSpinner /></div>
                  ) : myNotifications.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No notifications</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {myNotifications.slice(0, notifsVisible).map((n) => (
                        <div key={n._id} className={`p-2 rounded border ${n.read ? 'bg-muted' : 'bg-background'}`}>
                          <div className="text-sm font-medium">{n.title}</div>
                          <div className="text-xs text-muted-foreground">{n.body}</div>
                          <div className="mt-1 text-right flex gap-3 items-center">
                            {!n.read && (
                              <>
                                <Button size="sm" className="h-7" onClick={() => markRead({ id: n._id as Id<"notifications"> })}>Mark read</Button>
                                <Button size="icon" className="size-7" onClick={async () => {
                                  try { await markRead({ id: n._id as Id<"notifications"> }) } catch { }
                                  const ticketId = n.meta?.ticketId
                                  if (ticketId) router.push(`/dashboard/tickets/${ticketId}`)
                                }}>
                                  <EyeIcon />
                                  
                                  </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={notifSentinelRef} />
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="text-sm font-medium mb-2">Push notifications</div>
                    <div className="text-xs text-muted-foreground mb-2">Enable browser push (works while the site is open). Service worker and VAPID must be configured.</div>
                    {typeof window !== 'undefined' && webPushSupported ? (
                      <div className="flex items-center gap-2">
                        <Button size="sm" disabled={webPushBusy} onClick={async () => {
                          setWebPushBusy(true)
                          try {
                            const vapid = process.env.NEXT_PUBLIC_WEBPUSH_VAPID || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
                            if (!vapid) {
                              setWebPushSupported(false)
                              setWebPushMessage('Missing VAPID key. Please set NEXT_PUBLIC_WEBPUSH_VAPID in your env.')
                              return
                            }
                            if (typeof Notification === 'undefined') {
                              setWebPushMessage('This browser does not support Notifications.')
                              return
                            }
                            // Pre-check permission to give a friendlier UX
                            const current = Notification.permission
                            if (current === 'denied') {
                              setWebPushMessage('Notifications are blocked for this site. Click the padlock icon in the address bar → Site settings → Notifications → Allow, then reload this page.')
                              return
                            }
                            if (current === 'default') {
                              const res = await Notification.requestPermission()
                              if (res !== 'granted') {
                                setWebPushMessage('Please allow notifications in the browser prompt. If you blocked it, open Site settings → Notifications → Allow, then reload.')
                                return
                              }
                            }
                            const mod = await import('./use-web-push')
                            const sub = await mod.registerWebPush(vapid)
                            if (userId) {
                              try {
                                await storeSubscription({ userId, subscription: sub.toJSON() as unknown as Record<string, unknown> })
                              } catch (e) {
                                console.warn('Failed to store subscription in Convex', e)
                              }
                            }
                            setWebPushSubscribed(true)
                            setWebPushMessage('Web Push enabled.')
                          } catch (err: unknown) {
                            console.error('Web push subscribe error', err)
                            setWebPushSubscribed(false)
                            setWebPushMessage('Failed to enable push. Check browser settings and try again.')
                          } finally {
                            setWebPushBusy(false)
                          }
                        }}>{webPushBusy ? 'Working...' : (webPushSubscribed ? 'Subscribed' : 'Enable Web Push')}</Button>

                        <Button size="sm" variant="ghost" disabled={webPushBusy || !webPushSubscribed} onClick={async () => {
                          setWebPushBusy(true)
                          try {
                            const mod = await import('./use-web-push')
                            const res = await mod.sendTestWebPush({ title: 'Test', body: 'This is a test web push' })
                            if (res && typeof res === 'object') {
                              setWebPushLastResult({ sent: res.sent ?? 0, results: Array.isArray(res.results) ? res.results : [] })
                              setWebPushMessage(`Sent ${res.sent ?? 0} notification(s).`)
                            }
                          } catch (err: unknown) {
                            console.error('Web push send error', err)
                            setWebPushMessage('Failed to send test push. Check server logs and VAPID keys.')
                          } finally {
                            setWebPushBusy(false)
                          }
                        }}>Send test</Button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Browser does not support service workers/push or VAPID key is missing.</div>
                    )}

                    {webPushMessage && (
                      <div className="text-xs text-muted-foreground mt-2">
                        {webPushMessage}
                      </div>
                    )}

                    {webPushLastResult && (
                      <div className="mt-2">
                        <div className="text-xs">Delivery report:</div>
                        <div className="mt-1 space-y-1">
                          {webPushLastResult.results.length === 0 ? (
                            <div className="text-xs text-muted-foreground">No subscriptions found. Click &quot;Enable Web Push&quot; first.</div>
                          ) : (
                            webPushLastResult.results.map((r, i) => (
                              <div key={i} className="text-xs text-muted-foreground">
                                {r.ok ? 'OK' : 'FAIL'}{r.status ? ` (${r.status})` : ''} — {r.endpoint || 'no-endpoint'}{r.error ? `: ${r.error}` : ''}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {typeof window !== 'undefined' && typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Notifications are blocked for this site. To enable: click the padlock in the address bar → Site settings → Notifications → Allow, then reload.
                        <div className="mt-2 flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Reload after allowing</Button>
                          <a href={getNotificationHelpUrl()} target="_blank" rel="noreferrer" className="underline">View help</a>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground mt-2">Status: {pushStatus ? (pushStatus.hasToken ? 'Enabled' : 'No token') : 'Unknown'}</div>
                  </div>
                </div>
              ) : (status === 'LoadingFirstPage') ? (
                <div className="p-4 w-full flex justify-center ">
                  <LoadingSpinner />
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto">
                {filteredItems.map((ticket) => {
                  const isActive = !!(currentTicketId && ticket._ticketId && currentTicketId === ticket._ticketId)
                  return (
                    <Tooltip key={ticket.email}>
                      <TooltipTrigger className="w-full" asChild>
                        <Link
                          href={`/dashboard/tickets/${ticket._ticketId}`}
                          aria-current={isActive ? "true" : undefined}
                          className={
                            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight whitespace-nowrap last:border-b-0" +
                            (isActive ? " bg-sidebar-accent text-sidebar-accent-foreground border-l-4 border-l-primary" : "")
                          }
                        >
                          <div className="flex w-full items-center gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{ticket.name}</span>
                              {ticket.priority ? (
                                <Badge
                                  variant={
                                    ticket.priority === "P0"
                                      ? "destructive"
                                      : ticket.priority === "P1"
                                        ? "destructive"
                                        : ticket.priority === "P2"
                                          ? "default"
                                          : "secondary"
                                  }
                                  className={`ml-2 text-[10px] px-1 ${ticket.priority === "P1" ? "animate-pulse" : ""}`}
                                >
                                  {ticket.priority}
                                </Badge>
                              ) : null}
                            </div>

                            <span className="ml-auto text-xs">{new Date(ticket.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          </div>
                          <div className="flex w-full items-center justify-between">
                            <span className="font-medium">{ticket.subject}</span>
                            {ticket.status ? (
                              <Badge
                                variant={
                                  ticket.status === "open"
                                    ? "default"
                                    : ticket.status === "in_progress"
                                      ? "secondary"
                                      : ticket.status === "escalated"
                                        ? "destructive"
                                        : ticket.status === "resolved"
                                          ? "outline"
                                          : "secondary"
                                }
                                className="ml-2"
                              >
                                {ticket.status}
                              </Badge>
                            ) : null}

                          </div>

                          <div className="flex w-full items-center gap-2 justify-between">
                            {ticket.assignedToGroup ? (
                              <div className="text-xs text-muted-foreground">{ticket.assignedToGroup}</div>
                            ) : null}
                            <div className="ml-auto">
                              {ticket._id && ticket.assignedToUser ? (

                                <Tooltip key={ticket.email}>
                                  <TooltipTrigger className="w-full">

                                    <Avatar className="h-7 w-7 rounded-full">
                                      <AvatarImage src={assigneeMap.get(ticket.assignedToUser)?.email ?? ""} alt={assigneeMap.get(ticket.assignedToUser)?.name ?? ""} />
                                      <AvatarFallback className="text-xs">
                                        {(assigneeMap.get(ticket.assignedToUser)?.name ?? "").slice(0, 1).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>

                                  </TooltipTrigger>
                                  <TooltipContent side="right">
                                    <div className="text-sm">Assigned to : {assigneeMap.get(ticket.assignedToUser)?.name ?? "Unassigned"}</div>
                                  </TooltipContent>
                                </Tooltip>

                              ) : (
                                <div className="text-xs text-muted-foreground">Unassigned</div>
                              )}
                            </div>

                          </div>

                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {/* SLA indicator: elapsed / SLA and overdue label */}
                        <div className="text-xs">
                          {ticket.dueAt ? (
                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1">
                                <span >
                                  {Math.max(0, Math.round(((Date.now() - (ticket.createdAt ?? Date.now())) / (1000 * 60 * 60))))}h elapsed / {(ticket.dueAt && Math.max(1, Math.round(((ticket.dueAt - (ticket.createdAt ?? Date.now())) / (1000 * 60 * 60))))) || '-'}h SLA
                                </span>
                              </div>
                              {Date.now() > (ticket.dueAt ?? 0) && (
                                <span className="text-red-600 font-medium">Overdue</span>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
                </div>
              )
              }
              {/* Sentinel for tickets list */}
              <div ref={ticketSentinelRef} />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
  )
}

// Memoized export to avoid unnecessary re-renders when page children change
export const AppSidebar = React.memo(function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return <AppSidebarInner {...props} />
})
