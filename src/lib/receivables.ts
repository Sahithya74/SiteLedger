/**
 * Client bill ageing (pure, unit tested).
 *
 * Everything a client has paid on a project (advances included, TDS counted
 * as paid) is applied to that project's bills oldest-due first, the way an
 * accountant would. What is left on each bill is its outstanding amount.
 * Retention held back by the client is not due until it is released.
 */
import type { Paise } from "@/lib/money";

export type BillForAgeing = {
  id: string;
  dueDate: string | null; // ISO date
  date: string; // bill date
  totalPaise: Paise;
  retentionPaise: Paise;
};

export type AgedBill<T extends BillForAgeing> = T & { duePaise: Paise; paidPaise: Paise; outstandingPaise: Paise };

export function allocatePayments<T extends BillForAgeing>(bills: T[], totalPaidPaise: Paise): AgedBill<T>[] {
  const ordered = [...bills].sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date) || a.date.localeCompare(b.date));
  let available = totalPaidPaise > 0n ? totalPaidPaise : 0n;
  return ordered.map((bill) => {
    const due = bill.totalPaise - bill.retentionPaise;
    const paid = available >= due ? due : available;
    available -= paid;
    return { ...bill, duePaise: due, paidPaise: paid, outstandingPaise: due - paid };
  });
}
