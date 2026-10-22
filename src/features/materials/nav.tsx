import { SectionTabs } from "@/components/app/section-tabs";

export function MaterialsTabs({ requestsPending }: { requestsPending?: number }) {
  return (
    <SectionTabs
      tabs={[
        { href: "/materials", label: "Stock", exact: true },
        { href: "/materials/list", label: "Materials" },
        { href: "/materials/purchases", label: "Purchases" },
        { href: "/materials/suppliers", label: "Suppliers" },
        { href: "/materials/requests", label: "Requests", count: requestsPending },
      ]}
    />
  );
}
