/**
 * Work progress calculations (pure functions, unit tested).
 *
 * A project's work breakdown has phases (parentId = null) that contain work
 * items. Progress is measured on the lowest-level items ("leaves") and rolled
 * up. Items are weighted by estimated cost when every leaf has one, otherwise
 * every item counts equally — so a ₹5 lakh slab weighs more than a ₹20,000
 * painting touch-up, but a breakdown without costs still works.
 */
import { diffDays, type ISODate } from "@/lib/dates";

export type ProgressItem = {
  id: string;
  parentId: string | null;
  status: string;
  percentComplete: number;
  estimatedCostPaise: bigint;
  startDate?: ISODate | null;
  expectedEndDate?: ISODate | null;
};

/** A completed item always counts as 100%, whatever percentage was typed. */
export function effectivePercent(item: Pick<ProgressItem, "status" | "percentComplete">): number {
  if (item.status === "COMPLETED") return 100;
  return Math.max(0, Math.min(100, item.percentComplete));
}

/** Leaves = items that have no children. A phase with no items counts as a leaf. */
export function leafItems<T extends ProgressItem>(items: T[]): T[] {
  const parents = new Set(items.map((i) => i.parentId).filter(Boolean));
  return items.filter((i) => !parents.has(i.id));
}

function weights(items: ProgressItem[]): number[] {
  const allCosted = items.length > 0 && items.every((i) => i.estimatedCostPaise > 0n);
  return items.map((i) => (allCosted ? Number(i.estimatedCostPaise) : 1));
}

function weightedAverage(values: number[], w: number[]): number {
  const total = w.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return values.reduce((sum, v, idx) => sum + v * w[idx], 0) / total;
}

/** Overall % complete of a set of items (rounded to a whole number). */
export function overallProgress(items: ProgressItem[]): number {
  const leaves = leafItems(items);
  if (leaves.length === 0) return 0;
  return Math.round(weightedAverage(leaves.map(effectivePercent), weights(leaves)));
}

/** % complete for each phase, keyed by phase id. */
export function phaseProgress(items: ProgressItem[]): Map<string, number> {
  const result = new Map<string, number>();
  const byParent = new Map<string, ProgressItem[]>();
  for (const item of items) {
    if (item.parentId) {
      const list = byParent.get(item.parentId) ?? [];
      list.push(item);
      byParent.set(item.parentId, list);
    }
  }
  for (const phase of items.filter((i) => !i.parentId)) {
    const children = byParent.get(phase.id);
    result.set(
      phase.id,
      children?.length
        ? Math.round(weightedAverage(children.map(effectivePercent), weights(children)))
        : effectivePercent(phase),
    );
  }
  return result;
}

/**
 * Where the work SHOULD be today according to the planned dates
 * (straight line between start and expected end). Items without dates are
 * ignored. Returns null when nothing has dates.
 */
export function plannedProgress(items: ProgressItem[], today: ISODate): number | null {
  const scheduled = leafItems(items).filter((i) => i.startDate && i.expectedEndDate);
  if (scheduled.length === 0) return null;
  const planned = scheduled.map((i) => {
    const total = diffDays(i.expectedEndDate!, i.startDate!);
    const elapsed = diffDays(today, i.startDate!);
    if (elapsed <= 0) return 0;
    if (total <= 0 || elapsed >= total) return 100;
    return (elapsed / total) * 100;
  });
  return Math.round(weightedAverage(planned, weights(scheduled)));
}

/** Items still open after their expected end date. */
export function isOverdue(item: Pick<ProgressItem, "status" | "expectedEndDate">, today: ISODate): boolean {
  if (item.status === "COMPLETED" || !item.expectedEndDate) return false;
  return item.expectedEndDate < today;
}

/**
 * Keeps status and percentage consistent when someone saves a work item:
 * 100% means completed, completed means 100%, and work with progress has
 * started. A completion date is filled in when work is completed.
 */
export function normalizeWorkUpdate<T extends { status: string; percentComplete: number; actualEndDate: ISODate | null }>(
  input: T,
  today: ISODate,
): T {
  const out = { ...input };
  if (out.percentComplete >= 100 && out.status !== "ON_HOLD") out.status = "COMPLETED";
  if (out.status === "COMPLETED") {
    out.percentComplete = 100;
    out.actualEndDate ??= today;
  } else {
    out.actualEndDate = null;
    if (out.status === "NOT_STARTED" && out.percentComplete > 0) out.status = "IN_PROGRESS";
  }
  return out;
}

/**
 * True if making `itemId` depend on `newDependsOn` would create a loop
 * (A waits for B, B waits for A). `edges` maps item → items it depends on.
 */
export function createsDependencyCycle(edges: Map<string, string[]>, itemId: string, newDependsOn: string[]): boolean {
  const stack = [...newDependsOn];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === itemId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(edges.get(current) ?? []));
  }
  return false;
}

export type ScheduleHealth = {
  actual: number;
  planned: number | null;
  /** Percentage points behind plan (positive = behind). */
  gap: number | null;
  state: "ahead" | "on_track" | "slightly_behind" | "behind" | "unknown";
};

export function scheduleHealth(items: ProgressItem[], today: ISODate): ScheduleHealth {
  const actual = overallProgress(items);
  const planned = plannedProgress(items, today);
  if (planned === null) return { actual, planned, gap: null, state: "unknown" };
  const gap = planned - actual;
  let state: ScheduleHealth["state"] = "on_track";
  if (gap <= -5) state = "ahead";
  else if (gap > 15) state = "behind";
  else if (gap > 5) state = "slightly_behind";
  return { actual, planned, gap, state };
}
