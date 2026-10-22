import "server-only";
import type { InvoiceKind, QuotationStatus, TaxMode } from "@/generated/prisma/enums";
import { billTotals } from "@/lib/bill-totals";
import { fromDbDate, fromDbDateOrNull, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { formatINR, sumPaise, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { allocatePayments } from "@/lib/receivables";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { accessibleProjectIds, assertProjectAccess, seesAllProjects } from "@/server/scope";
import { loadProjectMoney } from "@/server/services/project-money";
import { nextCode } from "@/server/services/sequence";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export type BillLine = { section: string | null; description: string; quantity: string; unit: string; ratePaise: Paise; hsnSac: string | null };

// ─────────────────────────────────────────────────────────────────────────────
// Quotations
// ─────────────────────────────────────────────────────────────────────────────

/** Sent quotations past their validity are shown (and stored) as expired. */
async function expireOldQuotations() {
  await db.quotation.updateMany({
    where: { status: "SENT", validUntil: { lt: toDbDate(todayIST()) }, deletedAt: null },
    data: { status: "EXPIRED" },
  });
}

export async function listQuotations(user: Actor & { id: string }, filter: { status?: QuotationStatus; clientId?: string; projectId?: string; q?: string } = {}) {
  await expireOldQuotations();
  const ids = await accessibleProjectIds(user);
  const rows = await db.quotation.findMany({
    where: {
      deletedAt: null,
      ...(ids === null ? {} : { OR: [{ projectId: { in: ids } }, { projectId: null, createdById: user.id }] }),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.q ? { OR: [{ title: { contains: filter.q, mode: "insensitive" as const } }, { number: { contains: filter.q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: { client: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
  });
  return rows.map((q) => ({ ...q, date: fromDbDate(q.date), validUntil: fromDbDateOrNull(q.validUntil) }));
}

export async function getQuotation(user: Actor & { id: string }, id: string) {
  await expireOldQuotations();
  const q = await db.quotation.findFirst({
    where: { id, deletedAt: null },
    include: {
      client: true,
      project: { select: { id: true, name: true, address: true, city: true } },
      items: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { name: true } },
      revisionOf: { select: { id: true, number: true } },
      revisions: { where: { deletedAt: null }, select: { id: true, number: true, status: true } },
    },
  });
  if (!q) return null;
  if (q.projectId) {
    const ids = await accessibleProjectIds(user);
    if (ids !== null && !ids.includes(q.projectId)) return null;
  } else if (!seesAllProjects(user) && q.createdById !== user.id) {
    return null;
  }
  const totals = billTotals({ lines: q.items.map((i) => ({ quantity: i.quantity.toString(), ratePaise: i.ratePaise })), discountPaise: q.discountPaise, taxMode: q.taxMode, taxPercent: q.taxPercent.toString() });
  return { ...q, date: fromDbDate(q.date), validUntil: fromDbDateOrNull(q.validUntil), totals };
}

export type QuotationDetail = NonNullable<Awaited<ReturnType<typeof getQuotation>>>;

type QuotationInput = {
  clientId: string;
  projectId: string | null;
  title: string;
  date: ISODate;
  validUntil: ISODate | null;
  taxMode: TaxMode;
  taxPercent: string;
  discountPaise: Paise;
  terms: string | null;
  notes: string | null;
  lines: BillLine[];
};

function quotationData(input: QuotationInput) {
  const totals = billTotals({ lines: input.lines, discountPaise: input.discountPaise, taxMode: input.taxMode, taxPercent: input.taxPercent });
  return {
    totals,
    data: {
      clientId: input.clientId,
      projectId: input.projectId,
      title: input.title,
      date: toDbDate(input.date),
      validUntil: input.validUntil ? toDbDate(input.validUntil) : null,
      taxMode: input.taxMode,
      taxPercent: input.taxPercent,
      subtotalPaise: totals.subtotalPaise,
      discountPaise: totals.discountPaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
      terms: input.terms,
      notes: input.notes,
    },
    items: input.lines.map((l, i) => ({
      sortOrder: i,
      section: l.section,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      ratePaise: l.ratePaise,
      amountPaise: totals.lineAmounts[i],
      hsnSac: l.hsnSac,
    })),
  };
}

async function checkBillParties(user: Actor & { id: string }, clientId: string, projectId: string | null) {
  const client = await db.client.findFirst({ where: { id: clientId, deletedAt: null } });
  if (!client) throw new AppError("Choose a client.", { clientId: "Choose a client." });
  if (projectId) {
    await assertProjectAccess(user, projectId);
    const project = await db.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
    if (project?.clientId !== clientId) throw new AppError("That project belongs to a different client.", { projectId: "Different client." });
  }
  return client;
}

export async function createQuotation(actor: Actor & { id: string }, input: QuotationInput, revisionOfId?: string): Promise<{ id: string }> {
  if (!can(actor, "quotations.manage")) throw new ForbiddenError();
  if (input.lines.length === 0) throw new AppError("Add at least one item.");
  const client = await checkBillParties(actor, input.clientId, input.projectId);
  const { data, items, totals } = quotationData(input);
  return db.$transaction(async (tx) => {
    const q = await tx.quotation.create({
      data: { ...data, number: await nextCode(tx, "quotation"), createdById: actor.id, revisionOfId: revisionOfId ?? null, items: { create: items } },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Quotation",
      entityId: q.id,
      projectId: input.projectId,
      summary: `prepared quotation ${q.number} "${q.title}" for ${client.name}: ${formatINR(totals.totalPaise)}`,
    });
    return { id: q.id };
  });
}

export async function updateQuotation(actor: Actor & { id: string }, id: string, input: QuotationInput): Promise<void> {
  if (!can(actor, "quotations.manage")) throw new ForbiddenError();
  const existing = await db.quotation.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("quotation");
  if (existing.status !== "DRAFT") throw new AppError("Only draft quotations can be changed. Make a revised copy instead.");
  await checkBillParties(actor, input.clientId, input.projectId);
  const { data, items, totals } = quotationData(input);
  await db.$transaction(async (tx) => {
    await tx.quotationItem.deleteMany({ where: { quotationId: id } });
    await tx.quotation.update({ where: { id }, data: { ...data, items: { create: items } } });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Quotation",
      entityId: id,
      projectId: input.projectId,
      summary: `updated quotation ${existing.number}${existing.totalPaise !== totals.totalPaise ? `: total from ${formatINR(existing.totalPaise)} to ${formatINR(totals.totalPaise)}` : ""}`,
    });
  });
}

export async function setQuotationStatus(actor: Actor, id: string, status: "SENT" | "ACCEPTED" | "REJECTED"): Promise<void> {
  if (!can(actor, "quotations.manage")) throw new ForbiddenError();
  const q = await db.quotation.findFirst({ where: { id, deletedAt: null }, include: { client: { select: { name: true } } } });
  if (!q) throw new NotFoundError("quotation");
  const allowed: Record<string, QuotationStatus[]> = { SENT: ["DRAFT"], ACCEPTED: ["SENT", "DRAFT", "EXPIRED"], REJECTED: ["SENT", "EXPIRED", "DRAFT"] };
  if (!allowed[status].includes(q.status)) throw new AppError("That change is not possible for this quotation.");
  await db.$transaction(async (tx) => {
    await tx.quotation.update({
      where: { id },
      data: { status, ...(status === "SENT" ? { sentAt: new Date() } : { decidedAt: new Date() }) },
    });
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "Quotation",
      entityId: id,
      projectId: q.projectId,
      summary: `marked quotation ${q.number} for ${q.client.name} as ${status.toLowerCase()}`,
    });
  });
}

/** Copies a quotation into a new draft (revision). */
export async function reviseQuotation(actor: Actor & { id: string }, id: string): Promise<{ id: string }> {
  const q = await db.quotation.findFirst({ where: { id, deletedAt: null }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!q) throw new NotFoundError("quotation");
  return createQuotation(
    actor,
    {
      clientId: q.clientId,
      projectId: q.projectId,
      title: q.title,
      date: todayIST(),
      validUntil: null,
      taxMode: q.taxMode,
      taxPercent: q.taxPercent.toString(),
      discountPaise: q.discountPaise,
      terms: q.terms,
      notes: q.notes,
      lines: q.items.map((i) => ({ section: i.section, description: i.description, quantity: i.quantity.toString(), unit: i.unit, ratePaise: i.ratePaise, hsnSac: i.hsnSac })),
    },
    q.id,
  );
}

export async function deleteDraftQuotation(actor: Actor, id: string): Promise<void> {
  if (!can(actor, "quotations.manage")) throw new ForbiddenError();
  const q = await db.quotation.findFirst({ where: { id, deletedAt: null } });
  if (!q) throw new NotFoundError("quotation");
  if (q.status !== "DRAFT") throw new AppError("Only drafts can be removed. Sent quotations stay on record.");
  await db.$transaction(async (tx) => {
    await tx.quotation.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { actor, action: "DELETE", entityType: "Quotation", entityId: id, projectId: q.projectId, summary: `removed draft quotation ${q.number}` });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Client bills (running account / final)
// ─────────────────────────────────────────────────────────────────────────────

/** Client bills with what is still due on each (payments applied oldest bill first). */
export async function listInvoices(user: Actor & { id: string }, filter: { projectId?: string; clientId?: string; status?: "DRAFT" | "ISSUED" | "CANCELLED"; outstandingOnly?: boolean } = {}) {
  const ids = await accessibleProjectIds(user);
  const invoices = await db.invoice.findMany({
    where: {
      ...(ids === null ? {} : { projectId: { in: ids } }),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { client: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
  });
  const projectIds = [...new Set(invoices.map((i) => i.projectId))];
  const paid = projectIds.length
    ? await db.clientPayment.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds } }, _sum: { amountPaise: true, tdsDeductedPaise: true } })
    : [];
  const paidBy = new Map(paid.map((p) => [p.projectId, (p._sum.amountPaise ?? 0n) + (p._sum.tdsDeductedPaise ?? 0n)]));
  const aged = new Map<string, { outstandingPaise: Paise; paidPaise: Paise }>();
  for (const projectId of projectIds) {
    const issued = invoices.filter((i) => i.projectId === projectId && i.status === "ISSUED");
    for (const a of allocatePayments(
      issued.map((i) => ({ ...i, date: fromDbDate(i.date), dueDate: fromDbDateOrNull(i.dueDate) })),
      paidBy.get(projectId) ?? 0n,
    )) {
      aged.set(a.id, { outstandingPaise: a.outstandingPaise, paidPaise: a.paidPaise });
    }
  }
  const today = todayIST();
  return invoices
    .map((i) => {
      const a = aged.get(i.id);
      const due = fromDbDateOrNull(i.dueDate);
      const outstanding = a?.outstandingPaise ?? 0n;
      return {
        ...i,
        date: fromDbDate(i.date),
        dueDate: due,
        outstandingPaise: i.status === "ISSUED" ? outstanding : 0n,
        settledPaise: a?.paidPaise ?? 0n,
        overdue: i.status === "ISSUED" && outstanding > 0n && due !== null && due < today,
      };
    })
    .filter((i) => !filter.outstandingOnly || i.outstandingPaise > 0n);
}

export type InvoiceRow = Awaited<ReturnType<typeof listInvoices>>[number];

export async function getInvoice(user: Actor & { id: string }, id: string) {
  const inv = await db.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      project: { select: { id: true, name: true, address: true, city: true, state: true } },
      items: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { name: true } },
      clientPayments: { orderBy: { date: "asc" }, include: { account: { select: { name: true } } } },
    },
  });
  if (!inv) return null;
  const ids = await accessibleProjectIds(user);
  if (ids !== null && !ids.includes(inv.projectId)) return null;
  const row = (await listInvoices(user, { projectId: inv.projectId })).find((r) => r.id === id);
  const totals = billTotals({
    lines: inv.items.map((i) => ({ quantity: i.quantity.toString(), ratePaise: i.ratePaise })),
    taxMode: inv.taxMode,
    taxPercent: inv.taxPercent.toString(),
  });
  return {
    ...inv,
    date: fromDbDate(inv.date),
    dueDate: fromDbDateOrNull(inv.dueDate),
    periodFrom: fromDbDateOrNull(inv.periodFrom),
    periodTo: fromDbDateOrNull(inv.periodTo),
    outstandingPaise: row?.outstandingPaise ?? 0n,
    settledPaise: row?.settledPaise ?? 0n,
    overdue: row?.overdue ?? false,
    totals,
    clientPayments: inv.clientPayments.map((p) => ({ ...p, date: fromDbDate(p.date) })),
  };
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

type InvoiceInput = {
  projectId: string;
  kind: InvoiceKind;
  date: ISODate;
  dueDate: ISODate | null;
  periodFrom: ISODate | null;
  periodTo: ISODate | null;
  milestone: string | null;
  taxMode: TaxMode;
  taxPercent: string;
  retentionPercent: string;
  notes: string | null;
  issueNow: boolean;
  lines: BillLine[];
};

export async function createInvoice(actor: Actor & { id: string }, input: InvoiceInput): Promise<{ id: string }> {
  if (!can(actor, "quotations.manage")) throw new ForbiddenError();
  await assertProjectAccess(actor, input.projectId);
  if (input.lines.length === 0) throw new AppError("Add at least one item.");
  const project = await db.project.findUniqueOrThrow({ where: { id: input.projectId }, include: { client: true } });
  const totals = billTotals({ lines: input.lines, taxMode: input.taxMode, taxPercent: input.taxPercent, retentionPercent: input.retentionPercent });
  return db.$transaction(async (tx) => {
    const lastRa = await tx.invoice.aggregate({ where: { projectId: input.projectId, kind: "RUNNING" }, _max: { raNumber: true } });
    const inv = await tx.invoice.create({
      data: {
        number: await nextCode(tx, "invoice"),
        kind: input.kind,
        raNumber: input.kind === "RUNNING" ? (lastRa._max.raNumber ?? 0) + 1 : null,
        projectId: input.projectId,
        clientId: project.clientId,
        date: toDbDate(input.date),
        dueDate: input.dueDate ? toDbDate(input.dueDate) : null,
        periodFrom: input.periodFrom ? toDbDate(input.periodFrom) : null,
        periodTo: input.periodTo ? toDbDate(input.periodTo) : null,
        milestone: input.milestone,
        taxMode: input.taxMode,
        taxPercent: input.taxPercent,
        subtotalPaise: totals.subtotalPaise,
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
        retentionPaise: totals.retentionPaise,
        status: input.issueNow ? "ISSUED" : "DRAFT",
        notes: input.notes,
        createdById: actor.id,
        items: {
          create: input.lines.map((l, i) => ({
            sortOrder: i,
            description: l.section ? `${l.section} — ${l.description}` : l.description,
            quantity: l.quantity,
            unit: l.unit,
            ratePaise: l.ratePaise,
            amountPaise: totals.lineAmounts[i],
            hsnSac: l.hsnSac,
          })),
        },
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Invoice",
      entityId: inv.id,
      projectId: input.projectId,
      summary: `${input.issueNow ? "issued" : "drafted"} bill ${inv.number}${inv.raNumber ? ` (RA-${inv.raNumber})` : ""} to ${project.client.name} for ${project.name}: ${formatINR(totals.totalPaise)}`,
    });
    return { id: inv.id };
  });
}

export async function issueInvoice(actor: Actor, id: string): Promise<void> {
  if (!can(actor, "quotations.manage")) throw new ForbiddenError();
  const inv = await db.invoice.findUnique({ where: { id } });
  if (!inv) throw new NotFoundError("bill");
  if (inv.status !== "DRAFT") throw new AppError("Only draft bills can be issued.");
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { status: "ISSUED" } });
    await audit(tx, { actor, action: "STATUS_CHANGE", entityType: "Invoice", entityId: id, projectId: inv.projectId, summary: `issued bill ${inv.number} (${formatINR(inv.totalPaise)})` });
  });
}

export async function cancelInvoice(actor: Actor, id: string, reason: string): Promise<void> {
  if (!can(actor, "quotations.manage")) throw new ForbiddenError();
  const inv = await db.invoice.findUnique({ where: { id }, include: { clientPayments: true } });
  if (!inv) throw new NotFoundError("bill");
  if (inv.status === "CANCELLED") return;
  if (inv.clientPayments.some((p) => !p.reversalOfId)) throw new AppError("Payments are linked to this bill. Reverse them first.");
  if (reason.trim().length < 3) throw new AppError("Please write why the bill is cancelled.");
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.trim() } });
    await audit(tx, { actor, action: "STATUS_CHANGE", entityType: "Invoice", entityId: id, projectId: inv.projectId, summary: `cancelled bill ${inv.number} — "${reason.trim()}"` });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Receivables (what clients still owe)
// ─────────────────────────────────────────────────────────────────────────────

export async function receivables(user: Actor & { id: string }) {
  const ids = await accessibleProjectIds(user);
  const projects = await db.project.findMany({
    where: { deletedAt: null, status: { notIn: ["PLANNING", "CANCELLED"] }, ...(ids === null ? {} : { id: { in: ids } }) },
    select: { id: true, name: true, status: true, client: { select: { id: true, name: true, phone: true } } },
    orderBy: { name: "asc" },
  });
  const money = await loadProjectMoney(projects.map((p) => p.id));
  const bills = await listInvoices(user, { status: "ISSUED" });
  return projects
    .map((p) => {
      const m = money.get(p.id)!;
      const pb = bills.filter((b) => b.projectId === p.id);
      return {
        ...p,
        valuePaise: m.money.projectValuePaise,
        billedPaise: m.input.billedPaise,
        receivedPaise: m.money.receivedPaise,
        pendingPaise: m.money.pendingFromClientPaise,
        billedNotReceivedPaise: m.money.billedNotReceivedPaise,
        overduePaise: sumPaise(pb.filter((b) => b.overdue).map((b) => b.outstandingPaise)),
        overdueBills: pb.filter((b) => b.overdue),
        retentionPaise: sumPaise(pb.map((b) => b.retentionPaise)),
      };
    })
    .filter((p) => p.pendingPaise > 0n || p.billedNotReceivedPaise > 0n);
}
