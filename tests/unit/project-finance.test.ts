import { describe, expect, it } from "vitest";
import { computeProjectMoney, EMPTY_MONEY_INPUT } from "@/lib/project-finance";

const L = 100_000_00n; // one lakh rupees in paise

describe("computeProjectMoney", () => {
  it("adds approved variations to the contract value", () => {
    const m = computeProjectMoney({ ...EMPTY_MONEY_INPUT, contractPaise: 25n * L, approvedVariationsPaise: 2n * L });
    expect(m.projectValuePaise).toBe(27n * L);
  });

  it("falls back to the quoted amount when no contract value is set", () => {
    const m = computeProjectMoney({ ...EMPTY_MONEY_INPUT, quotedPaise: 20n * L });
    expect(m.projectValuePaise).toBe(20n * L);
  });

  it("counts client TDS as received and computes pending", () => {
    const m = computeProjectMoney({
      ...EMPTY_MONEY_INPUT,
      contractPaise: 50n * L,
      billedPaise: 30n * L,
      receivedCashPaise: 19n * L + 60_000_00n,
      clientTdsPaise: 40_000_00n,
    });
    expect(m.receivedPaise).toBe(20n * L);
    expect(m.pendingFromClientPaise).toBe(30n * L);
    expect(m.billedNotReceivedPaise).toBe(10n * L);
  });

  it("totals costs and profit", () => {
    const m = computeProjectMoney({
      ...EMPTY_MONEY_INPUT,
      contractPaise: 100n * L,
      receivedCashPaise: 40n * L,
      materialsPaise: 20n * L,
      labourPaise: 10n * L,
      engineersPaise: 3n * L,
      contractorsPaise: 5n * L,
      expensesPaise: 2n * L,
      estimatedCostPaise: 80n * L,
    });
    expect(m.spentPaise).toBe(40n * L);
    expect(m.cashPositionPaise).toBe(0n);
    expect(m.estimatedProfitPaise).toBe(20n * L);
    expect(m.profitIfNoMoreCostPaise).toBe(60n * L);
    expect(m.budgetUsed).toBe(0.5);
  });

  it("uses actual spend when it exceeds the estimate", () => {
    const m = computeProjectMoney({
      ...EMPTY_MONEY_INPUT,
      contractPaise: 100n * L,
      materialsPaise: 90n * L,
      estimatedCostPaise: 80n * L,
    });
    expect(m.estimatedProfitPaise).toBe(10n * L);
    expect(m.budgetUsed).toBe(1.125);
  });

  it("never reports negative 'billed not received'", () => {
    const m = computeProjectMoney({ ...EMPTY_MONEY_INPUT, billedPaise: 5n * L, receivedCashPaise: 8n * L });
    expect(m.billedNotReceivedPaise).toBe(0n);
  });
});
