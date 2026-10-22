import "server-only";
import Decimal from "decimal.js";
import { toDbDate, type ISODate } from "@/lib/dates";
import { COST_GROUP, PAYEE_TYPE, PAYMENT_METHOD, PAYMENT_PURPOSE, PROJECT_STATUS, STOCK_STATUS } from "@/lib/labels";
import { sumPaise } from "@/lib/money";
import { can, type Permission } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { accessibleProjectIds } from "@/server/scope";
import { payablesDetail } from "@/server/services/accounts";
import { listInvoices, receivables } from "@/server/services/billing";
import { ledgerEntries, listExpenses, listPaymentsMade } from "@/server/services/money-lists";
import { loadProjectMoney } from "@/server/services/project-money";
import { listPurchases } from "@/server/services/purchases";
import { stockLevels } from "@/server/services/stock";

export type ReportColumn = {
  key: string;
  label: string;
  type: "text" | "money" | "date" | "number";
  /** Add up this column in the footer. */
  total?: boolean;
  hide?: "sm" | "md" | "lg";
};

export type ReportValue = string | number | bigint | null;
export type ReportRow = Record<string, ReportValue> & { _href?: string | null };
export type ReportResult = { columns: ReportColumn[]; rows: ReportRow[]; note?: string };
export type ReportParams = { from: ISODate | null; to: ISODate | null; projectId?: string };

export type ReportDef = {
  key: string;
  title: string;
  description: string;
  group: "Money" | "Projects" | "Materials" | "Labour";
  /** Any one of these is enough to open the report. */
  permission: Permission[];
  /** Which filters the report uses. */
  period: boolean;
  project: boolean;
  defaultPeriod?: "this-month" | "this-fy" | "all";
  run: (user: CurrentUser, p: ReportParams) => Promise<ReportResult>;
};

function dateWhere(p: ReportParams, field = "date") {
  if (!p.from && !p.to) return {};
  return { [field]: { ...(p.from ? { gte: toDbDate(p.from) } : {}), ...(p.to ? { lte: toDbDate(p.to) } : {}) } };
}

async function projectScope(user: CurrentUser, projectId?: string) {
  const ids = await accessibleProjectIds(user);
  if (projectId) return ids === null || ids.includes(projectId) ? [projectId] : [];
  return ids;
}

const REPORTS: ReportDef[] = [
  {
    key: "project-profit",
    title: "Project profit and loss",
    description: "Value, money received, costs by head and expected profit for every project.",
    group: "Projects",
    permission: ["projects.viewMoney"],
    period: false,
    project: false,
    async run(user) {
      const ids = await accessibleProjectIds(user);
      const projects = await db.project.findMany({
        where: { deletedAt: null, status: { not: "CANCELLED" }, ...(ids === null ? {} : { id: { in: ids } }) },
        select: { id: true, name: true, status: true, client: { select: { name: true } } },
        orderBy: { name: "asc" },
      });
      const money = await loadProjectMoney(projects.map((p) => p.id));
      return {
        columns: [
          { key: "project", label: "Project", type: "text" },
          { key: "status", label: "Status", type: "text", hide: "md" },
          { key: "value", label: "Value", type: "money", total: true },
          { key: "received", label: "Received", type: "money", total: true },
          { key: "materials", label: "Materials", type: "money", total: true, hide: "lg" },
          { key: "labour", label: "Labour", type: "money", total: true, hide: "lg" },
          { key: "contractors", label: "Contractors", type: "money", total: true, hide: "lg" },
          { key: "otherCosts", label: "Other costs", type: "money", total: true, hide: "lg" },
          { key: "spent", label: "Spent", type: "money", total: true },
          { key: "profit", label: "Expected profit", type: "money", total: true },
        ],
        rows: projects.map((p) => {
          const m = money.get(p.id)!;
          return {
            _href: `/projects/${p.id}/money`,
            project: `${p.name} (${p.client.name})`,
            status: PROJECT_STATUS[p.status].label,
            value: m.money.projectValuePaise,
            received: m.money.receivedPaise,
            materials: m.costs.materials,
            labour: m.costs.labour,
            contractors: m.costs.contractors,
            otherCosts: m.costs.engineers + m.costs.transport + m.costs.foodWelfare + m.costs.equipment + m.costs.other,
            spent: m.money.spentPaise,
            profit: m.money.estimatedProfitPaise,
          };
        }),
        note: "Spent counts bills and wages when they are incurred, whether paid or not. Expected profit = value − estimated total cost.",
      };
    },
  },
  {
    key: "client-outstanding",
    title: "Client outstanding",
    description: "What each client still owes, billed and overdue amounts, and retention held.",
    group: "Money",
    permission: ["projects.viewMoney"],
    period: false,
    project: false,
    async run(user) {
      const rows = await receivables(user);
      return {
        columns: [
          { key: "project", label: "Project", type: "text" },
          { key: "client", label: "Client", type: "text" },
          { key: "phone", label: "Phone", type: "text", hide: "lg" },
          { key: "value", label: "Value", type: "money", total: true, hide: "md" },
          { key: "received", label: "Received", type: "money", total: true },
          { key: "billedDue", label: "Billed, not paid", type: "money", total: true },
          { key: "overdue", label: "Overdue", type: "money", total: true },
          { key: "pending", label: "Total pending", type: "money", total: true },
          { key: "retention", label: "Retention", type: "money", total: true, hide: "lg" },
        ],
        rows: rows.map((r) => ({
          _href: `/projects/${r.id}/money`,
          project: r.name,
          client: r.client.name,
          phone: r.client.phone,
          value: r.valuePaise,
          received: r.receivedPaise,
          billedDue: r.billedNotReceivedPaise,
          overdue: r.overduePaise,
          pending: r.pendingPaise,
          retention: r.retentionPaise,
        })),
      };
    },
  },
  {
    key: "supplier-payables",
    title: "Supplier dues",
    description: "Unpaid supplier bills with due dates.",
    group: "Money",
    permission: ["payments.record", "bank.viewBalances"],
    period: false,
    project: false,
    async run(user) {
      const p = await payablesDetail(user);
      return {
        columns: [
          { key: "bill", label: "Bill", type: "text" },
          { key: "supplier", label: "Supplier", type: "text" },
          { key: "due", label: "Due date", type: "date" },
          { key: "balance", label: "Balance", type: "money", total: true },
        ],
        rows: p.billsDue.map((b) => ({ _href: `/materials/purchases/${b.id}`, bill: b.number, supplier: b.supplier.name, due: b.dueDate, balance: b.balancePaise })),
        note: "Bills without a due date are counted in the supplier totals on the We owe page.",
      };
    },
  },
  {
    key: "purchases",
    title: "Purchases register",
    description: "Every material bill in the period with tax, paid and balance.",
    group: "Materials",
    permission: ["purchases.record", "projects.viewMoney"],
    period: true,
    project: true,
    defaultPeriod: "this-month",
    async run(user, p) {
      const rows = (await listPurchases(user, { from: p.from, to: p.to, location: p.projectId })).filter((r) => r.deliveryStatus !== "CANCELLED");
      return {
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "bill", label: "Bill", type: "text" },
          { key: "supplierBill", label: "Supplier bill no.", type: "text", hide: "lg" },
          { key: "supplier", label: "Supplier", type: "text" },
          { key: "site", label: "Site", type: "text", hide: "md" },
          { key: "tax", label: "GST", type: "money", total: true, hide: "md" },
          { key: "total", label: "Total", type: "money", total: true },
          { key: "paid", label: "Paid", type: "money", total: true, hide: "sm" },
          { key: "balance", label: "Balance", type: "money", total: true },
        ],
        rows: rows.map((r) => ({
          _href: `/materials/purchases/${r.id}`,
          date: r.date,
          bill: r.number,
          supplierBill: r.invoiceNumber,
          supplier: r.supplier.name,
          site: r.project?.name ?? "Main store",
          tax: r.taxPaise,
          total: r.totalPaise,
          paid: r.paidPaise,
          balance: r.balancePaise,
        })),
      };
    },
  },
  {
    key: "expenses-by-category",
    title: "Expenses by category",
    description: "Total spent under each expense category in the period.",
    group: "Money",
    permission: ["projects.viewMoney", "expenses.record"],
    period: true,
    project: true,
    defaultPeriod: "this-month",
    async run(user, p) {
      const rows = await listExpenses(user, { from: p.from, to: p.to, projectId: p.projectId });
      const by = new Map<string, { category: string; head: string; count: number; total: bigint }>();
      for (const r of rows) {
        const row = by.get(r.categoryId) ?? { category: r.category.name, head: COST_GROUP[r.category.group], count: 0, total: 0n };
        row.total += r.amountPaise;
        row.count += r.reversalOfId ? 0 : 1;
        by.set(r.categoryId, row);
      }
      return {
        columns: [
          { key: "category", label: "Category", type: "text" },
          { key: "head", label: "Cost head", type: "text", hide: "sm" },
          { key: "count", label: "Entries", type: "number" },
          { key: "total", label: "Amount", type: "money", total: true },
        ],
        rows: [...by.values()].sort((a, b) => (b.total > a.total ? 1 : -1)),
      };
    },
  },
  {
    key: "expenses",
    title: "Expense register",
    description: "Every expense in the period.",
    group: "Money",
    permission: ["projects.viewMoney", "expenses.record"],
    period: true,
    project: true,
    defaultPeriod: "this-month",
    async run(user, p) {
      const rows = await listExpenses(user, { from: p.from, to: p.to, projectId: p.projectId });
      return {
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "number", label: "No.", type: "text", hide: "sm" },
          { key: "description", label: "What", type: "text" },
          { key: "category", label: "Category", type: "text", hide: "md" },
          { key: "project", label: "For", type: "text", hide: "md" },
          { key: "paidTo", label: "Paid to", type: "text", hide: "lg" },
          { key: "method", label: "Paid by", type: "text", hide: "lg" },
          { key: "amount", label: "Amount", type: "money", total: true },
        ],
        rows: rows.map((r) => ({
          date: r.date,
          number: r.number,
          description: r.description,
          category: r.category.name,
          project: r.project?.name ?? "Office",
          paidTo: r.paidTo,
          method: `${PAYMENT_METHOD[r.method]} · ${r.account.name}`,
          amount: r.amountPaise,
        })),
      };
    },
  },
  {
    key: "payments-made",
    title: "Payments made",
    description: "Money paid to suppliers, workers, engineers and contractors.",
    group: "Money",
    permission: ["payments.record", "bank.viewBalances"],
    period: true,
    project: true,
    defaultPeriod: "this-month",
    async run(user, p) {
      const rows = await listPaymentsMade(user, { from: p.from, to: p.to, projectId: p.projectId });
      return {
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "number", label: "No.", type: "text", hide: "sm" },
          { key: "payee", label: "Paid to", type: "text" },
          { key: "type", label: "Type", type: "text", hide: "md" },
          { key: "purpose", label: "For", type: "text", hide: "md" },
          { key: "project", label: "Project", type: "text", hide: "lg" },
          { key: "method", label: "How", type: "text", hide: "lg" },
          { key: "amount", label: "Amount", type: "money", total: true },
        ],
        rows: rows.map((r) => ({
          _href: r.payeeHref,
          date: r.date,
          number: r.number,
          payee: r.payee,
          type: PAYEE_TYPE[r.payeeType],
          purpose: PAYMENT_PURPOSE[r.purpose],
          project: r.project?.name ?? null,
          method: `${PAYMENT_METHOD[r.method]} · ${r.account.name}${r.reference ? ` · ${r.reference}` : ""}`,
          amount: r.amountPaise,
        })),
      };
    },
  },
  {
    key: "ledger",
    title: "Cash book (all transactions)",
    description: "Every entry in every bank and cash account.",
    group: "Money",
    permission: ["bank.viewBalances"],
    period: true,
    project: false,
    defaultPeriod: "this-month",
    async run(user, p) {
      const rows = await ledgerEntries(user, { from: p.from, to: p.to });
      return {
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "account", label: "Account", type: "text" },
          { key: "details", label: "Details", type: "text" },
          { key: "reference", label: "Reference", type: "text", hide: "md" },
          { key: "in", label: "In", type: "money", total: true },
          { key: "out", label: "Out", type: "money", total: true },
        ],
        rows: rows.map((r) => ({
          date: r.date,
          account: r.account.name,
          details: r.description,
          reference: r.reference,
          in: r.amountPaise > 0n ? r.amountPaise : null,
          out: r.amountPaise < 0n ? -r.amountPaise : null,
        })),
      };
    },
  },
  {
    key: "gst-sales",
    title: "GST on client bills",
    description: "Taxable value and CGST / SGST / IGST on bills issued in the period — for your GST return.",
    group: "Money",
    permission: ["projects.viewMoney", "quotations.manage"],
    period: true,
    project: false,
    defaultPeriod: "this-month",
    async run(user, p) {
      const rows = (await listInvoices(user, { status: "ISSUED" })).filter((i) => (!p.from || i.date >= p.from) && (!p.to || i.date <= p.to));
      return {
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "bill", label: "Bill", type: "text" },
          { key: "client", label: "Client", type: "text" },
          { key: "gstin", label: "Client GSTIN", type: "text", hide: "md" },
          { key: "taxable", label: "Taxable", type: "money", total: true },
          { key: "cgst", label: "CGST", type: "money", total: true },
          { key: "sgst", label: "SGST", type: "money", total: true },
          { key: "igst", label: "IGST", type: "money", total: true },
          { key: "total", label: "Total", type: "money", total: true },
        ],
        rows: await Promise.all(
          rows.map(async (i) => {
            const client = await db.client.findUnique({ where: { id: i.clientId }, select: { gstin: true } });
            const half = i.taxMode === "CGST_SGST" ? i.taxPaise / 2n : 0n;
            return {
              _href: `/clients/bills/${i.id}`,
              date: i.date,
              bill: `${i.number}${i.raNumber ? ` (RA-${i.raNumber})` : ""}`,
              client: i.client.name,
              gstin: client?.gstin ?? null,
              taxable: i.subtotalPaise,
              cgst: half,
              sgst: i.taxMode === "CGST_SGST" ? i.taxPaise - half : 0n,
              igst: i.taxMode === "IGST" ? i.taxPaise : 0n,
              total: i.totalPaise,
            };
          }),
        ),
        note: "Check these figures with your accountant before filing.",
      };
    },
  },
  {
    key: "stock",
    title: "Stock by site",
    description: "What is left of each material at each site and the main store, with its value.",
    group: "Materials",
    permission: ["materials.record", "materials.manage", "purchases.record"],
    period: false,
    project: true,
    async run(user, p) {
      const rows = await stockLevels(await projectScope(user, p.projectId));
      return {
        columns: [
          { key: "material", label: "Material", type: "text" },
          { key: "site", label: "Site", type: "text" },
          { key: "remaining", label: "Remaining", type: "text" },
          { key: "used", label: "Used so far", type: "text", hide: "md" },
          { key: "status", label: "Status", type: "text" },
          { key: "value", label: "Value", type: "money", total: true },
        ],
        rows: rows.map((r) => ({
          _href: `/materials/${r.materialId}`,
          material: r.materialName,
          site: r.projectName,
          remaining: `${r.remaining} ${r.unit}`,
          used: `${r.used} ${r.unit}`,
          status: STOCK_STATUS[r.status].label,
          value: r.valuePaise,
        })),
      };
    },
  },
  {
    key: "material-usage",
    title: "Material used",
    description: "How much of each material was used at each site in the period.",
    group: "Materials",
    permission: ["materials.record", "materials.manage", "projects.viewMoney"],
    period: true,
    project: true,
    defaultPeriod: "this-month",
    async run(user, p) {
      const scope = await projectScope(user, p.projectId);
      const rows = await db.inventoryTransaction.groupBy({
        by: ["materialId", "projectId"],
        where: { type: { in: ["USAGE", "DAMAGE"] }, ...dateWhere(p), ...(scope === null ? {} : { projectId: { in: scope } }) },
        _sum: { quantity: true },
        _count: { _all: true },
      });
      const [materials, projects] = await Promise.all([
        db.material.findMany({ where: { id: { in: rows.map((r) => r.materialId) } }, select: { id: true, name: true, unit: true } }),
        db.project.findMany({ where: { id: { in: rows.map((r) => r.projectId).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
      ]);
      return {
        columns: [
          { key: "material", label: "Material", type: "text" },
          { key: "site", label: "Site", type: "text" },
          { key: "quantity", label: "Used", type: "text" },
          { key: "entries", label: "Entries", type: "number", hide: "sm" },
        ],
        rows: rows.map((r) => {
          const m = materials.find((x) => x.id === r.materialId);
          return {
            _href: `/materials/${r.materialId}`,
            material: m?.name ?? "—",
            site: projects.find((x) => x.id === r.projectId)?.name ?? "Main store",
            quantity: `${new Decimal(r._sum.quantity?.toString() ?? "0").abs().toString()} ${m?.unit ?? ""}`,
            entries: r._count._all,
          };
        }),
      };
    },
  },
  {
    key: "attendance",
    title: "Attendance and wages earned",
    description: "Days present, half days and wages earned per worker in the period.",
    group: "Labour",
    permission: ["wages.view", "attendance.record"],
    period: true,
    project: true,
    defaultPeriod: "this-month",
    async run(user, p) {
      const scope = await projectScope(user, p.projectId);
      const rows = await db.attendance.groupBy({
        by: ["labourId", "status"],
        where: { labourId: { not: null }, ...dateWhere(p), ...(scope === null ? {} : { projectId: { in: scope } }) },
        _count: { _all: true },
        _sum: { wagePaise: true, adjustmentPaise: true, overtimeHours: true },
      });
      const workers = await db.labour.findMany({ where: { id: { in: rows.map((r) => r.labourId!) } }, select: { id: true, name: true, code: true, category: true } });
      const showWages = can(user, "wages.view");
      const by = new Map<string, ReportRow>();
      for (const r of rows) {
        const w = workers.find((x) => x.id === r.labourId);
        const row = by.get(r.labourId!) ?? { _href: `/labour/${r.labourId}`, worker: w ? `${w.name} (${w.code})` : "—", present: 0, half: 0, absent: 0, overtime: 0, earned: 0n };
        if (r.status === "PRESENT") row.present = (row.present as number) + r._count._all;
        if (r.status === "HALF_DAY") row.half = (row.half as number) + r._count._all;
        if (r.status === "ABSENT") row.absent = (row.absent as number) + r._count._all;
        row.overtime = (row.overtime as number) + Number(r._sum.overtimeHours ?? 0);
        row.earned = (row.earned as bigint) + (r._sum.wagePaise ?? 0n) + (r._sum.adjustmentPaise ?? 0n);
        by.set(r.labourId!, row);
      }
      return {
        columns: [
          { key: "worker", label: "Worker", type: "text" },
          { key: "present", label: "Present", type: "number", total: true },
          { key: "half", label: "Half days", type: "number", total: true },
          { key: "absent", label: "Absent", type: "number", total: true, hide: "sm" },
          { key: "overtime", label: "OT hours", type: "number", total: true, hide: "md" },
          ...(showWages ? [{ key: "earned", label: "Wages earned", type: "money" as const, total: true }] : []),
        ],
        rows: [...by.values()].sort((a, b) => String(a.worker).localeCompare(String(b.worker))),
      };
    },
  },
];

export function reportsFor(user: CurrentUser): ReportDef[] {
  return REPORTS.filter((r) => r.permission.some((k) => can(user, k)));
}

export function findReport(user: CurrentUser, key: string): ReportDef | null {
  return reportsFor(user).find((r) => r.key === key) ?? null;
}

/** Totals for the footer, for columns marked `total`. */
export function reportTotals(result: ReportResult): Record<string, ReportValue> {
  const out: Record<string, ReportValue> = {};
  for (const c of result.columns.filter((c) => c.total)) {
    if (c.type === "money") out[c.key] = sumPaise(result.rows.map((r) => (typeof r[c.key] === "bigint" ? (r[c.key] as bigint) : 0n)));
    else out[c.key] = Math.round(result.rows.reduce((s, r) => s + (typeof r[c.key] === "number" ? (r[c.key] as number) : 0), 0) * 100) / 100;
  }
  return out;
}

