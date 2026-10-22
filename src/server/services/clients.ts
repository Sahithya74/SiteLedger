import "server-only";
import type { ClientFormInput } from "@/features/clients/schemas";
import { fromDbDate, fromDbDateOrNull } from "@/lib/dates";
import { sumPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit, describeChanges } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { projectWhere, seesAllProjects } from "@/server/scope";
import { loadProjectMoney } from "@/server/services/project-money";
import { nextCode } from "@/server/services/sequence";

/**
 * Managers who cannot see every project only see clients of their projects.
 */
function clientWhere(user: CurrentUser) {
  if (seesAllProjects(user)) return { deletedAt: null };
  return { deletedAt: null, projects: { some: projectWhere(user) } };
}

export async function listClients(user: CurrentUser, q?: string) {
  const search = q?.trim();
  const clients = await db.client.findMany({
    where: {
      ...clientWhere(user),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
              { city: { contains: search, mode: "insensitive" as const } },
              { code: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      email: true,
      city: true,
      projects: { where: projectWhere(user), select: { id: true, status: true } },
    },
  });
  const showMoney = can(user, "projects.viewMoney");
  const money = showMoney ? await loadProjectMoney(clients.flatMap((c) => c.projects.map((p) => p.id))) : null;
  return clients.map((c) => {
    const results = c.projects.map((p) => money?.get(p.id)?.money).filter((m) => m !== undefined);
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      phone: c.phone,
      email: c.email,
      city: c.city,
      projectCount: c.projects.length,
      activeProjects: c.projects.filter((p) => p.status === "ACTIVE" || p.status === "DELAYED").length,
      valuePaise: money ? sumPaise(results.map((m) => m.projectValuePaise)) : null,
      receivedPaise: money ? sumPaise(results.map((m) => m.receivedPaise)) : null,
      pendingPaise: money ? sumPaise(results.map((m) => m.pendingFromClientPaise)) : null,
    };
  });
}

export async function getClient(user: CurrentUser, id: string) {
  const client = await db.client.findFirst({
    where: { id, ...clientWhere(user) },
    include: {
      projects: {
        where: projectWhere(user),
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, name: true, status: true, city: true, archivedAt: true, startDate: true },
      },
    },
  });
  if (!client) return null;
  const showMoney = can(user, "projects.viewMoney");
  const projectIds = client.projects.map((p) => p.id);
  const [money, payments] = await Promise.all([
    showMoney ? loadProjectMoney(projectIds) : Promise.resolve(null),
    showMoney
      ? db.clientPayment.findMany({
          where: { clientId: id, projectId: { in: projectIds } },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 50,
          select: {
            id: true,
            receiptNumber: true,
            date: true,
            amountPaise: true,
            tdsDeductedPaise: true,
            method: true,
            reference: true,
            milestone: true,
            reversalOfId: true,
            project: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const projects = client.projects.map((p) => ({
    ...p,
    startDate: fromDbDateOrNull(p.startDate),
    money: money?.get(p.id)?.money ?? null,
  }));
  const totals = money
    ? {
        valuePaise: sumPaise(projects.map((p) => p.money?.projectValuePaise)),
        receivedPaise: sumPaise(projects.map((p) => p.money?.receivedPaise)),
        pendingPaise: sumPaise(projects.map((p) => p.money?.pendingFromClientPaise)),
        billedPaise: sumPaise(projectIds.map((pid) => money.get(pid)?.input.billedPaise)),
      }
    : null;
  return {
    ...client,
    projects,
    totals,
    payments: payments.map((p) => ({ ...p, date: fromDbDate(p.date) })),
  };
}

export type ClientDetail = NonNullable<Awaited<ReturnType<typeof getClient>>>;

export async function createClient(actor: CurrentUser, input: ClientFormInput): Promise<{ id: string }> {
  if (!can(actor, "clients.manage")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const code = await nextCode(tx, "client");
    const client = await tx.client.create({ data: { ...input, code } });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Client",
      entityId: client.id,
      summary: `added client ${client.name}`,
      after: client,
    });
    return { id: client.id };
  });
}

const CLIENT_FIELDS = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "altPhone", label: "Other phone" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "gstin", label: "GSTIN" },
  { key: "pan", label: "PAN" },
  { key: "notes", label: "Notes" },
] as const;

export async function updateClient(actor: CurrentUser, id: string, input: ClientFormInput): Promise<void> {
  if (!can(actor, "clients.manage")) throw new ForbiddenError();
  const existing = await db.client.findFirst({ where: { id, ...clientWhere(actor) } });
  if (!existing) throw new NotFoundError("client");
  const changes = describeChanges(existing, input, [...CLIENT_FIELDS]);
  if (!changes.changed) return;
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id }, data: input });
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "Client",
      entityId: id,
      summary: `changed client ${existing.name}: ${changes.text}`,
      before: changes.before,
      after: changes.after,
    });
  });
}

export async function deleteClient(actor: CurrentUser, id: string): Promise<void> {
  if (actor.role !== "ADMIN") throw new ForbiddenError();
  const existing = await db.client.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("client");
  const [projects, payments, quotations] = await Promise.all([
    db.project.count({ where: { clientId: id, deletedAt: null } }),
    db.clientPayment.count({ where: { clientId: id } }),
    db.quotation.count({ where: { clientId: id, deletedAt: null } }),
  ]);
  if (projects + payments + quotations > 0) {
    throw new AppError("This client has projects, quotations or payments, so it cannot be removed.");
  }
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, {
      actor,
      action: "DELETE",
      entityType: "Client",
      entityId: id,
      summary: `removed client ${existing.name}`,
      before: existing,
    });
  });
}

export async function clientOptions(user: CurrentUser) {
  return db.client.findMany({
    where: clientWhere(user),
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true },
  });
}
