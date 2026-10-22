import "server-only";
import Decimal from "decimal.js";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { formatDate, toDbDate, type ISODate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import { calculateDailyWage } from "@/lib/wages";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { assertPeriodOpen } from "@/server/services/ledger";

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export type AttendanceEntry = {
  labourId?: string | null;
  engineerId?: string | null;
  status: AttendanceStatus;
  overtimeHours?: string;
  workItemId?: string | null;
  notes?: string | null;
};

/**
 * Marks attendance for many people at one project on one day.
 * The person's current wage rates are copied onto each row so a later wage
 * increase never changes past wages. Re-marking the same day updates the row
 * and the change is written to the audit log.
 */
export async function markAttendance(
  actor: Actor,
  input: { date: ISODate; projectId: string; siteId?: string | null; entries: AttendanceEntry[] },
): Promise<{ saved: number; present: number; halfDay: number; absent: number }> {
  if (!can(actor, "attendance.record")) throw new ForbiddenError();
  if (input.entries.length === 0) throw new AppError("Select at least one person.");

  return db.$transaction(
    async (tx) => {
      await assertPeriodOpen(tx, input.date);
      const project = await tx.project.findFirst({
        where: { id: input.projectId, deletedAt: null },
        include: { sites: { where: { isDefault: true }, select: { id: true } } },
      });
      if (!project) throw new NotFoundError("project");
      const siteId = input.siteId ?? project.sites[0]?.id ?? null;
      const date = toDbDate(input.date);

      const labourIds = input.entries.map((e) => e.labourId).filter((v): v is string => Boolean(v));
      const engineerIds = input.entries.map((e) => e.engineerId).filter((v): v is string => Boolean(v));
      const [workers, engineers] = await Promise.all([
        tx.labour.findMany({ where: { id: { in: labourIds }, deletedAt: null } }),
        tx.engineer.findMany({ where: { id: { in: engineerIds }, deletedAt: null } }),
      ]);
      const workerById = new Map(workers.map((w) => [w.id, w]));
      const engineerById = new Map(engineers.map((e) => [e.id, e]));

      let saved = 0;
      const changed: string[] = [];
      for (const entry of input.entries) {
        if (Boolean(entry.labourId) === Boolean(entry.engineerId)) throw new AppError("Each attendance line needs one person.");
        const overtime = new Decimal(entry.overtimeHours || "0");
        if (!overtime.isFinite() || overtime.lt(0) || overtime.gt(24)) throw new AppError("Overtime must be between 0 and 24 hours.");

        let dailyWagePaise = 0n;
        let overtimeRatePaise = 0n;
        let name = "";
        if (entry.labourId) {
          const w = workerById.get(entry.labourId);
          if (!w) throw new NotFoundError("worker");
          dailyWagePaise = w.dailyWagePaise;
          overtimeRatePaise = w.overtimeRatePaise;
          name = w.name;
        } else {
          const e = engineerById.get(entry.engineerId!);
          if (!e) throw new NotFoundError("engineer");
          // Salaried engineers' pay is not built from attendance.
          dailyWagePaise = e.payFrequency === "DAILY" ? e.dailyWagePaise : 0n;
          name = e.name;
        }
        const wagePaise = calculateDailyWage({ status: entry.status, dailyWagePaise, overtimeHours: overtime, overtimeRatePaise });

        const existing = await tx.attendance.findFirst({
          where: entry.labourId ? { date, labourId: entry.labourId } : { date, engineerId: entry.engineerId },
        });
        if (existing && existing.projectId !== project.id) {
          throw new AppError(`${name} is already marked at another project on ${formatDate(input.date)}.`);
        }
        const data = {
          date,
          projectId: project.id,
          siteId,
          labourId: entry.labourId ?? null,
          engineerId: entry.engineerId ?? null,
          status: entry.status,
          overtimeHours: overtime.toString(),
          dailyWagePaise,
          overtimeRatePaise,
          wagePaise,
          workItemId: entry.workItemId ?? null,
          notes: entry.notes ?? null,
          recordedById: actor.id,
        };
        if (existing) {
          if (existing.status !== entry.status || !new Decimal(existing.overtimeHours.toString()).eq(overtime)) {
            changed.push(`${name}: ${existing.status.toLowerCase().replace("_", " ")} → ${entry.status.toLowerCase().replace("_", " ")} (${formatINR(existing.wagePaise)} → ${formatINR(wagePaise)})`);
          }
          await tx.attendance.update({ where: { id: existing.id }, data });
        } else {
          await tx.attendance.create({ data });
        }
        saved++;
      }

      const present = input.entries.filter((e) => e.status === "PRESENT").length;
      const halfDay = input.entries.filter((e) => e.status === "HALF_DAY").length;
      const absent = input.entries.filter((e) => e.status === "ABSENT").length;
      await audit(tx, {
        actor,
        action: changed.length ? "UPDATE" : "CREATE",
        entityType: "Attendance",
        projectId: project.id,
        summary: `marked attendance at ${project.name} for ${formatDate(input.date)}: ${present} present, ${halfDay} half day, ${absent} absent${
          changed.length ? `. Changed: ${changed.join("; ")}` : ""
        }`,
      });
      return { saved, present, halfDay, absent };
    },
    { timeout: 30_000 },
  );
}
