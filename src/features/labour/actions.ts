"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  attendanceRowSchema,
  attendanceSchema,
  contractorBillSchema,
  contractorSchema,
  wagePaymentSchema,
  workerSchema,
  workOrderSchema,
} from "@/features/labour/schemas";
import { outgoingPaymentSchema } from "@/features/money/schemas";
import { WorkOrderStatus } from "@/generated/prisma/enums";
import { formatINR, parseRupees } from "@/lib/money";
import { formToObject, indexedRows, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { markAttendance, type AttendanceEntry } from "@/server/services/attendance";
import {
  approveContractorBill,
  cancelContractorBill,
  createContractor,
  createContractorBill,
  createWorkOrder,
  setWorkOrderStatus,
  updateContractor,
} from "@/server/services/contractors";
import { createWorker, payWageSheet, setWorkerActive, updateWorker } from "@/server/services/labour";
import { recordPayment } from "@/server/services/ledger";

type Result = ActionResult<unknown>;

export async function createWorkerAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("labour.manage");
    const { id } = await createWorker(user, workerSchema.parse(formToObject(formData)));
    redirect(`/labour/${id}`);
  });
}

export async function updateWorkerAction(id: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("labour.manage");
    await updateWorker(user, id, workerSchema.parse(formToObject(formData)));
    redirect(`/labour/${id}`);
  });
}

export async function setWorkerActiveAction(id: string, active: boolean): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("labour.manage");
    await setWorkerActive(user, id, active === true);
    refresh();
    return { ok: true, message: active ? "Worker re-activated." : "Worker marked as left." };
  });
}

/** Pay a worker, an engineer or a contractor (wages, advance, salary, bill). */
export async function payPersonAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("payments.record");
    const input = outgoingPaymentSchema.parse(formToObject(formData));
    await recordPayment(user, input);
    refresh();
    return { ok: true, message: `${formatINR(input.amountPaise)} payment recorded.` };
  });
}

export async function saveAttendanceAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("attendance.record");
    const values = formToObject(formData);
    const { projectId, date } = attendanceSchema.parse(values);
    const rows = indexedRows(values, "people").map((r) => attendanceRowSchema.parse(r));
    const entries: AttendanceEntry[] = rows
      .filter((r) => r.status !== "")
      .map((r) => ({
        labourId: r.personType === "LABOUR" ? r.personId : null,
        engineerId: r.personType === "ENGINEER" ? r.personId : null,
        status: r.status as "PRESENT" | "HALF_DAY" | "ABSENT",
        overtimeHours: r.overtimeHours,
      }));
    if (entries.length === 0) throw new AppError("Mark at least one person as present, half day or absent.");
    const result = await markAttendance(user, { date, projectId, entries });
    refresh();
    return { ok: true, message: `Attendance saved: ${result.present} present, ${result.halfDay} half day, ${result.absent} absent.` };
  });
}

export async function payWageSheetAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("payments.record");
    const values = formToObject(formData);
    const input = wagePaymentSchema.parse(values);
    const lines = indexedRows(values, "lines").map((r) => {
      const amount = parseRupees(r.amount ?? "");
      if (amount === null || amount < 0n) throw new AppError("Amounts must be valid rupee values.");
      return { labourId: z.string().min(1).parse(r.labourId), amountPaise: amount };
    });
    const result = await payWageSheet(user, { ...input, lines });
    refresh();
    return { ok: true, message: `Paid ${formatINR(result.totalPaise)} to ${result.count} worker${result.count === 1 ? "" : "s"}.` };
  });
}

export async function createContractorAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("labour.manage");
    const { id } = await createContractor(user, contractorSchema.parse(formToObject(formData)));
    redirect(`/labour/contractors/${id}`);
  });
}

export async function updateContractorAction(id: string, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("labour.manage");
    await updateContractor(user, id, contractorSchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Contractor saved." };
  });
}

export async function createWorkOrderAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("labour.manage");
    await createWorkOrder(user, workOrderSchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Work order created." };
  });
}

export async function setWorkOrderStatusAction(id: string, status: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("labour.manage");
    await setWorkOrderStatus(user, id, z.enum(WorkOrderStatus).parse(status));
    refresh();
    return { ok: true, message: "Work order updated." };
  });
}

export async function createContractorBillAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("labour.manage");
    await createContractorBill(user, contractorBillSchema.parse(formToObject(formData)));
    refresh();
    return { ok: true, message: "Bill recorded." };
  });
}

export async function approveContractorBillAction(id: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("payments.record");
    await approveContractorBill(user, id);
    refresh();
    return { ok: true, message: "Bill approved." };
  });
}

export async function cancelContractorBillAction(id: string, reason: string): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("payments.record");
    if (!reason || reason.trim().length < 3) throw new AppError("Please write why the bill is cancelled.");
    await cancelContractorBill(user, id, reason.trim());
    refresh();
    return { ok: true, message: "Bill cancelled." };
  });
}
