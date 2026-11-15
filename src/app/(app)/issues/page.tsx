import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatTile } from "@/components/app/stat-tile";
import { ReportIssueDialog, UpdateIssueDialog } from "@/features/issues/issue-dialogs";
import type { IssueStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { PRIORITY } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { issueWorkItemOptions, listIssues } from "@/server/services/issues";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Site issues" };

const STATUS: Record<IssueStatus, { label: string; tone: "red" | "amber" | "green" }> = {
  OPEN: { label: "Open", tone: "red" },
  IN_PROGRESS: { label: "Being fixed", tone: "amber" },
  RESOLVED: { label: "Resolved", tone: "green" },
};

export default function IssuesPage(props: PageProps<"/issues">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={3} rows={8} />}>
      <Issues searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Issues({ searchParams }: { searchParams: PageProps<"/issues">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = param(sp, "status");
  const projectId = param(sp, "project");
  const manage = can(user, "issues.manage");
  const [rows, all, projects, workItems] = await Promise.all([
    listIssues(user, { projectId, status: status === "all" ? undefined : status && status in STATUS ? (status as IssueStatus) : "OPEN_ANY" }),
    listIssues(user, { status: "OPEN_ANY" }),
    projectOptions(user),
    manage ? issueWorkItemOptions(user) : Promise.resolve([]),
  ]);

  return (
    <div className="page-enter">
      <PageHeader
        title="Site issues"
        description="Problems on site and who is handling them. Open issues show on the dashboard."
        actions={manage && projects.length > 0 && <ReportIssueDialog projects={projects.map((p) => ({ value: p.id, label: p.name }))} workItems={workItems} defaultProjectId={projectId} />}
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatTile label="Open" value={all.filter((i) => i.status === "OPEN").length} tone={all.some((i) => i.status === "OPEN") ? "bad" : "good"} />
        <StatTile label="Being fixed" value={all.filter((i) => i.status === "IN_PROGRESS").length} tone="warn" />
        <StatTile label="Critical / high" value={all.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH").length} />
      </div>
      <FilterBar
        action="/issues"
        values={sp}
        fields={[
          { type: "select", name: "project", label: "Project", options: projects.map((p) => ({ value: p.id, label: p.name })) },
          {
            type: "select",
            name: "status",
            label: "Show",
            allLabel: "Not resolved",
            options: [
              { value: "OPEN", label: "Open" },
              { value: "IN_PROGRESS", label: "Being fixed" },
              { value: "RESOLVED", label: "Resolved" },
              { value: "all", label: "Everything" },
            ],
          },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No issues here" description="When something on site needs fixing, report it so it is followed up." />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(i) => i.id}
          rowClassName={(i) => (i.status !== "RESOLVED" && i.severity === "CRITICAL" ? "bg-red-50/60" : i.status === "RESOLVED" ? "text-muted-foreground" : undefined)}
          columns={[
            { header: "Issue", cell: (i) => <Cell2 main={i.title} sub={i.resolution && i.status === "RESOLVED" ? `Fixed: ${i.resolution}` : (i.description ?? i.workItem?.name ?? undefined)} /> },
            { header: "Project", hide: "md", cell: (i) => <Link href={`/projects/${i.project.id}`} className="hover:underline">{i.project.name}</Link> },
            { header: "Seriousness", cell: (i) => <ToneBadge tone={PRIORITY[i.severity].tone}>{PRIORITY[i.severity].label}</ToneBadge> },
            {
              header: "Status",
              cell: (i) => (
                <div className="flex flex-col items-start gap-0.5">
                  <ToneBadge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</ToneBadge>
                  <span className="text-xs text-muted-foreground">
                    {i.status === "RESOLVED" ? `on ${formatDate(i.resolvedOn)}` : `${i.daysOpen === 0 ? "today" : `${i.daysOpen} days open`}${i.assignedTo ? ` · ${i.assignedTo}` : ""}`}
                  </span>
                </div>
              ),
            },
            { header: "Reported", hide: "lg", cell: (i) => <Cell2 main={formatDate(i.reportedOn)} sub={i.reportedBy.name} /> },
            ...(manage
              ? [{ header: <span className="sr-only">Update</span>, align: "right" as const, cell: (i: (typeof rows)[number]) => <UpdateIssueDialog id={i.id} status={i.status} assignedTo={i.assignedTo} resolution={i.resolution} /> }]
              : []),
          ]}
        />
      )}
    </div>
  );
}
