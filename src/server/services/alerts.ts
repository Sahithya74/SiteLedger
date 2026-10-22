import "server-only";
import Decimal from "decimal.js";
import type { Priority } from "@/generated/prisma/enums";
import { addDays, diffDays, formatDate, fromDbDate, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { formatINR, sumPaise } from "@/lib/money";
import { formatQuantity } from "@/lib/format";
import { allocatePayments } from "@/lib/receivables";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { accessibleProjectIds, projectIdFilter, projectWhere } from "@/server/scope";
import { loadWorkStats } from "@/server/services/project-money";
import { stockLevels } from "@/server/services/stock";
import { pendingWagesSummary } from "@/server/services/payables";

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO" | "SUCCESS";

export type AttentionItem = {
  key: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href?: string;
  /** Used to rank items of the same severity (bigger first). */
  weight: number;
};

const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2, SUCCESS: 3 };

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function daysLateText(days: number) {
  return days === 1 ? "1 day late" : `${days} days late`;
}

/**
 * Builds "Things that need your attention" from live data. Nothing here is
 * stored — it always reflects the current state of the records.
 */
export async function getAttentionItems(user: CurrentUser, today: ISODate = todayIST()): Promise<AttentionItem[]> {
  const ids = await accessibleProjectIds(user);
  const inScope = projectIdFilter(ids);
  const showMoney = can(user, "projects.viewMoney");
  const showWages = can(user, "wages.view");
  const todayDb = toDbDate(today);
  const tomorrow = addDays(today, 1);
  const soon = toDbDate(addDays(today, 3));
  const items: AttentionItem[] = [];

  const visibleProjects = await db.project.findMany({
    where: { ...projectWhere(user), archivedAt: null, status: { notIn: ["CANCELLED"] } },
    select: { id: true, name: true, status: true, expectedEndDate: true },
  });
  const projectIds = visibleProjects.map((p) => p.id);

  const [invoices, overdueWork, delayedWork, issues, tasks, purchasesDue, deliveries, cheques, requests, recentPayments, workStats] =
    await Promise.all([
      showMoney
        ? db.invoice.findMany({
            where: { ...inScope, status: "ISSUED" },
            select: {
              id: true,
              number: true,
              date: true,
              dueDate: true,
              totalPaise: true,
              retentionPaise: true,
              projectId: true,
              project: { select: { id: true, name: true } },
              client: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      db.workItem.findMany({
        where: {
          deletedAt: null,
          status: { not: "COMPLETED" },
          expectedEndDate: { lt: todayDb },
          children: { none: { deletedAt: null } },
          project: { ...projectWhere(user), archivedAt: null, status: { notIn: ["CANCELLED", "COMPLETED", "ON_HOLD"] } },
        },
        select: {
          id: true,
          name: true,
          priority: true,
          expectedEndDate: true,
          pendingReason: true,
          parent: { select: { name: true } },
          project: { select: { id: true, name: true } },
          engineer: { select: { name: true } },
        },
      }),
      db.workItem.findMany({
        where: {
          deletedAt: null,
          status: "DELAYED",
          OR: [{ expectedEndDate: null }, { expectedEndDate: { gte: todayDb } }],
          project: { ...projectWhere(user), archivedAt: null },
        },
        select: { id: true, name: true, pendingReason: true, project: { select: { id: true, name: true } } },
      }),
      db.issue.findMany({
        where: { ...inScope, status: { not: "RESOLVED" }, severity: { in: ["HIGH", "CRITICAL"] } },
        select: { id: true, title: true, severity: true, reportedOn: true, project: { select: { id: true, name: true } } },
      }),
      db.engineerTask.findMany({
        where: { ...inScope, status: { not: "COMPLETED" }, dueDate: { lte: toDbDate(tomorrow) } },
        select: {
          id: true,
          title: true,
          kind: true,
          dueDate: true,
          engineer: { select: { name: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      showMoney
        ? db.purchase.findMany({
            where: { ...inScope, cancelledAt: null, dueDate: { lte: toDbDate(tomorrow) } },
            select: {
              id: true,
              number: true,
              dueDate: true,
              totalPaise: true,
              supplier: { select: { name: true } },
              project: { select: { id: true, name: true } },
              payments: { select: { amountPaise: true } },
            },
          })
        : Promise.resolve([]),
      db.purchase.findMany({
        where: {
          ...inScope,
          cancelledAt: null,
          deliveryStatus: { in: ["ORDERED", "PARTIALLY_DELIVERED"] },
          expectedDelivery: { lte: toDbDate(tomorrow) },
        },
        select: {
          id: true,
          number: true,
          expectedDelivery: true,
          supplier: { select: { name: true } },
          project: { select: { id: true, name: true } },
          items: { select: { quantity: true, unit: true, material: { select: { name: true } } } },
        },
      }),
      showMoney
        ? db.cheque.findMany({
            where: { ...inScope, direction: "RECEIVED", status: "RECEIVED", chequeDate: { lte: toDbDate(tomorrow) } },
            select: { id: true, chequeNumber: true, chequeDate: true, amountPaise: true, partyName: true },
          })
        : Promise.resolve([]),
      db.materialRequest.count({ where: { ...inScope, status: "PENDING" } }),
      showMoney
        ? db.clientPayment.findMany({
            where: { ...inScope, reversalOfId: null, date: { gte: toDbDate(addDays(today, -2)) } },
            orderBy: { date: "desc" },
            take: 3,
            select: { id: true, amountPaise: true, date: true, client: { select: { name: true } }, project: { select: { id: true, name: true } } },
          })
        : Promise.resolve([]),
      loadWorkStats(projectIds, today),
    ]);

  // 1. Client payments overdue / due soon. Everything the client paid on the
  //    project (advances too) is applied to the oldest bills first.
  const paidByProject = new Map<string, bigint>();
  if (invoices.length) {
    const paid = await db.clientPayment.groupBy({
      by: ["projectId"],
      where: { projectId: { in: [...new Set(invoices.map((i) => i.projectId))] } },
      _sum: { amountPaise: true, tdsDeductedPaise: true },
    });
    for (const p of paid) paidByProject.set(p.projectId, (p._sum.amountPaise ?? 0n) + (p._sum.tdsDeductedPaise ?? 0n));
  }
  const agedBills = [...new Set(invoices.map((i) => i.projectId))].flatMap((projectId) =>
    allocatePayments(
      invoices
        .filter((i) => i.projectId === projectId)
        .map((i) => ({ ...i, date: fromDbDate(i.date), dueDate: i.dueDate ? fromDbDate(i.dueDate) : null })),
      paidByProject.get(projectId) ?? 0n,
    ),
  );
  for (const inv of agedBills) {
    const outstanding = inv.outstandingPaise;
    if (outstanding <= 0n || !inv.dueDate || inv.dueDate > fromDbDate(soon)) continue;
    const days = diffDays(today, inv.dueDate);
    items.push({
      key: `invoice:${inv.id}`,
      severity: days > 0 ? "CRITICAL" : "WARNING",
      title: days > 0 ? `Client payment of ${formatINR(outstanding)} overdue` : `Client payment of ${formatINR(outstanding)} due ${days === 0 ? "today" : `on ${formatDate(inv.dueDate)}`}`,
      detail: `${inv.client.name} · ${inv.project.name} · bill ${inv.number}${days > 0 ? ` · ${daysLateText(days)}` : ""}`,
      href: `/projects/${inv.project.id}`,
      weight: Number(outstanding / 100n),
    });
  }

  // 2. Overdue work
  const priorityWeight: Record<Priority, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  for (const w of overdueWork) {
    const days = diffDays(today, fromDbDate(w.expectedEndDate!));
    const serious = w.priority === "CRITICAL" || w.priority === "HIGH" || days > 7;
    items.push({
      key: `work:${w.id}`,
      severity: serious ? "CRITICAL" : "WARNING",
      title: `${w.name}${w.parent ? ` (${w.parent.name})` : ""} work delayed by ${plural(days, "day")}`,
      detail: `${w.project.name}${w.engineer ? ` · ${w.engineer.name}` : ""}${w.pendingReason ? ` · ${w.pendingReason}` : ""}`,
      href: `/projects/${w.project.id}/work`,
      weight: days * 10 + priorityWeight[w.priority],
    });
  }
  for (const w of delayedWork) {
    items.push({
      key: `delayed:${w.id}`,
      severity: "WARNING",
      title: `${w.name} is marked as delayed`,
      detail: `${w.project.name}${w.pendingReason ? ` · ${w.pendingReason}` : ""}`,
      href: `/projects/${w.project.id}/work`,
      weight: 1,
    });
  }

  // 3. Projects behind schedule or past their completion date
  for (const p of visibleProjects) {
    if (p.status === "COMPLETED") continue;
    if (p.expectedEndDate && fromDbDate(p.expectedEndDate) < today && p.status !== "PLANNING") {
      const days = diffDays(today, fromDbDate(p.expectedEndDate));
      items.push({
        key: `project-late:${p.id}`,
        severity: "CRITICAL",
        title: `${p.name} is past its completion date`,
        detail: `Was due ${formatDate(p.expectedEndDate)} · ${daysLateText(days)}`,
        href: `/projects/${p.id}`,
        weight: days * 20,
      });
      continue;
    }
    const health = workStats.get(p.id)?.health;
    if (health?.state === "behind" && health.planned !== null) {
      items.push({
        key: `project-behind:${p.id}`,
        severity: "WARNING",
        title: `${p.name} is behind schedule`,
        detail: `Should be about ${health.planned}% done by now, actually ${health.actual}%`,
        href: `/projects/${p.id}/work`,
        weight: health.gap ?? 0,
      });
    }
  }

  // 4. Material stock — only at sites where work is running, and only for
  //    materials that have a reorder level set.
  const runningSites = new Set(visibleProjects.filter((p) => p.status === "ACTIVE" || p.status === "DELAYED").map((p) => p.id));
  const stock = await stockLevels(ids);
  for (const s of stock) {
    if (s.status === "AVAILABLE" || !s.projectId || !runningSites.has(s.projectId)) continue;
    if (new Decimal(s.reorderLevel).lte(0)) continue;
    const out = s.status === "OUT_OF_STOCK";
    const left = new Decimal(s.remaining).toDecimalPlaces(2);
    const reorder = new Decimal(s.reorderLevel);
    items.push({
      key: `stock:${s.materialId}:${s.projectId}`,
      severity: out ? "CRITICAL" : "WARNING",
      title: out ? `${s.materialName} has run out` : `${s.materialName} stock is low`,
      detail: `${s.projectName} · ${formatQuantity(left, s.unit)} left (reorder at ${formatQuantity(reorder, s.unit)})`,
      href: `/projects/${s.projectId}`,
      weight: out ? 100 : 50,
    });
  }

  // 5. Wages pending
  if (showWages) {
    const wages = await pendingWagesSummary(ids);
    if (wages.workers > 0) {
      items.push({
        key: "wages-pending",
        severity: "WARNING",
        title: `${plural(wages.workers, "worker")}' wages pending`,
        detail: `${formatINR(wages.totalPaise)} to pay`,
        weight: Number(wages.totalPaise / 100n),
      });
    }
  }

  // 6. Supplier payments due
  for (const p of purchasesDue) {
    const outstanding = p.totalPaise - sumPaise(p.payments.map((x) => x.amountPaise));
    if (outstanding <= 0n || !p.dueDate) continue;
    const days = diffDays(fromDbDate(p.dueDate), today);
    items.push({
      key: `supplier-due:${p.id}`,
      severity: days < 0 ? "CRITICAL" : "WARNING",
      title:
        days < 0
          ? `Supplier payment of ${formatINR(outstanding)} overdue`
          : `Supplier payment of ${formatINR(outstanding)} due ${days === 0 ? "today" : "tomorrow"}`,
      detail: `${p.supplier.name} · ${p.number}${p.project ? ` · ${p.project.name}` : ""}${days < 0 ? ` · ${daysLateText(-days)}` : ""}`,
      weight: Number(outstanding / 100n),
    });
  }

  // 7. Deliveries expected / late
  for (const d of deliveries) {
    const days = diffDays(fromDbDate(d.expectedDelivery!), today);
    const what = d.items
      .slice(0, 2)
      .map((i) => `${formatQuantity(i.quantity.toString(), i.unit)} ${i.material.name}`)
      .join(", ");
    items.push({
      key: `delivery:${d.id}`,
      severity: days < 0 ? "WARNING" : "INFO",
      title: days < 0 ? `Material delivery is late (${daysLateText(-days)})` : `Material delivery expected ${days === 0 ? "today" : "tomorrow"}`,
      detail: `${what}${d.items.length > 2 ? "…" : ""} from ${d.supplier.name}${d.project ? ` · ${d.project.name}` : ""}`,
      href: d.project ? `/projects/${d.project.id}` : undefined,
      weight: days < 0 ? -days : 0,
    });
  }

  // 8. Site issues
  for (const i of issues) {
    items.push({
      key: `issue:${i.id}`,
      severity: i.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
      title: `Site issue: ${i.title}`,
      detail: `${i.project.name} · reported ${formatDate(i.reportedOn)}`,
      href: `/projects/${i.project.id}`,
      weight: i.severity === "CRITICAL" ? 10 : 5,
    });
  }

  // 9. Engineer tasks due / overdue
  for (const t of tasks) {
    const days = t.dueDate ? diffDays(fromDbDate(t.dueDate), today) : 0;
    items.push({
      key: `task:${t.id}`,
      severity: days < 0 ? "WARNING" : "INFO",
      title: days < 0 ? `Engineer task overdue: ${t.title}` : `${t.title} ${days === 0 ? "today" : "tomorrow"}`,
      detail: `${t.engineer.name} · ${t.project.name}`,
      href: `/projects/${t.project.id}`,
      weight: -days,
    });
  }

  // 10. Cheques ready to deposit
  for (const c of cheques) {
    items.push({
      key: `cheque:${c.id}`,
      severity: "INFO",
      title: `Cheque of ${formatINR(c.amountPaise)} can be deposited`,
      detail: `${c.partyName} · cheque ${c.chequeNumber} dated ${formatDate(c.chequeDate)}`,
      weight: Number(c.amountPaise / 100n),
    });
  }

  // 11. Material requests waiting for approval
  if (requests > 0 && user.role === "ADMIN") {
    items.push({
      key: "material-requests",
      severity: "INFO",
      title: `${plural(requests, "material request")} waiting for your approval`,
      detail: "Sent from site",
      weight: requests,
    });
  }

  // 12. Good news
  for (const p of recentPayments) {
    items.push({
      key: `received:${p.id}`,
      severity: "SUCCESS",
      title: `Payment received: ${formatINR(p.amountPaise)}`,
      detail: `${p.client.name} · ${p.project.name} · ${formatDate(p.date)}`,
      href: `/projects/${p.project.id}`,
      weight: Number(p.amountPaise / 100n),
    });
  }

  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.weight - a.weight);
}
