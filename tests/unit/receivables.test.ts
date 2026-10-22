import { describe, expect, it } from "vitest";
import { allocatePayments } from "@/lib/receivables";

const L = 100_000_00n;
const bill = (id: string, dueDate: string, lakhs: number, retentionLakhs = 0) => ({
  id,
  date: dueDate,
  dueDate,
  totalPaise: BigInt(lakhs) * L,
  retentionPaise: BigInt(retentionLakhs) * L,
});

describe("allocatePayments", () => {
  it("applies payments (including advances) to the oldest bill first", () => {
    const aged = allocatePayments([bill("ra2", "2026-10-09", 30), bill("ra1", "2026-08-01", 25)], 505n * L / 10n);
    expect(aged.map((b) => [b.id, b.outstandingPaise])).toEqual([
      ["ra1", 0n],
      ["ra2", 45n * L / 10n],
    ]);
  });

  it("does not ask for retention until it is released", () => {
    const [final] = allocatePayments([bill("final", "2026-10-11", 18, 1)], 17n * L);
    expect(final.duePaise).toBe(17n * L);
    expect(final.outstandingPaise).toBe(0n);
  });

  it("handles no payments and overpayment", () => {
    expect(allocatePayments([bill("a", "2026-10-01", 5)], 0n)[0].outstandingPaise).toBe(5n * L);
    expect(allocatePayments([bill("a", "2026-10-01", 5)], 9n * L)[0].outstandingPaise).toBe(0n);
  });
});
