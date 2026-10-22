import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { TableSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { Attachments } from "@/features/documents/attachments";
import { formatDate } from "@/lib/dates";
import { EQUIPMENT_STATUS, WEATHER } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { listDailyReports } from "@/server/services/daily-reports";
import { listEquipment } from "@/server/services/equipment";
import { getProject } from "@/server/services/projects";

export const metadata: Metadata = { title: "Site diary" };

export default function ProjectSitePage(props: PageProps<"/projects/[id]/site">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <ProjectSite params={props.params} />
    </Suspense>
  );
}

async function ProjectSite({ params }: { params: PageProps<"/projects/[id]/site">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(user, id);
  if (!project) return null;
  const [reports, equipment] = await Promise.all([listDailyReports(user, { projectId: id }), listEquipment(user, { projectId: id })]);

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Daily reports"
        actions={
          can(user, "dailyReports.manage") && (
            <Button asChild size="sm">
              <Link href={`/daily-reports/new?project=${id}`}>
                <ClipboardList className="size-4" /> Today’s report
              </Link>
            </Button>
          )
        }
      >
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No daily reports yet.</p>
        ) : (
          <SimpleTable
            rows={reports.slice(0, 14)}
            rowKey={(r) => r.id}
            columns={[
              { header: "Date", cell: (r) => <Link href={`/daily-reports/${r.id}`} className="font-medium hover:underline">{formatDate(r.date)}</Link> },
              { header: "Work done", cell: (r) => <span className="line-clamp-2 text-sm">{r.workCompleted}</span> },
              { header: "Workers", align: "right", cell: (r) => r.labourPresent },
              { header: "Weather", hide: "sm", cell: (r) => WEATHER[r.weather] },
            ]}
          />
        )}
      </Section>
      <Section title="Equipment at this site">
        {equipment.length === 0 ? (
          <p className="text-sm text-muted-foreground">No equipment is at this site.</p>
        ) : (
          <SimpleTable
            rows={equipment}
            rowKey={(e) => e.id}
            columns={[
              { header: "Equipment", cell: (e) => <Cell2 main={<Link href={`/equipment/${e.id}`} className="hover:underline">{e.name}</Link>} sub={e.code} /> },
              { header: "Status", cell: (e) => <ToneBadge tone={EQUIPMENT_STATUS[e.status].tone}>{EQUIPMENT_STATUS[e.status].label}</ToneBadge> },
              { header: "Operator", hide: "sm", cell: (e) => e.operatorName ?? "—" },
            ]}
          />
        )}
      </Section>
      <Attachments entityType="PROJECT" entityId={id} projectId={id} title="Project documents and photos" />
    </div>
  );
}
