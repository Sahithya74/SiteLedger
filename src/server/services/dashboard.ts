import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { ProjectStatus } from "@/generated/prisma/enums";
import { addMonths, startOfMonth, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { sumPaise, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { accessibleProjectIds, projectIdFilter, projectWhere, seesAllProjects } from "@/server/scope";
import { getAttentionItems } from "@/server/services/alerts";
import { contractorPayables, pendingWagesSummary, supplierPayables } from "@/server/services/payables";
import { loadProjectMoney, loadWorkStats } from "@/server/services/project-money";

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

export async function getDashboard(user: CurrentUser, today: ISODate = todayIST()) {
  const ids = await accessibleProjectIds(user);
  const inScope = projectIdFilter(ids);
  const showMoney = can(user, "projects.viewMoney");
  const showWages = can(user, "wages.view");
  const todayDb = toDbDate(today);

  const projects = await db.project.findMany({
    where: { ...projectWhere(user), archivedAt: null },
    select: { id: true, name: true, code: true, status: true, city: true, expectedEndDate: true, client: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  const projectIds = projects.map((p) => p.id);
  const liveProjects = projects.filter((p) => p.status !== "CANCELLED");

  const [money, work, attendanceToday, inProgressToday, receivedToday, usedToday, issuesOpen, issuesToday, requestsPending, reportsToday, attention] =
    await Promise.all([
      showMoney ? loadProjectMoney(liveProjects.map((p) => p.id)) : Promise.resolve(null),
      loadWorkStats(projectIds, today),
      db.attendance.groupBy({
        by: ["projectId", "status"],
        where: { ...inScope, date: todayDb, status: { in: ["PRESENT", "HALF_DAY"] } },
        _count: { labourId: true, engineerId: true },
      }),
      db.workItem.findMany({
        where: {
          deletedAt: null,
          status: "IN_PROGRESS",
          children: { none: { deletedAt: null } },
          project: { ...projectWhere(user), archivedAt: null, status: { in: ["ACTIVE", "DELAYED"] } },
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, percentComplete: true, projectId: true, engineer: { select: { name: true } } },
      }),
      db.inventoryTransaction.findMany({
        where: { ...inScope, date: todayDb, type: "PURCHASE" },
        select: { id: true, quantity: true, projectId: true, material: { select: { name: true, unit: true } } },
      }),
      db.inventoryTransaction.count({ where: { ...inScope, date: todayDb, type: "USAGE" } }),
      db.issue.count({ where: { ...inScope, status: { not: "RESOLVED" } } }),
      db.issue.count({ where: { ...inScope, reportedOn: todayDb } }),
      db.materialRequest.count({ where: { ...inScope, status: "PENDING" } }),
      db.dailyReport.count({ where: { ...inScope, date: todayDb } }),
      getAttentionItems(user, today),
    ]);

  // ── Project counts ──────────────────────────────────────────────────────
  const statusCounts = Object.fromEntries(
    (["PLANNING", "ACTIVE", "ON_HOLD", "DELAYED", "COMPLETED", "CANCELLED"] as ProjectStatus[]).map((s) => [
      s,
      projects.filter((p) => p.status === s).length,
    ]),
  ) as Record<ProjectStatus, number>;
  const activeProjects = projects.filter((p) => p.status === "ACTIVE" || p.status === "DELAYED");

  // ── Today on site ───────────────────────────────────────────────────────
  type SiteToday = { labour: number; labourHalf: number; engineers: number };
  const siteToday = new Map<string, SiteToday>();
  for (const row of attendanceToday) {
    const s = siteToday.get(row.projectId) ?? { labour: 0, labourHalf: 0, engineers: 0 };
    if (row.status === "HALF_DAY") s.labourHalf += row._count.labourId;
    s.labour += row._count.labourId;
    s.engineers += row._count.engineerId;
    siteToday.set(row.projectId, s);
  }
  const labourPresent = sumBy([...siteToday.values()], (s) => s.labour);
  const engineersPresent = sumBy([...siteToday.values()], (s) => s.engineers);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const activeSites = activeProjects.map((p) => {
    const s = siteToday.get(p.id);
    const w = work.get(p.id);
    return {
      id: p.id,
      name: p.name,
      city: p.city,
      status: p.status,
      progress: w?.progress ?? 0,
      health: w?.health.state ?? "unknown",
      labourPresent: s?.labour ?? 0,
      engineersPresent: s?.engineers ?? 0,
      workToday: inProgressToday
        .filter((i) => i.projectId === p.id)
        .slice(0, 4)
        .map((i) => ({ id: i.id, name: i.name, percent: i.percentComplete, engineer: i.engineer?.name ?? null })),
    };
  });

  const materialsReceived = receivedToday.map((r) => ({
    id: r.id,
    material: r.material.name,
    quantity: formatQuantity(r.quantity.toString(), r.material.unit),
    unit: r.material.unit,
    project: r.projectId ? (projectName.get(r.projectId) ?? "Project") : "Main store",
  }));

  // ── Money ───────────────────────────────────────────────────────────────
  let finance: null | {
    totalQuotedPaise: Paise;
    totalValuePaise: Paise;
    activeValuePaise: Paise;
    receivedPaise: Paise;
    pendingPaise: Paise;
    spentPaise: Paise;
    materialsPaise: Paise;
    labourPaise: Paise;
    engineersPaise: Paise;
    contractorsPaise: Paise;
    otherPaise: Paise;
    officeExpensesPaise: Paise;
    netPositionPaise: Paise;
    payablesPaise: Paise;
    wagesPendingPaise: Paise;
  } = null;

  if (money) {
    const results = [...money.values()];
    const activeIds = new Set(activeProjects.map((p) => p.id));
    const [suppliersOwed, contractorsOwed, wages, officeExpenses] = await Promise.all([
      supplierPayables(ids),
      contractorPayables(ids),
      showWages ? pendingWagesSummary(ids) : Promise.resolve({ workers: 0, totalPaise: 0n }),
      // Company overheads not tied to a project (office rent, etc.) — owner / all-project view only.
      seesAllProjects(user)
        ? db.expense.aggregate({ where: { projectId: null }, _sum: { amountPaise: true } })
        : Promise.resolve({ _sum: { amountPaise: 0n } }),
    ]);
    const spent = sumPaise(results.map((r) => r.money.spentPaise));
    const received = sumPaise(results.map((r) => r.money.receivedPaise));
    const office = officeExpenses._sum.amountPaise ?? 0n;
    // Only signed work counts as project value or money still to come;
    // a planning-stage quotation is not yet owed by anyone.
    const contracted = [...money.entries()]
      .filter(([id]) => projects.find((p) => p.id === id)?.status !== "PLANNING")
      .map(([, r]) => r);
    finance = {
      totalQuotedPaise: sumPaise(results.map((r) => r.input.quotedPaise)),
      totalValuePaise: sumPaise(contracted.map((r) => r.money.projectValuePaise)),
      activeValuePaise: sumPaise([...money.entries()].filter(([id]) => activeIds.has(id)).map(([, r]) => r.money.projectValuePaise)),
      receivedPaise: received,
      pendingPaise: sumPaise(contracted.map((r) => (r.money.pendingFromClientPaise > 0n ? r.money.pendingFromClientPaise : 0n))),
      spentPaise: spent + office,
      materialsPaise: sumPaise(results.map((r) => r.costs.materials)),
      labourPaise: sumPaise(results.map((r) => r.costs.labour)),
      engineersPaise: sumPaise(results.map((r) => r.costs.engineers)),
      contractorsPaise: sumPaise(results.map((r) => r.costs.contractors)),
      otherPaise: sumPaise(results.map((r) => r.costs.transport + r.costs.foodWelfare + r.costs.equipment + r.costs.other)),
      officeExpensesPaise: office,
      netPositionPaise: received - spent - office,
      payablesPaise: suppliersOwed + contractorsOwed + wages.totalPaise,
      wagesPendingPaise: wages.totalPaise,
    };
  }

  const cashflow = showMoney ? await monthlyCashflow(ids, today, seesAllProjects(user)) : null;

  const overdueWork = sumBy([...work.values()], (w) => w.overdueItems);

  return {
    today,
    showMoney,
    counts: {
      active: activeProjects.length,
      completed: statusCounts.COMPLETED,
      pending: statusCounts.PLANNING + statusCounts.ON_HOLD,
      delayed: statusCounts.DELAYED,
      total: liveProjects.length,
    },
    statusCounts,
    finance,
    cashflow,
    site: {
      labourPresent,
      engineersPresent,
      activeSitesWithPeople: [...siteToday.keys()].length,
      openIssues: issuesOpen,
      issuesToday,
      overdueWork,
      materialsUsedEntries: usedToday,
      materialRequestsPending: requestsPending,
      dailyReportsToday: reportsToday,
      materialsReceived,
      activeSites,
    },
    attention,
  };
}

function sumBy<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

/** Money in vs money out per month for the last 6 months (transfers excluded). */
async function monthlyCashflow(projectIds: string[] | null, today: ISODate, includeCompany: boolean) {
  const from = addMonths(startOfMonth(today), -5);
  const scope =
    projectIds === null
      ? includeCompany
        ? Prisma.empty
        : Prisma.sql`AND "projectId" IS NOT NULL`
      : projectIds.length
        ? Prisma.sql`AND "projectId" IN (${Prisma.join(projectIds)})`
        : Prisma.sql`AND FALSE`;
  const rows = await db.$queryRaw<{ month: string; inflow: bigint | null; outflow: bigint | null }[]>`
    SELECT to_char("date", 'YYYY-MM') AS month,
           SUM(CASE WHEN "amountPaise" > 0 THEN "amountPaise" ELSE 0 END)::bigint AS inflow,
           SUM(CASE WHEN "amountPaise" < 0 THEN -"amountPaise" ELSE 0 END)::bigint AS outflow
    FROM "BankTransaction"
    WHERE "date" >= ${toDbDate(from)}::date AND "source" <> 'TRANSFER' ${scope}
    GROUP BY 1`;
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return Array.from({ length: 6 }, (_, i) => {
    const month = addMonths(from, i).slice(0, 7);
    const row = byMonth.get(month);
    return { month, inPaise: BigInt(row?.inflow ?? 0n), outPaise: BigInt(row?.outflow ?? 0n) };
  });
}
