"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  HardHat,
  IndianRupee,
  LayoutDashboard,
  ScrollText,
  Settings,
  UserRoundCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BrandMark, BrandName } from "@/components/app/brand";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { NavIcon, NavSection } from "@/lib/navigation";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  projects: Building2,
  clients: Users,
  materials: Boxes,
  labour: HardHat,
  engineers: UserRoundCog,
  accounts: IndianRupee,
  site: ClipboardList,
  reports: BarChart3,
  audit: ScrollText,
  settings: Settings,
};

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The most specific matching link wins (/settings/users beats /settings). */
function activeHref(pathname: string, hrefs: string[]): string | null {
  return hrefs.filter((h) => matches(pathname, h)).sort((a, b) => b.length - a.length)[0] ?? null;
}

export function AppSidebar({ sections, companyName }: { sections: NavSection[]; companyName: string }) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const close = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link href="/dashboard" onClick={close} className="flex items-center gap-2.5 px-1 py-1.5">
          <BrandMark />
          <BrandName subtitle={companyName} className="group-data-[collapsible=icon]:hidden" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map((section) => {
                const Icon = ICONS[section.icon];
                const children = section.children ?? [];
                const activeChild = activeHref(pathname, children.map((c) => c.href));
                const sectionActive = children.length === 0 && matches(pathname, section.href);
                return (
                  <SidebarMenuItem key={section.href}>
                    <SidebarMenuButton asChild isActive={sectionActive} tooltip={section.title} size="lg" className="h-10">
                      <Link href={section.href} onClick={close}>
                        <Icon />
                        <span className="font-medium">{section.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {children.length > 0 && (
                      <SidebarMenuSub>
                        {children.map((child) => (
                          <SidebarMenuSubItem key={child.href}>
                            <SidebarMenuSubButton asChild isActive={child.href === activeChild}>
                              <Link href={child.href} onClick={close}>
                                {child.title}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <p className="px-2 pb-1 text-[11px] leading-snug text-muted-foreground">
          More modules (materials, labour, accounts, reports) are added in the next stages.
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
