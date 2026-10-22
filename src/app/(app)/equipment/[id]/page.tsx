import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { Money } from "@/components/app/money";
import { NotFoundPanel } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/ui/button";
import { Attachments } from "@/features/documents/attachments";
import { EquipmentStatusDialog, MaintenanceDialog, UsageDialog } from "@/features/equipment/equipment-widgets";
import { expenseDialogData } from "@/features/money/dialog-data";
import { ExpenseDialog } from "@/features/money/money-dialogs";
import { describeDue, formatDate } from "@/lib/dates";
import { EQUIPMENT_STATUS, EQUIPMENT_TYPE } from "@/lib/labels";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { getEquipment } from "@/server/services/equipment";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Equipment" };

export default function EquipmentDetailPage(props: PageProps<"/equipment/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={4} />}>
      <EquipmentDetail params={props.params} />
    </Suspense>
  );
}

async function EquipmentDetail({ params }: { params: PageProps<"/equipment/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const e = await getEquipment(user, id);
  if (!e) return <NotFoundPanel what="equipment" backHref="/equipment" backLabel="Back to equipment" />;
  const manage = can(user, "equipment.manage");
  const [projects, expDialog] = await Promise.all([projectOptions(user), can(user, "expenses.record") ? expenseDialogData(user) : Promise.resolve(null)]);
  const projectOpts = projects.map((p) => ({ value: p.id, label: p.name }));
  const nextService = e.maintenance.find((m) => m.nextDueDate)?.nextDueDate ?? null;

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {e.name}
            <ToneBadge tone={EQUIPMENT_STATUS[e.status].tone}>{EQUIPMENT_STATUS[e.status].label}</ToneBadge>
          </span>
        }
        description={[
          e.code,
          EQUIPMENT_TYPE[e.type],
          e.ownership === "RENTED" ? `Rented${e.supplier ? ` from ${e.supplier.name}` : ""}${e.rentalRatePaise ? ` at ${formatINR(e.rentalRatePaise, { paise: false })}/${e.rentalUnit?.toLowerCase()}` : ""}` : "Own",
          e.registrationNo,
          e.currentProject ? `at ${e.currentProject.name}` : "in store / yard",
        ]
          .filter(Boolean)
          .join(" · ")}
        back={{ href: "/equipment", label: "Equipment" }}
        className="mb-0"
        actions={
          manage && (
            <>
              <UsageDialog equipmentId={e.id} projects={projectOpts} defaultProjectId={e.currentProjectId} operator={e.operatorName} />
              <EquipmentStatusDialog id={e.id} status={e.status} projectId={e.currentProjectId} projects={projectOpts} />
              <MaintenanceDialog equipmentId={e.id} />
              {expDialog && (
                <ExpenseDialog
                  categories={expDialog.categories}
                  projects={expDialog.projects}
                  accounts={expDialog.accounts}
                  allowOffice={expDialog.allowOffice}
                  defaultProjectId={e.currentProjectId ?? undefined}
                  equipmentId={e.id}
                  label="Rent / fuel / repair cost"
                />
              )}
              <Button asChild variant="ghost" size="lg">
                <Link href={`/equipment/${e.id}/edit`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
            </>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Hours logged" value={e.totals.hours.toLocaleString("en-IN")} sub="Last 60 entries" />
        <StatTile label="Fuel" value={`${e.totals.fuelLitres.toLocaleString("en-IN")} L`} />
        <StatTile label="Costs recorded" value={<Money paise={e.totals.costPaise} short />} sub="Rent, fuel, repairs" />
        <StatTile label="Next service" value={nextService ? formatDate(nextService) : "—"} sub={nextService ? describeDue(nextService) : "Not scheduled"} tone={nextService && describeDue(nextService).includes("late") ? "bad" : "default"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Usage">
          {e.usage.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage logged yet.</p>
          ) : (
            <SimpleTable
              rows={e.usage}
              rowKey={(u) => u.id}
              columns={[
                { header: "Date", cell: (u) => <Cell2 main={formatDate(u.date)} sub={u.project.name} /> },
                { header: "Hours", align: "right", cell: (u) => u.hours ?? "—" },
                { header: "Fuel (L)", align: "right", cell: (u) => u.fuelLitres ?? "—" },
                { header: "Operator", hide: "sm", cell: (u) => u.operatorName ?? "—" },
              ]}
            />
          )}
        </Section>
        <Section title="Costs" description="Expenses recorded against this equipment.">
          {e.expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No costs recorded yet.</p>
          ) : (
            <SimpleTable
              rows={e.expenses}
              rowKey={(x) => x.id}
              columns={[
                { header: "Date", cell: (x) => formatDate(x.date) },
                { header: "What", cell: (x) => <Cell2 main={x.description} sub={[x.category.name, x.project?.name].filter(Boolean).join(" · ")} /> },
                { header: "Amount", align: "right", cell: (x) => <Money paise={x.amountPaise} colorNegative /> },
              ]}
            />
          )}
        </Section>
      </div>

      <Section title="Service history">
        {e.maintenance.length === 0 ? (
          <p className="text-sm text-muted-foreground">No services recorded.</p>
        ) : (
          <SimpleTable
            rows={e.maintenance}
            rowKey={(m) => m.id}
            columns={[
              { header: "Date", cell: (m) => formatDate(m.date) },
              { header: "Work done", cell: (m) => <Cell2 main={m.description} sub={m.notes ?? undefined} /> },
              { header: "Next due", cell: (m) => (m.nextDueDate ? formatDate(m.nextDueDate) : "—") },
            ]}
          />
        )}
      </Section>

      <Attachments entityType="EQUIPMENT" entityId={e.id} projectId={e.currentProjectId} title="Papers and photos" />
    </div>
  );
}
