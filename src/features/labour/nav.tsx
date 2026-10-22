import { SectionTabs } from "@/components/app/section-tabs";

export function LabourTabs() {
  return (
    <SectionTabs
      tabs={[
        { href: "/labour", label: "Workers", exact: true },
        { href: "/labour/attendance", label: "Attendance" },
        { href: "/labour/wages", label: "Wages" },
        { href: "/labour/contractors", label: "Labour contractors" },
      ]}
    />
  );
}
