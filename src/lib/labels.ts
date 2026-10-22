/**
 * Plain-English names and colours for every status the user sees.
 * Kept in one place so wording stays consistent (and can be translated later).
 */
import type {
  CostGroup,
  LabourCategory,
  PaymentMethod,
  Priority,
  ProjectStatus,
  ProjectType,
  Severity,
  WorkStatus,
} from "@/generated/prisma/enums";

export type Tone = "red" | "amber" | "green" | "blue" | "grey" | "violet";

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone; help: string }> = {
  PLANNING: { label: "Planning", tone: "violet", help: "Not started yet — drawings, approvals or quotation stage." },
  ACTIVE: { label: "Active", tone: "green", help: "Work is happening on site." },
  ON_HOLD: { label: "On hold", tone: "grey", help: "Paused — waiting for client, funds or approval." },
  DELAYED: { label: "Delayed", tone: "red", help: "Running behind the planned schedule." },
  COMPLETED: { label: "Completed", tone: "blue", help: "Work is finished and handed over." },
  CANCELLED: { label: "Cancelled", tone: "grey", help: "The project will not go ahead." },
};

export const PROJECT_TYPE: Record<ProjectType, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INDUSTRIAL: "Industrial",
  RENOVATION: "Renovation",
  INTERIOR: "Interior",
  INFRASTRUCTURE: "Infrastructure",
  OTHER: "Other",
};

export const WORK_STATUS: Record<WorkStatus, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: "Not started", tone: "grey" },
  PLANNING: { label: "Planning", tone: "violet" },
  IN_PROGRESS: { label: "In progress", tone: "blue" },
  DELAYED: { label: "Delayed", tone: "red" },
  COMPLETED: { label: "Completed", tone: "green" },
  ON_HOLD: { label: "On hold", tone: "amber" },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  LOW: { label: "Low", tone: "grey" },
  MEDIUM: { label: "Medium", tone: "blue" },
  HIGH: { label: "High", tone: "amber" },
  CRITICAL: { label: "Critical", tone: "red" },
};

export const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  CRITICAL: { label: "Urgent", tone: "red" },
  WARNING: { label: "Needs attention", tone: "amber" },
  SUCCESS: { label: "Good news", tone: "green" },
  INFO: { label: "For your information", tone: "blue" },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
  CHEQUE: "Cheque",
  CASH: "Cash",
  OTHER: "Other",
};

export const LABOUR_CATEGORY: Record<LabourCategory, string> = {
  MASON: "Mason",
  HELPER: "Helper",
  CARPENTER: "Carpenter",
  PAINTER: "Painter",
  ELECTRICIAN: "Electrician",
  PLUMBER: "Plumber",
  STEEL_WORKER: "Steel worker",
  TILE_WORKER: "Tile worker",
  GRANITE_WORKER: "Granite worker",
  MACHINE_OPERATOR: "Machine operator",
  OTHER: "Other",
};

export const COST_GROUP: Record<CostGroup, string> = {
  MATERIALS: "Materials",
  LABOUR: "Labour",
  ENGINEERS: "Engineers",
  CONTRACTORS: "Labour contractors",
  TRANSPORT: "Transport",
  FOOD_WELFARE: "Food & welfare",
  EQUIPMENT: "Equipment",
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  OTHER: "Other",
};

/** Tailwind classes for each tone (badges, dots, alert bars). */
export const TONE_CLASSES: Record<Tone, { badge: string; dot: string; bar: string; text: string }> = {
  red: {
    badge: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-400/30",
    dot: "bg-red-500",
    bar: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
  },
  amber: {
    badge: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-400/30",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  green: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-400/30",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  blue: {
    badge: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-400/30",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-400",
  },
  violet: {
    badge: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-400/30",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
  },
  grey: {
    badge: "bg-stone-100 text-stone-700 ring-stone-500/20 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-400/30",
    dot: "bg-stone-400",
    bar: "bg-stone-400",
    text: "text-stone-600 dark:text-stone-400",
  },
};

export function roleLabel(role: "ADMIN" | "MANAGER"): string {
  return role === "ADMIN" ? "Owner" : "Manager";
}

// ── Stage 2–5 vocabularies ───────────────────────────────────────────────────
import type {
  AccountKind,
  AttendanceStatus,
  ChequeStatus,
  DeliveryStatus,
  EquipmentStatus,
  EquipmentType,
  InventoryTxnType,
  InvoiceStatus,
  MaterialRequestStatus,
  PayeeType,
  PaymentPurpose,
  QuotationStatus,
  SupplierCategory,
  Weather,
  WorkOrderType,
} from "@/generated/prisma/enums";

export const SUPPLIER_CATEGORY: Record<SupplierCategory, string> = {
  HARDWARE: "Hardware",
  CEMENT: "Cement",
  STEEL: "Steel",
  SAND: "Sand",
  STONE: "Stone / aggregates",
  GRANITE: "Granite",
  TILES: "Tiles",
  ELECTRICAL: "Electrical",
  PLUMBING: "Plumbing",
  PAINT: "Paint",
  TRANSPORT: "Transport",
  EQUIPMENT_RENTAL: "Equipment rental",
  OTHER: "Other",
};

export const STOCK_STATUS: Record<"AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK", { label: string; tone: Tone }> = {
  AVAILABLE: { label: "Available", tone: "green" },
  LOW_STOCK: { label: "Low stock", tone: "amber" },
  OUT_OF_STOCK: { label: "Out of stock", tone: "red" },
};

export const INVENTORY_TXN: Record<InventoryTxnType, string> = {
  OPENING: "Opening stock",
  PURCHASE: "Received",
  USAGE: "Used",
  TRANSFER_IN: "Transferred in",
  TRANSFER_OUT: "Transferred out",
  DAMAGE: "Damaged / wasted",
  RETURN: "Returned to supplier",
  ADJUSTMENT: "Stock correction",
};

export const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; tone: Tone }> = {
  ORDERED: { label: "Ordered", tone: "blue" },
  PARTIALLY_DELIVERED: { label: "Part delivered", tone: "amber" },
  DELIVERED: { label: "Delivered", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "grey" },
};

export const PAY_STATUS: Record<"PAID" | "PARTIALLY_PAID" | "PENDING", { label: string; tone: Tone }> = {
  PAID: { label: "Paid", tone: "green" },
  PARTIALLY_PAID: { label: "Partly paid", tone: "amber" },
  PENDING: { label: "Not paid", tone: "red" },
};

export const REQUEST_STATUS: Record<MaterialRequestStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Waiting for approval", tone: "amber" },
  APPROVED: { label: "Approved", tone: "blue" },
  REJECTED: { label: "Rejected", tone: "grey" },
  ORDERED: { label: "Ordered", tone: "violet" },
  RECEIVED: { label: "Received", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "grey" },
};

export const ATTENDANCE: Record<AttendanceStatus, { label: string; short: string; tone: Tone }> = {
  PRESENT: { label: "Present", short: "P", tone: "green" },
  HALF_DAY: { label: "Half day", short: "½", tone: "amber" },
  ABSENT: { label: "Absent", short: "A", tone: "grey" },
};

export const WORK_ORDER_TYPE: Record<WorkOrderType, string> = {
  PIECE_RATE: "Piece rate (per unit)",
  LUMP_SUM: "Lump sum",
  DAILY_RATE: "Daily rate",
};

export const PAYEE_TYPE: Record<PayeeType, string> = {
  SUPPLIER: "Supplier",
  LABOUR: "Worker",
  ENGINEER: "Engineer",
  CONTRACTOR: "Labour contractor",
  OTHER: "Other",
};

export const PAYMENT_PURPOSE: Record<PaymentPurpose, string> = {
  PURCHASE: "Material bill",
  WAGES: "Wages",
  SALARY: "Salary",
  ADVANCE: "Advance",
  CONTRACTOR_BILL: "Contractor bill",
  OTHER: "Other payment",
};

export const QUOTATION_STATUS: Record<QuotationStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "grey" },
  SENT: { label: "Sent", tone: "blue" },
  ACCEPTED: { label: "Accepted", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  EXPIRED: { label: "Expired", tone: "amber" },
};

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "grey" },
  ISSUED: { label: "Issued", tone: "blue" },
  CANCELLED: { label: "Cancelled", tone: "grey" },
};

export const CHEQUE_STATUS: Record<ChequeStatus, { label: string; tone: Tone }> = {
  RECEIVED: { label: "In hand", tone: "blue" },
  DEPOSITED: { label: "Deposited", tone: "violet" },
  CLEARED: { label: "Cleared", tone: "green" },
  BOUNCED: { label: "Bounced", tone: "red" },
  CANCELLED: { label: "Cancelled", tone: "grey" },
};

export const ACCOUNT_KIND: Record<AccountKind, string> = {
  BANK: "Bank account",
  CASH: "Office cash",
  SITE_CASH: "Site cash (petty cash)",
};

export const EQUIPMENT_TYPE: Record<EquipmentType, string> = {
  CONCRETE_MIXER: "Concrete mixer",
  VIBRATOR: "Vibrator",
  DRILLING_MACHINE: "Drilling machine",
  CUTTING_MACHINE: "Cutting machine",
  EXCAVATOR: "Excavator",
  JCB: "JCB",
  CRANE: "Crane",
  GENERATOR: "Generator",
  OTHER: "Other",
};

export const EQUIPMENT_STATUS: Record<EquipmentStatus, { label: string; tone: Tone }> = {
  AVAILABLE: { label: "Available", tone: "green" },
  IN_USE: { label: "In use", tone: "blue" },
  UNDER_MAINTENANCE: { label: "Under repair", tone: "amber" },
  OUT_OF_ORDER: { label: "Out of order", tone: "red" },
  RETURNED: { label: "Returned", tone: "grey" },
};

export const WEATHER: Record<Weather, string> = {
  SUNNY: "Sunny",
  CLOUDY: "Cloudy",
  RAINY: "Rainy",
  HEAVY_RAIN: "Heavy rain",
  OTHER: "Other",
};

export function options<K extends string>(record: Record<K, string | { label: string }>): { value: K; label: string }[] {
  return (Object.keys(record) as K[]).map((k) => {
    const v = record[k];
    return { value: k, label: typeof v === "string" ? v : v.label };
  });
}

export const INVOICE_KIND: Record<"RUNNING" | "FINAL" | "ADVANCE" | "RETENTION_RELEASE", string> = {
  RUNNING: "Running bill",
  FINAL: "Final bill",
  ADVANCE: "Advance request",
  RETENTION_RELEASE: "Retention release",
};

export const VARIATION_STATUS: Record<"PROPOSED" | "APPROVED" | "REJECTED", { label: string; tone: Tone }> = {
  PROPOSED: { label: "Waiting for client", tone: "amber" },
  APPROVED: { label: "Approved", tone: "green" },
  REJECTED: { label: "Rejected", tone: "grey" },
};
