import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { FilterBar, type FilterField } from "@/components/app/filter-bar";
import { NotFoundPanel } from "@/components/app/no-access";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { ReportTable } from "@/features/reports/report-table";
import { requireUser } from "@/server/auth/current-user";
import { reportParams } from "@/server/reports/format";
import { findReport } from "@/server/reports/registry";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Report" };

export default function ReportPage(props: PageProps<"/reports/[key]">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={12} />}>
      <Report params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

function query(sp: Record<string, string | string[] | undefined>) {
  return new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "")).toString();
}

async function Report({ params, searchParams }: { params: PageProps<"/reports/[key]">["params"]; searchParams: PageProps<"/reports/[key]">["searchParams"] }) {
  const user = await requireUser();
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const def = findReport(user, key);
  if (!def) return <NotFoundPanel what="report" backHref="/reports" backLabel="All reports" />;
  const { params: p, period } = reportParams(def, sp);
  const [result, projects] = await Promise.all([def.run(user, p), def.project ? projectOptions(user, { includeClosed: true }) : Promise.resolve([])]);
  const fields: FilterField[] = [
    ...(def.period ? [{ type: "period" as const, fallback: def.defaultPeriod ?? "this-month" }] : []),
    ...(def.project ? [{ type: "select" as const, name: "project", label: "Project", options: projects.map((x) => ({ value: x.id, label: x.name })) }] : []),
  ];
  const qs = query(sp);

  return (
    <div className="page-enter flex flex-col gap-4">
      <PageHeader
        title={def.title}
        description={[def.description, period?.label].filter(Boolean).join(" · ")}
        back={{ href: "/reports", label: "Reports" }}
        className="mb-0"
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href={`/print/report/${def.key}${qs ? `?${qs}` : ""}`} target="_blank">
                <Printer className="size-4" /> Print / PDF
              </Link>
            </Button>
            <Button asChild size="lg">
              <a href={`/api/export?report=${def.key}${qs ? `&${qs}` : ""}`}>
                <Download className="size-4" /> Download CSV
              </a>
            </Button>
          </>
        }
      />
      {fields.length > 0 && <FilterBar action={`/reports/${def.key}`} values={sp} fields={fields} />}
      <ReportTable result={result} />
      {result.note && <p className="text-sm text-muted-foreground">{result.note}</p>}
    </div>
  );
}
