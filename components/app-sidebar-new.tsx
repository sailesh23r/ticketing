"use client"

import * as React from "react"
import {
  Command,
  FileText,
  Users,
  FolderKanban,
  GalleryVerticalEnd,
  AudioWaveform,
  type LucideIcon,
  MessageCircleQuestion,
  LayoutDashboard,
  BookUser,
  ChartLine,
} from "lucide-react"

// (legacy NavMain not used here; using NavMainNew)
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { TeamSwitcherNew } from "./team-switcher-new"
import { NavMainNew } from "./nav-main-new"
import { NavRecentTickets } from "./nav-recent-tickets"
import { NavNotifications } from "./nav-notifications"
import { useQuery } from "convex/react"
import { authClient } from "@/lib/auth-client"
import { api } from "@/convex/_generated/api"
// import { NavPowredBy } from "./nav-powredby"
import { NavSecondary } from "./nav-secondary"

// This is sample data.
const data = {
  teams: [
    { name: "Acme Inc", logo: GalleryVerticalEnd, plan: "Enterprise" },
    { name: "Acme Corp.", logo: AudioWaveform, plan: "Startup" },
    { name: "Evil Corp.", logo: Command, plan: "Free" },
  ],
   navSecondary: [
    {
      title: "Help",
      url: "#help",
      icon: MessageCircleQuestion,
    },
  ],
  // projects list can be wired later if needed; leaving placeholder empty to avoid misleading entries
  projects: [] as { name: string; url: string; icon: LucideIcon }[],
}

export function AppSidebarNew({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // Session & role detection (mirror legacy sidebar logic for admin pages)
  const { data: session } = authClient.useSession()
  const userId = session?.user?.id as string | undefined
  const me = useQuery(api.users.getByAuthId, userId ? { authUserId: userId } : "skip") as { roles?: string[]; projects?: string[] } | undefined
  const roles = React.useMemo(() => (me?.roles || []).map(r => r.toLowerCase()), [me?.roles])
  const isAdmin = roles.includes("admin")

  // Base nav items copied from legacy `app-sidebar.tsx`
  // Using sub-items only where we have concrete pages; top-level URLs point to first meaningful page.
  interface NavItem { title: string; url: string; icon?: LucideIcon; isActive?: boolean; items?: { title: string; url: string }[] }
  const baseItems: NavItem[] = [
    {
      title: "Dashboard",
      url: "/new-dash",
      icon: LayoutDashboard,
      isActive: false,
      items: [
        { title: "Dashboard", url: "/new-dash" },
        // { title: "Reports", url: "/reports" },
      ],
    },
    {
      title: "Tickets",
      url: "/new-dash/tickets",
      icon: FileText,
      isActive: false,
      items: [
        { title: "Tickets", url: "/new-dash/tickets" },
      ]
    },
        {
        title: "Reports",
        url: "/new-dash/reports",
        icon: ChartLine,
        items: [ { title: "Reports", url: "/new-dash/reports" } ],
      },
  ]

  if (isAdmin) {
    baseItems.push(
      {
        title: "Users",
        url: "/new-dash/admin/users",
        icon: Users,
        items: [ { title: "Manage Users", url: "/new-dash/admin/users" } ],
      },
      {
        title: "Projects",
        url: "/new-dash/admin/projects",
        icon: FolderKanban,
        items: [ { title: "All Projects", url: "/new-dash/admin/projects" } ],
      },
      {
        title: "Teams",
        url: "/new-dash/admin/teams",
        icon: BookUser,
        items: [ { title: "All Teams", url: "/new-dash/admin/teams" } ],
      },
    )
  }

  // Pass transformed nav items to NavMainNew
  const navItems: NavItem[] = baseItems
  // recent tickets & notifications rendered via dedicated components
  // (Projects section temporarily disabled; can be re-enabled when design finalized)
  return (
    <Sidebar
      collapsible="icon"
      {...props}
      className="[&_[data-slot=sidebar-inner]]:bg-muted/30 [&_[data-mobile=true][data-slot=sidebar]]:bg-muted/30"
    >
      <SidebarHeader>
        <TeamSwitcherNew teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavNotifications />
        <NavMainNew items={navItems} />
        {/* {memberProjects && memberProjects.length > 0 && (
          <div className="px-2 pt-4">
            <div className="text-xs font-medium mb-2 text-muted-foreground tracking-wide">{isAdmin ? 'Projects' : 'My Projects'}</div>
            <div className="space-y-1">
              {memberProjects.map(p => {
                const slug = p.slug || (p.name ? p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '')
                const href = isAdmin ? `/dashboard/admin/projects/${slug}` : `/dashboard?project=${encodeURIComponent(slug)}`
                return (
                  <Link key={p._id} href={href} className="block rounded px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground border border-transparent hover:border-border transition-colors">
                    <span className="font-medium truncate" title={p.name}>{p.name || slug}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )} */}
        <NavRecentTickets />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter className="items-center justify-center">
        {/* <NavPowredBy /> */}
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
