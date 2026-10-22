/**
 * Project money summary (pure function, unit tested).
 *
 * Costs are counted when they are INCURRED, not when they are paid, so a
 * cement purchase counts as a material cost even if the supplier is not yet
 * paid. Payments that only settle something already counted (paying a
 * purchase, paying wages, giving an advance) are never counted again.
 */
import { type Paise, sumPaise } from "@/lib/money";

export type ProjectMoneyInput = {
  quotedPaise: Paise;
  contractPaise: Paise;
  approvedVariationsPaise: Paise;
  billedPaise: Paise; // issued client bills (incl. tax)
  receivedCashPaise: Paise; // client payments received
  clientTdsPaise: Paise; // TDS deducted by the client (settles the bill)
  materialsPaise: Paise; // purchases for the project
  labourPaise: Paise; // wages earned (attendance)
  engineersPaise: Paise; // engineer wages earned + salaries charged
  contractorsPaise: Paise; // approved labour-contractor bills (gross)
  expensesPaise: Paise; // other expenses (transport, food, rent, equipment…)
  estimatedCostPaise: Paise; // budget, or sum of work-item estimates
};

export type ProjectMoney = {
  /** Contract value after approved extra work / variations. */
  projectValuePaise: Paise;
  /** Cash received + TDS the client deducted. */
  receivedPaise: Paise;
  /** What the client still has to pay against the full project value. */
  pendingFromClientPaise: Paise;
  /** Billed but not yet received. */
  billedNotReceivedPaise: Paise;
  /** All costs incurred so far. */
  spentPaise: Paise;
  /** Received − spent: positive means the project has funded itself so far. */
  cashPositionPaise: Paise;
  /** Value − estimated total cost. */
  estimatedProfitPaise: Paise;
  /** Value − spent so far (equals the final profit once the project is complete). */
  profitIfNoMoreCostPaise: Paise;
  /** Spent as a share of the estimated cost (0..∞). */
  budgetUsed: number | null;
};

export function computeProjectMoney(input: ProjectMoneyInput): ProjectMoney {
  const projectValuePaise = (input.contractPaise > 0n ? input.contractPaise : input.quotedPaise) + input.approvedVariationsPaise;
  const receivedPaise = input.receivedCashPaise + input.clientTdsPaise;
  const spentPaise = sumPaise([
    input.materialsPaise,
    input.labourPaise,
    input.engineersPaise,
    input.contractorsPaise,
    input.expensesPaise,
  ]);
  const billedNotReceived = input.billedPaise - receivedPaise;
  return {
    projectValuePaise,
    receivedPaise,
    pendingFromClientPaise: projectValuePaise - receivedPaise,
    billedNotReceivedPaise: billedNotReceived > 0n ? billedNotReceived : 0n,
    spentPaise,
    cashPositionPaise: receivedPaise - spentPaise,
    estimatedProfitPaise: projectValuePaise - (input.estimatedCostPaise > spentPaise ? input.estimatedCostPaise : spentPaise),
    profitIfNoMoreCostPaise: projectValuePaise - spentPaise,
    budgetUsed: input.estimatedCostPaise > 0n ? Number((spentPaise * 1000n) / input.estimatedCostPaise) / 1000 : null,
  };
}

export const EMPTY_MONEY_INPUT: ProjectMoneyInput = {
  quotedPaise: 0n,
  contractPaise: 0n,
  approvedVariationsPaise: 0n,
  billedPaise: 0n,
  receivedCashPaise: 0n,
  clientTdsPaise: 0n,
  materialsPaise: 0n,
  labourPaise: 0n,
  engineersPaise: 0n,
  contractorsPaise: 0n,
  expensesPaise: 0n,
  estimatedCostPaise: 0n,
};
