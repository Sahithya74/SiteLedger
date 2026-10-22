import { can, type Permission, type PermissionHolder } from "@/lib/permissions";

/**
 * Main menu (spec §41). Only modules that are actually built appear here —
 * a menu entry is added in the same change that adds its page.
 */
export type NavIcon =
  | "dashboard"
  | "projects"
  | "clients"
  | "materials"
  | "labour"
  | "engineers"
  | "accounts"
  | "site"
  | "reports"
  | "audit"
  | "settings";

export type NavLink = {
  title: string;
  href: string;
  /** Shown when the user has any one of these permissions. */
  permission?: Permission | Permission[];
  adminOnly?: boolean;
};

export type NavSection = NavLink & { icon: NavIcon; children?: NavLink[] };

const MONEY_VIEW: Permission[] = ["projects.viewMoney", "quotations.manage", "clientPayments.record"];

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
  {
    title: "Clients",
    href: "/clients",
    icon: "clients",
    permission: ["clients.view", ...MONEY_VIEW],
    children: [
      { title: "Clients", href: "/clients", permission: "clients.view" },
      { title: "Quotations", href: "/clients/quotations", permission: ["quotations.manage", "projects.viewMoney"] },
      { title: "Client bills", href: "/clients/bills", permission: ["quotations.manage", "projects.viewMoney"] },
      { title: "Payments received", href: "/clients/payments", permission: ["clientPayments.record", "projects.viewMoney"] },
      { title: "Pending from clients", href: "/clients/pending", permission: "projects.viewMoney" },
      { title: "Cheques", href: "/clients/cheques", permission: ["clientPayments.record", "payments.record", "projects.viewMoney"] },
    ],
  },
  {
    title: "Materials",
    href: "/materials",
    icon: "materials",
    children: [
      { title: "Stock", href: "/materials" },
      { title: "Purchases", href: "/materials/purchases" },
      { title: "Suppliers", href: "/materials/suppliers" },
      { title: "Material requests", href: "/materials/requests" },
    ],
  },
  {
    title: "Labour",
    href: "/labour",
    icon: "labour",
    children: [
      { title: "Workers", href: "/labour" },
      { title: "Attendance", href: "/labour/attendance" },
      { title: "Wages", href: "/labour/wages", permission: ["wages.view", "payments.record"] },
      { title: "Contractors", href: "/labour/contractors" },
    ],
  },
  { title: "Engineers", href: "/engineers", icon: "engineers" },
  {
    title: "Accounts",
    href: "/accounts",
    icon: "accounts",
    permission: ["bank.viewBalances", "reports.view", "expenses.record", "payments.record"],
    children: [
      { title: "Overview", href: "/accounts", permission: ["bank.viewBalances", "reports.view"] },
      { title: "Money in", href: "/accounts/income", permission: ["projects.viewMoney", "clientPayments.record"] },
      { title: "Expenses", href: "/accounts/expenses", permission: ["expenses.record", "projects.viewMoney"] },
      { title: "Payments made", href: "/accounts/payments", permission: ["payments.record", "bank.viewBalances"] },
      { title: "We owe", href: "/accounts/payables", permission: ["payments.record", "bank.viewBalances"] },
      { title: "Bank & cash", href: "/accounts/banks" },
    ],
  },
  {
    title: "Site",
    href: "/daily-reports",
    icon: "site",
    children: [
      { title: "Daily reports", href: "/daily-reports" },
      { title: "Equipment", href: "/equipment" },
      { title: "Documents", href: "/documents" },
      { title: "Notifications", href: "/notifications" },
    ],
  },
  {
    title: "Reports",
    href: "/reports",
    icon: "reports",
    permission: ["reports.view", "projects.viewMoney", "payments.record", "expenses.record", "purchases.record", "materials.record", "wages.view", "attendance.record"],
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
  if (link.permission) {
    const keys = Array.isArray(link.permission) ? link.permission : [link.permission];
    if (!keys.some((k) => can(user, k))) return false;
  }
  return true;
}

export function navigationFor(user: PermissionHolder): NavSection[] {
  return NAV.filter((s) => visible(s, user)).map((s) => {
    const children = s.children?.filter((c) => visible(c, user));
    // A section's own link goes to its first page the user can open.
    return { ...s, href: children?.[0]?.href ?? s.href, children };
  });
}
