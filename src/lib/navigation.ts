import { can, type Permission, type PermissionHolder } from "@/lib/permissions";

/**
 * Main menu (spec §41). Only modules that are actually built appear here —
 * a menu entry is added in the same change that adds its page.
 */
export type NavIcon = "dashboard" | "projects" | "clients" | "people" | "audit" | "settings";

export type NavLink = { title: string; href: string; permission?: Permission; adminOnly?: boolean };

export type NavSection = NavLink & { icon: NavIcon; children?: NavLink[] };

const NAV: NavSection[] = [
  { title: "Dashboard", href: "/dashboard", icon: "dashboard" },
  {
    title: "Projects",
    href: "/projects",
    icon: "projects",
    children: [
      { title: "All projects", href: "/projects" },
      { title: "Pending work", href: "/work/pending" },
    ],
  },
  { title: "Clients", href: "/clients", icon: "clients", permission: "clients.view" },
  {
    title: "People",
    href: "/engineers",
    icon: "people",
    children: [{ title: "Engineers", href: "/engineers" }],
  },
  { title: "Audit log", href: "/audit", icon: "audit", permission: "audit.view" },
  {
    title: "Settings",
    href: "/settings",
    icon: "settings",
    children: [
      { title: "My account", href: "/settings" },
      { title: "Users & permissions", href: "/settings/users", adminOnly: true },
    ],
  },
];

function visible(link: NavLink, user: PermissionHolder): boolean {
  if (link.adminOnly && user.role !== "ADMIN") return false;
  if (link.permission && !can(user, link.permission)) return false;
  return true;
}

export function navigationFor(user: PermissionHolder): NavSection[] {
  return NAV.filter((s) => visible(s, user)).map((s) => ({
    ...s,
    children: s.children?.filter((c) => visible(c, user)),
  }));
}
