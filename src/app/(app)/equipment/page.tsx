import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import type { EquipmentStatus } from "@/generated/prisma/enums";
import { describeDue } from "@/lib/dates";
import { EQUIPMENT_STATUS, EQUIPMENT_TYPE } from "@/lib/labels";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listEquipment } from "@/server/services/equipment";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Equipment" };

export default function EquipmentPage(props: PageProps<"/equipment">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} rows={8} />}>
      <EquipmentList searchParams={props.searchParams} />
    </Suspense>
  );
}

async function EquipmentList({ searchParams }: { searchParams: PageProps<"/equipment">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = param(sp, "status") as EquipmentStatus | undefined;
  const [rows, all, projects] = await Promise.all([
    listEquipment(user, { status: status && status in EQUIPMENT_STATUS ? status : undefined, projectId: param(sp, "project"), q: param(sp, "q") }),
    listEquipment(user),
    projectOptions(user),
  ]);

  return (
    <div className="page-enter">
      <PageHeader
        title="Equipment"
        description="Machines you own or rent — where they are, hours used, services and costs."
        actions={
          can(user, "equipment.manage") && (
            <Button asChild size="lg">
              <Link href="/equipment/new">
                <Plus className="size-4" /> Add equipment
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="In use" value={all.filter((e) => e.status === "IN_USE").length} href="/equipment?status=IN_USE" />
        <StatTile label="Available" value={all.filter((e) => e.status === "AVAILABLE").length} tone="good" href="/equipment?status=AVAILABLE" />
        <StatTile label="Under repair / out of order" value={all.filter((e) => e.status === "UNDER_MAINTENANCE" || e.status === "OUT_OF_ORDER").length} tone="warn" />
        <StatTile label="Service due" value={all.filter((e) => e.serviceDue).length} tone={all.some((e) => e.serviceDue) ? "bad" : "default"} />
      </div>
      <FilterBar
        action="/equipment"
        values={sp}
        fields={[
          { type: "search", placeholder: "Name or code…" },
          { type: "select", name: "status", label: "Status", options: Object.entries(EQUIPMENT_STATUS).map(([value, s]) => ({ value, label: s.label })) },
          { type: "select", name: "project", label: "At site", options: projects.map((p) => ({ value: p.id, label: p.name })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Truck} title="No equipment here" description="Add mixers, vibrators, generators or rented JCBs to track where they are and what they cost." />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(e) => e.id}
          columns={[
            { header: "Equipment", cell: (e) => <Cell2 main={<Link href={`/equipment/${e.id}`} className="hover:underline">{e.name}</Link>} sub={`${e.code} · ${EQUIPMENT_TYPE[e.type]}`} /> },
            {
              header: "Own / rented",
              hide: "md",
              cell: (e) =>
                e.ownership === "OWNED" ? "Own" : <Cell2 main="Rented" sub={[e.supplier?.name, e.rentalRatePaise && `${formatINR(e.rentalRatePaise, { paise: false })}/${e.rentalUnit?.toLowerCase()}`].filter(Boolean).join(" · ")} />,
            },
            { header: "Where", cell: (e) => e.currentProject?.name ?? <span className="text-muted-foreground">Store / yard</span> },
            {
              header: "Status",
              cell: (e) => (
                <div className="flex flex-col items-start gap-0.5">
                  <ToneBadge tone={EQUIPMENT_STATUS[e.status].tone}>{EQUIPMENT_STATUS[e.status].label}</ToneBadge>
                  {e.nextService && <span className={e.serviceDue ? "text-xs font-medium text-red-700" : "text-xs text-muted-foreground"}>Service {describeDue(e.nextService).toLowerCase()}</span>}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
