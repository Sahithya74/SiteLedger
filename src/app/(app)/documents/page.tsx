import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FileText, FolderOpen, ImageIcon } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, param } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import type { DocumentEntity, DocumentKind } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";
import { DOCUMENT_ENTITY, DOCUMENT_KIND } from "@/lib/labels";
import { requireUser } from "@/server/auth/current-user";
import { listDocuments } from "@/server/services/documents";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Documents" };

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function DocumentsPage(props: PageProps<"/documents">) {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={10} />}>
      <Documents searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Documents({ searchParams }: { searchParams: PageProps<"/documents">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const kind = param(sp, "kind") as DocumentKind | undefined;
  const entity = param(sp, "on") as DocumentEntity | undefined;
  const [rows, projects] = await Promise.all([
    listDocuments(user, {
      projectId: param(sp, "project"),
      kind: kind && kind in DOCUMENT_KIND ? kind : undefined,
      entityType: entity && entity in DOCUMENT_ENTITY ? entity : undefined,
      q: param(sp, "q"),
    }),
    projectOptions(user, { includeClosed: true }),
  ]);

  return (
    <div className="page-enter">
      <PageHeader title="Documents" description="Every bill, photo, drawing and agreement uploaded anywhere in SITECORE. Upload from the page it belongs to." />
      <FilterBar
        action="/documents"
        values={sp}
        fields={[
          { type: "search", placeholder: "Title or file name…" },
          { type: "select", name: "project", label: "Project", options: projects.map((p) => ({ value: p.id, label: p.name })) },
          { type: "select", name: "kind", label: "Kind", options: Object.entries(DOCUMENT_KIND).map(([value, label]) => ({ value, label })) },
          { type: "select", name: "on", label: "Attached to", options: Object.entries(DOCUMENT_ENTITY).map(([value, e]) => ({ value, label: e.label })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No documents found" description="Attach supplier bills to purchases, site photos to daily reports, and agreements to projects." />
      ) : (
        <SimpleTable
          rows={rows}
          rowKey={(d) => d.id}
          columns={[
            {
              header: "Document",
              cell: (d) => (
                <a href={`/api/files/${d.id}`} target="_blank" rel="noopener" className="flex items-center gap-2 hover:underline">
                  {d.mimeType.startsWith("image/") ? <ImageIcon className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                  <Cell2 main={d.title} sub={`${d.fileName} · ${size(d.sizeBytes)}`} />
                </a>
              ),
            },
            { header: "Kind", hide: "sm", cell: (d) => DOCUMENT_KIND[d.kind] },
            {
              header: "Attached to",
              cell: (d) => {
                const e = DOCUMENT_ENTITY[d.entityType];
                const label = e?.label ?? d.entityType;
                return <Cell2 main={e?.href ? <Link href={e.href(d.entityId)} className="hover:underline">{label}</Link> : label} sub={d.project?.name} />;
              },
            },
            { header: "Uploaded", hide: "md", cell: (d) => <Cell2 main={d.uploadedBy.name} sub={formatDateTime(d.createdAt)} /> },
          ]}
        />
      )}
    </div>
  );
}
