import "server-only";
import type { MaterialRequestStatus, Priority } from "@/generated/prisma/enums";
import { formatDate, fromDbDate, fromDbDateOrNull, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { accessibleProjectIds, assertProjectAccess } from "@/server/scope";
import { nextCode } from "@/server/services/sequence";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export async function listMaterialRequests(user: Actor & { id: string }, filter: { status?: MaterialRequestStatus; projectId?: string } = {}) {
  const ids = await accessibleProjectIds(user);
  const rows = await db.materialRequest.findMany({
    where: {
      ...(ids === null ? {} : { projectId: { in: ids } }),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
    },
    orderBy: [{ requestedOn: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      project: { select: { id: true, name: true } },
      requestedBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      items: { include: { material: { select: { id: true, name: true, unit: true, defaultRatePaise: true } } } },
      purchases: { select: { id: true, number: true } },
    },
  });
  return rows.map((r) => ({
    ...r,
    requestedOn: fromDbDate(r.requestedOn),
    neededBy: fromDbDateOrNull(r.neededBy),
    itemsText: r.items.map((i) => `${formatQuantity(i.quantity.toString(), i.material.unit)} ${i.material.name}`).join(", "),
  }));
}

export type MaterialRequestRow = Awaited<ReturnType<typeof listMaterialRequests>>[number];

export async function getMaterialRequest(user: Actor & { id: string }, id: string) {
  const rows = await listMaterialRequests(user);
  return rows.find((r) => r.id === id) ?? null;
}

export async function createMaterialRequest(
  actor: Actor & { id: string },
  input: {
    projectId: string;
    neededBy: ISODate | null;
    priority: Priority;
    notes: string | null;
    items: { materialId: string; quantity: string; notes: string | null }[];
  },
): Promise<{ id: string }> {
  if (!can(actor, "materials.record")) throw new ForbiddenError();
  await assertProjectAccess(actor, input.projectId);
  if (input.items.length === 0) throw new AppError("Add at least one material.");
  const project = await db.project.findUniqueOrThrow({ where: { id: input.projectId }, select: { name: true } });
  return db.$transaction(async (tx) => {
    const request = await tx.materialRequest.create({
      data: {
        number: await nextCode(tx, "materialRequest"),
        projectId: input.projectId,
        requestedOn: toDbDate(todayIST()),
        neededBy: input.neededBy ? toDbDate(input.neededBy) : null,
        priority: input.priority,
        notes: input.notes,
        requestedById: actor.id,
        items: { create: input.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity, notes: i.notes })) },
      },
    });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "MaterialRequest",
      entityId: request.id,
      projectId: input.projectId,
      summary: `requested materials for ${project.name} (${request.number}${input.neededBy ? `, needed by ${formatDate(input.neededBy)}` : ""})`,
    });
    return { id: request.id };
  });
}

export async function decideMaterialRequest(actor: Actor, id: string, approve: boolean, note: string | null): Promise<void> {
  // Approving spends money, so only people who can record purchases decide.
  if (!can(actor, "purchases.record")) throw new ForbiddenError("Only someone who can record purchases can approve material requests.");
  const request = await db.materialRequest.findUnique({ where: { id }, include: { project: { select: { name: true } } } });
  if (!request) throw new NotFoundError("material request");
  if (request.status !== "PENDING") throw new AppError("This request has already been decided.");
  if (!approve && (!note || note.trim().length < 3)) throw new AppError("Please write why it is being rejected.");
  await db.$transaction(async (tx) => {
    await tx.materialRequest.update({
      where: { id },
      data: { status: approve ? "APPROVED" : "REJECTED", decisionNote: note, decidedById: actor.id, decidedAt: new Date() },
    });
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "MaterialRequest",
      entityId: id,
      projectId: request.projectId,
      summary: `${approve ? "approved" : "rejected"} material request ${request.number} for ${request.project.name}${note ? ` — "${note}"` : ""}`,
    });
  });
}

export async function cancelMaterialRequest(actor: Actor & { id: string }, id: string): Promise<void> {
  const request = await db.materialRequest.findUnique({ where: { id } });
  if (!request) throw new NotFoundError("material request");
  if (request.requestedById !== actor.id && !can(actor, "purchases.record")) throw new ForbiddenError();
  if (!["PENDING", "APPROVED"].includes(request.status)) throw new AppError("This request can no longer be cancelled.");
  await db.$transaction(async (tx) => {
    await tx.materialRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, { actor, action: "STATUS_CHANGE", entityType: "MaterialRequest", entityId: id, projectId: request.projectId, summary: `cancelled material request ${request.number}` });
  });
}
