"use client"

import { ChevronRight, PanelLeftIcon, type LucideIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useRouter } from "next/navigation"

export function NavPowredBy() {
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === 'collapsed'
  const router = useRouter()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {/* {items.map((item) => ( */}
          <Collapsible
            key="PoweredByXlter"
            asChild
            defaultOpen={false}
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  tooltip="Powred By Xlter"
                  onClick={(e) => {
                    if (collapsed) {
                      e.preventDefault();
                      toggleSidebar();
                      // Navigate directly when collapsed
                    //   router.push(item.url)
                    }
                  }}
                >
                  <PanelLeftIcon />
                  <span>Powered By Xlter</span>
                  <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {/* {item.items?.map((subItem) => ( */}
                    <SidebarMenuSubItem key="PoweredByXlter">
                      <SidebarMenuSubButton asChild>
                        <a href="#">
                          <span>Powered By Xlter</span>
                        </a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  {/* ))} */}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        {/* ))} */}
      </SidebarMenu>
    </SidebarGroup>
  )
}
