/**
 * Permission keys. The ADMIN (owner) always has every permission.
 * A MANAGER has only the permissions the owner grants (stored in
 * UserPermission rows), and can NEVER receive the admin-only ones.
 *
 * This file has no server-only imports so the permissions screen can use the
 * same list for its checkboxes.
 */

export type PermissionGroup = "Projects" | "Clients" | "People" | "Materials" | "Money" | "Site" | "System";

type PermissionDef = {
  label: string;
  group: PermissionGroup;
  /** Admin-only permissions can never be given to a manager. */
  adminOnly?: boolean;
};

export const PERMISSIONS = {
  // Projects
  "projects.viewAll": { label: "See all projects, not only the ones assigned", group: "Projects" },
  "projects.create": { label: "Create new projects", group: "Projects" },
  "projects.edit": { label: "Edit project details", group: "Projects" },
  "projects.updateStatus": { label: "Change project status", group: "Projects" },
  "projects.viewMoney": { label: "See project money (contract value, received, pending, profit)", group: "Projects" },
  "work.manage": { label: "Add work items and update progress", group: "Projects" },
  "projects.archive": { label: "Archive and restore projects", group: "Projects", adminOnly: true },
  "projects.delete": { label: "Permanently delete projects", group: "Projects", adminOnly: true },

  // Clients
  "clients.view": { label: "See client details", group: "Clients" },
  "clients.manage": { label: "Add and edit clients", group: "Clients" },
  "quotations.manage": { label: "Prepare quotations and client bills", group: "Clients" },

  // People
  "engineers.manage": { label: "Add engineers and assign their work", group: "People" },
  "labour.manage": { label: "Add and edit workers and labour contractors", group: "People" },
  "attendance.record": { label: "Mark attendance", group: "People" },
  "wages.view": { label: "See wages and pending wages", group: "People" },

  // Materials
  "materials.record": { label: "Record material deliveries, usage and requests", group: "Materials" },
  "materials.manage": { label: "Add materials and suppliers", group: "Materials" },
  "purchases.record": { label: "Record material purchases", group: "Materials" },

  // Money
  "clientPayments.record": { label: "Add client payments", group: "Money" },
  "payments.record": { label: "Pay suppliers, workers, engineers and contractors", group: "Money" },
  "expenses.record": { label: "Record expenses", group: "Money" },
  "bank.viewBalances": { label: "See bank and cash balances", group: "Money" },
  "reports.view": { label: "See reports", group: "Money" },
  "bank.manage": { label: "Add bank accounts, transfers and reconciliation", group: "Money", adminOnly: true },
  "finance.reverse": { label: "Reverse saved payments and expenses", group: "Money", adminOnly: true },
  "periods.lock": { label: "Lock closed months", group: "Money", adminOnly: true },

  // Site
  "issues.manage": { label: "Report and update site issues", group: "Site" },
  "dailyReports.manage": { label: "Write daily site reports", group: "Site" },
  "documents.upload": { label: "Upload photos and documents", group: "Site" },
  "equipment.manage": { label: "Manage equipment", group: "Site" },

  // System
  "audit.view": { label: "See the audit log", group: "System" },
  "users.manage": { label: "Manage users and permissions", group: "System", adminOnly: true },
  "settings.manage": { label: "Change company settings", group: "System", adminOnly: true },
  "data.backup": { label: "Download backups and export all data", group: "System", adminOnly: true },
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ADMIN_ONLY_PERMISSIONS = ALL_PERMISSIONS.filter(
  (key) => (PERMISSIONS[key] as PermissionDef).adminOnly === true,
);

export const GRANTABLE_PERMISSIONS = ALL_PERMISSIONS.filter((key) => !ADMIN_ONLY_PERMISSIONS.includes(key));

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

/** Ready-made permission sets the owner can apply with one click. */
export const PERMISSION_PRESETS = {
  SITE_MANAGER: {
    label: "Site Manager",
    description: "Runs day-to-day site work. Cannot see contract values or bank balances.",
    permissions: [
      "projects.updateStatus",
      "work.manage",
      "clients.view",
      "engineers.manage",
      "labour.manage",
      "attendance.record",
      "materials.record",
      "expenses.record",
      "issues.manage",
      "dailyReports.manage",
      "documents.upload",
      "equipment.manage",
    ],
  },
  OFFICE_MANAGER: {
    label: "Office Manager",
    description: "Handles projects, clients, purchases and payments. Cannot change users, settings or past payments.",
    permissions: GRANTABLE_PERMISSIONS,
  },
} as const satisfies Record<string, { label: string; description: string; permissions: readonly Permission[] }>;

export type PresetKey = keyof typeof PERMISSION_PRESETS;

/** Removes unknown keys and anything a manager may never hold. */
export function sanitizeManagerPermissions(keys: Iterable<string>): Permission[] {
  const result = new Set<Permission>();
  for (const key of keys) {
    if (isPermission(key) && GRANTABLE_PERMISSIONS.includes(key)) result.add(key);
  }
  return [...result].sort();
}

export type PermissionHolder = {
  role: "ADMIN" | "MANAGER";
  permissions: readonly string[];
};

export function can(user: PermissionHolder | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (ADMIN_ONLY_PERMISSIONS.includes(permission)) return false;
  return user.permissions.includes(permission);
}
