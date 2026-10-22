import "server-only";
import { sumPaise, type Paise } from "@/lib/money";
import { workerBalance } from "@/lib/wages";
import { db } from "@/server/db";

/**
 * What the business owes (payables). Each figure is "costs incurred minus
 * payments made" for that party — never a stored number.
 */

/** Workers with wages still to be paid. `projectIds` null = all workers. */
export async function pendingWagesSummary(projectIds: string[] | null): Promise<{ workers: number; totalPaise: Paise }> {
  const scope = projectIds === null ? {} : { projectId: { in: projectIds } };
  const earned = await db.attendance.groupBy({
    by: ["labourId"],
    where: { ...scope, labourId: { not: null } },
    _sum: { wagePaise: true, adjustmentPaise: true },
  });
  const labourIds = earned.map((e) => e.labourId!).filter(Boolean);
  if (labourIds.length === 0) return { workers: 0, totalPaise: 0n };
  // Wages and advances are paid to the worker, whichever project they were for.
  const paid = await db.payment.groupBy({
    by: ["labourId", "purpose"],
    where: { labourId: { in: labourIds }, purpose: { in: ["WAGES", "ADVANCE"] } },
    _sum: { amountPaise: true },
  });
  let workers = 0;
  let total = 0n;
  for (const e of earned) {
    const wagesPaid = paid.find((p) => p.labourId === e.labourId && p.purpose === "WAGES")?._sum.amountPaise ?? 0n;
    const advances = paid.find((p) => p.labourId === e.labourId && p.purpose === "ADVANCE")?._sum.amountPaise ?? 0n;
    const { pendingWagesPaise } = workerBalance({
      earnedPaise: (e._sum.wagePaise ?? 0n) + (e._sum.adjustmentPaise ?? 0n),
      wagesPaidPaise: wagesPaid,
      advancesPaise: advances,
    });
    if (pendingWagesPaise > 0n) {
      workers++;
      total += pendingWagesPaise;
    }
  }
  return { workers, totalPaise: total };
}

/** Amount owed to suppliers: purchases minus payments, per supplier. */
export async function supplierPayables(projectIds: string[] | null): Promise<Paise> {
  const scope = projectIds === null ? {} : { projectId: { in: projectIds } };
  const [bought, paid] = await Promise.all([
    db.purchase.groupBy({ by: ["supplierId"], where: { ...scope, cancelledAt: null }, _sum: { totalPaise: true } }),
    db.payment.groupBy({ by: ["supplierId"], where: { ...scope, payeeType: "SUPPLIER" }, _sum: { amountPaise: true } }),
  ]);
  const paidBy = new Map(paid.map((p) => [p.supplierId, p._sum.amountPaise ?? 0n]));
  return sumPaise(
    bought.map((b) => {
      const owed = (b._sum.totalPaise ?? 0n) - (paidBy.get(b.supplierId) ?? 0n);
      return owed > 0n ? owed : 0n;
    }),
  );
}

/** Amount owed to labour contractors: approved bills (net) minus payments. */
export async function contractorPayables(projectIds: string[] | null): Promise<Paise> {
  const scope = projectIds === null ? {} : { projectId: { in: projectIds } };
  const [billed, paid] = await Promise.all([
    db.contractorBill.groupBy({ by: ["contractorId"], where: { ...scope, status: "APPROVED" }, _sum: { netPaise: true } }),
    db.payment.groupBy({ by: ["contractorId"], where: { ...scope, payeeType: "CONTRACTOR" }, _sum: { amountPaise: true } }),
  ]);
  const paidBy = new Map(paid.map((p) => [p.contractorId, p._sum.amountPaise ?? 0n]));
  return sumPaise(
    billed.map((b) => {
      const owed = (b._sum.netPaise ?? 0n) - (paidBy.get(b.contractorId) ?? 0n);
      return owed > 0n ? owed : 0n;
    }),
  );
}
