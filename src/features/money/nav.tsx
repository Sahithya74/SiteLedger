import { SectionTabs } from "@/components/app/section-tabs";

export function AccountsTabs({ showBanks = true }: { showBanks?: boolean }) {
  return (
    <SectionTabs
      tabs={[
        { href: "/accounts", label: "Overview", exact: true },
        { href: "/accounts/income", label: "Money in" },
        { href: "/accounts/expenses", label: "Expenses" },
        { href: "/accounts/payments", label: "Payments made" },
        { href: "/accounts/payables", label: "We owe" },
        ...(showBanks
          ? [
              { href: "/accounts/banks", label: "Bank & cash" },
              { href: "/accounts/transactions", label: "All transactions" },
            ]
          : []),
      ]}
    />
  );
}
