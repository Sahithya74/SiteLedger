import { SectionTabs } from "@/components/app/section-tabs";

export function ClientsTabs({ overdue, cheques }: { overdue?: number; cheques?: number }) {
  return (
    <SectionTabs
      tabs={[
        { href: "/clients", label: "Clients", exact: true },
        { href: "/clients/quotations", label: "Quotations" },
        { href: "/clients/bills", label: "Bills" },
        { href: "/clients/payments", label: "Payments received" },
        { href: "/clients/pending", label: "Pending", count: overdue },
        { href: "/clients/cheques", label: "Cheques", count: cheques },
      ]}
    />
  );
}
