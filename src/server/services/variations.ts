import "server-only";
import type { CostGroup, VariationStatus } from "@/generated/prisma/enums";
import { fromDbDate, fromDbDateOrNull, todayIST, toDbDate, type ISODate } from "@/lib/dates";
import { COST_GROUP } from "@/lib/labels";
import { formatINR, type Paise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { assertProjectAccess } from "@/server/scope";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export async function listVariations(projectId: string) {
  const rows = await db.variation.findMany({ where: { projectId }, orderBy: { number: "desc" } });
  return rows.map((v) => ({ ...v, requestedOn: fromDbDate(v.requestedOn), decidedOn: fromDbDateOrNull(v.decidedOn) }));
}

/** Extra work (or a reduction) agreed with the client. Approved ones change the project value. */
export async function createVariation(
  actor: Actor & { id: string },
  input: { projectId: string; title: string; description: string | null; amountPaise: Paise; requestedOn: ISODate },
): Promise<void> {
  if (!can(actor, "quotations.manage")) throw new ForbiddenError();
  await assertProjectAccess(actor, input.projectId);
  await db.$transaction(async (tx) => {
    const last = await tx.variation.aggregate({ where: { projectId: input.projectId }, _max: { number: true } });
    const v = await tx.variation.create({ data: { ...input, requestedOn: toDbDate(input.requestedOn), number: (last._max.number ?? 0) + 1 } });
    await audit(tx, {
      actor,
      action: "CREATE",
      entityType: "Variation",
      entityId: v.id,
      projectId: input.projectId,
      summary: `recorded extra work #${v.number} "${v.title}" for ${formatINR(v.amountPaise)} (waiting for client approval)`,
    });
  });
}

export async function decideVariation(actor: Actor, id: string, status: VariationStatus, note: string | null): Promise<void> {
  if (!can(actor, "quotations.manage")) throw new ForbiddenError();
  const v = await db.variation.findUnique({ where: { id } });
  if (!v) throw new NotFoundError("extra work");
  if (v.status !== "PROPOSED") throw new AppError("This has already been decided.");
  await db.$transaction(async (tx) => {
    await tx.variation.update({ where: { id }, data: { status, decidedOn: toDbDate(todayIST()), notes: note ?? v.notes } });
    await audit(tx, {
      actor,
      action: "STATUS_CHANGE",
      entityType: "Variation",
      entityId: id,
      projectId: v.projectId,
      summary: `client ${status === "APPROVED" ? "approved" : "rejected"} extra work #${v.number} "${v.title}" (${formatINR(v.amountPaise)})${status === "APPROVED" ? " — added to the project value" : ""}`,
    });
  });
}

export async function getBudgets(projectId: string) {
  return db.projectBudget.findMany({ where: { projectId } });
}

export async function setBudgets(actor: Actor & { id: string }, projectId: string, budgets: { group: string; amountPaise: Paise }[]): Promise<void> {
  if (!can(actor, "projects.viewMoney") || !can(actor, "projects.edit")) throw new ForbiddenError();
  await assertProjectAccess(actor, projectId);
  const valid = budgets.filter((b) => b.group in COST_GROUP);
  await db.$transaction(async (tx) => {
    for (const b of valid) {
      await tx.projectBudget.upsert({
        where: { projectId_group: { projectId, group: b.group as CostGroup } },
        create: { projectId, group: b.group as CostGroup, budgetPaise: b.amountPaise },
        update: { budgetPaise: b.amountPaise },
      });
    }
    await audit(tx, {
      actor,
      action: "UPDATE",
      entityType: "ProjectBudget",
      projectId,
      summary: `set the project budget: ${valid
        .filter((b) => b.amountPaise > 0n)
        .map((b) => `${COST_GROUP[b.group as CostGroup]} ${formatINR(b.amountPaise, { paise: false })}`)
        .join(", ")}`,
    });
  });
}
