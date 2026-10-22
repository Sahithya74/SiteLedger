import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { AuditAction, Role } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { db } from "@/server/db";

export type Actor = { id: string; name: string; role: Role };

export type AuditEntry = {
  actor: Actor | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  projectId?: string | null;
  /** Plain-English sentence without the person's name, e.g. "recorded ₹50,000 client payment for Green Villa". */
  summary: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
};

/** Converts values Prisma returns (bigint, Decimal, Date) into plain JSON. */
export function toJsonSafe(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return convert(value) as Prisma.InputJsonValue;
}

function convert(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toString();
  if (Array.isArray(value)) return value.map(convert);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = convert(v);
    }
    return out;
  }
  return value;
}

/**
 * Writes an audit entry. Pass the transaction client so the entry is saved
 * (or rolled back) together with the change it describes.
 */
export async function audit(client: Tx | typeof db, entry: AuditEntry): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: entry.actor?.id ?? null,
      userName: entry.actor ? `${entry.actor.name} (${entry.actor.role === "ADMIN" ? "Owner" : "Manager"})` : "System",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      projectId: entry.projectId ?? null,
      summary: entry.summary.slice(0, 1000),
      before: entry.before === undefined ? undefined : toJsonSafe(entry.before),
      after: entry.after === undefined ? undefined : toJsonSafe(entry.after),
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

export type FieldSpec<T> = {
  key: keyof T & string;
  label: string;
  /** How to show the value in the summary (defaults to String(value)). */
  format?: (value: unknown) => string;
};

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(convert(a)) === JSON.stringify(convert(b));
}

/**
 * Compares two versions of a record and describes what changed:
 * "Quoted amount from ₹25,00,000.00 to ₹27,00,000.00; Status from Active to On hold".
 */
export function describeChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: FieldSpec<T>[],
): { changed: boolean; text: string; before: Partial<T>; after: Partial<T> } {
  const parts: string[] = [];
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const field of fields) {
    if (!(field.key in after)) continue;
    const oldValue = before[field.key];
    const newValue = after[field.key];
    if (sameValue(oldValue, newValue)) continue;
    const fmt = field.format ?? ((v: unknown) => (v === null || v === undefined || v === "" ? "blank" : String(v)));
    parts.push(`${field.label} from ${fmt(oldValue)} to ${fmt(newValue)}`);
    b[field.key] = oldValue;
    a[field.key] = newValue as T[typeof field.key];
  }
  return { changed: parts.length > 0, text: parts.join("; "), before: b, after: a };
}
