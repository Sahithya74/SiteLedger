import "server-only";
import type { Tx } from "@/server/db";

export const CODE_PREFIX = {
  project: "PRJ",
  client: "CL",
  engineer: "ENG",
  labour: "LB",
  contractor: "LC",
  material: "MAT",
  supplier: "SUP",
  purchase: "PO",
  payment: "PAY",
  receipt: "RCPT",
  expense: "EXP",
  income: "INC",
  quotation: "QT",
  invoice: "INV",
  workOrder: "WO",
  contractorBill: "CB",
  wageSettlement: "WS",
  materialRequest: "MR",
  equipment: "EQ",
} as const;

export type CodeKind = keyof typeof CODE_PREFIX;

/**
 * Next friendly number for a record type, e.g. "PRJ-0007".
 * Uses an atomic INSERT … ON CONFLICT UPDATE so two people saving at the same
 * moment never get the same number.
 */
export async function nextCode(tx: Tx, kind: CodeKind): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Sequence" ("name", "value") VALUES (${kind}, 1)
    ON CONFLICT ("name") DO UPDATE SET "value" = "Sequence"."value" + 1
    RETURNING "value"`;
  return `${CODE_PREFIX[kind]}-${String(rows[0].value).padStart(4, "0")}`;
}
