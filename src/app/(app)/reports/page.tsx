import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { NoAccess } from "@/components/app/no-access";
import { PageHeader, Section } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { requireUser } from "@/server/auth/current-user";
import { reportsFor } from "@/server/reports/registry";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={8} />}>
      <Reports />
    </Suspense>
  );
}

async function Reports() {
  const user = await requireUser();
  const reports = reportsFor(user);
  if (reports.length === 0) return <NoAccess />;
  const groups = ["Projects", "Money", "Materials", "Labour"] as const;
  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader title="Reports" description="Every report can be filtered, printed (or saved as PDF) and downloaded as a CSV file for Excel." className="mb-0" />
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((g) => {
          const list = reports.filter((r) => r.group === g);
          if (list.length === 0) return null;
          return (
            <Section key={g} title={g}>
              <ul className="-my-2 flex flex-col divide-y">
                {list.map((r) => (
                  <li key={r.key}>
                    <Link href={`/reports/${r.key}`} className="flex items-center justify-between gap-3 py-3 hover:text-brand">
                      <span className="min-w-0">
                        <span className="block font-medium">{r.title}</span>
                        <span className="block text-sm text-muted-foreground">{r.description}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
