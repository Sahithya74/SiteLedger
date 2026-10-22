"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { zOptionalQuantity } from "@/features/materials/schemas";
import { EquipmentStatus, EquipmentType, Ownership, RentalUnit } from "@/generated/prisma/enums";
import { zDate, zEnum, zId, zOptionalDate, zOptionalId, zOptionalMoney, zOptionalText, zText } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { createEquipment, recordMaintenance, recordUsage, setEquipmentStatus, updateEquipment } from "@/server/services/equipment";

type Result = ActionResult<unknown>;

const equipmentSchema = z.object({
  name: zText("Name", 120),
  type: zEnum(EquipmentType, "Type"),
  ownership: zEnum(Ownership, "Own or rented"),
  supplierId: zOptionalId(),
  rentalRatePaise: zOptionalMoney("Rent"),
  rentalUnit: z.preprocess((v) => (v === "" ? null : v), z.enum(RentalUnit).nullable().optional().default(null)),
  registrationNo: zOptionalText(40),
  purchaseDate: zOptionalDate("Bought on"),
  purchaseCostPaise: zOptionalMoney("Cost"),
  operatorName: zOptionalText(100),
  notes: zOptionalText(1000),
});

export async function saveEquipmentAction(id: string | null, _prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("equipment.manage");
    const input = equipmentSchema.parse(formToObject(formData));
    if (id) {
      await updateEquipment(user, id, input);
      redirect(`/equipment/${id}`);
    }
    const created = await createEquipment(user, input);
    redirect(`/equipment/${created.id}`);
  });
}

export async function setEquipmentStatusAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("equipment.manage");
    const input = z
      .object({ id: zId("Equipment"), status: zEnum(EquipmentStatus, "Status"), projectId: zOptionalId(), note: zOptionalText(300) })
      .parse(formToObject(formData));
    await setEquipmentStatus(user, input.id, input);
    refresh();
    return { ok: true, message: "Status updated." };
  });
}

export async function recordUsageAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("equipment.manage");
    const input = z
      .object({
        equipmentId: zId("Equipment"),
        projectId: zId("Site"),
        date: zDate("Date"),
        hours: zOptionalQuantity("Hours"),
        fuelLitres: zOptionalQuantity("Fuel"),
        operatorName: zOptionalText(100),
        notes: zOptionalText(500),
      })
      .parse(formToObject(formData));
    await recordUsage(user, input);
    refresh();
    return { ok: true, message: "Usage saved." };
  });
}

export async function recordMaintenanceAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("equipment.manage");
    const input = z
      .object({ equipmentId: zId("Equipment"), date: zDate("Date"), description: zText("What was done", 300), nextDueDate: zOptionalDate("Next service"), notes: zOptionalText(500) })
      .parse(formToObject(formData));
    await recordMaintenance(user, input);
    refresh();
    return { ok: true, message: "Service recorded." };
  });
}
