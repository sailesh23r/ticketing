"use client"

import React from "react"
import { type LucideIcon } from "lucide-react"
import * as Popover from "@radix-ui/react-popover"
import { toast } from "sonner"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url?: string
    icon: LucideIcon
    badge?: React.ReactNode
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [subject, setSubject] = React.useState("")
  const [description, setDescription] = React.useState("")

  async function submitSupport() {
    if (!subject.trim() || !description.trim()) {
      toast.warning("Please provide a subject and description")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success("Issue sent. We’ll get back to you soon.")
      setOpen(false)
      setSubject("")
      setDescription("")
    } catch {
      toast.error("Failed to send. Please try again later.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isHelp = item.title.toLowerCase() === "help" || item.url === "#help" || item.url === "#"
            if (isHelp) {
              return (
                <SidebarMenuItem key={item.title}>
                  <Popover.Root open={open} onOpenChange={setOpen}>
                    <Popover.Trigger asChild>
                      <SidebarMenuButton asChild>
                        <button type="button">
                          <item.icon />
                          <span>{item.title}</span>
                        </button>
                      </SidebarMenuButton>
                    </Popover.Trigger>
                    <Popover.Content sideOffset={8} className="z-50 w-80 rounded-md border bg-background p-4 shadow-md outline-none">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium">Report an issue</h4>
                          <p className="text-xs text-muted-foreground">Send details to our support inbox.</p>
                        </div>
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <Label htmlFor="support-subject">Subject</Label>
                            <Input id="support-subject" placeholder="Brief summary" value={subject} onChange={(e) => setSubject(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="support-description">Description</Label>
                            <textarea
                              id="support-description"
                              placeholder="Describe the issue…"
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              className="flex h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
                          <Button size="sm" onClick={submitSupport} disabled={loading}>
                            {loading ? "Sending…" : "Send"}
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Sends to jibin85jose@gmail.com</p>
                      </div>
                    </Popover.Content>
                  </Popover.Root>
                </SidebarMenuItem>
              )
            }
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  <a href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
                {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
