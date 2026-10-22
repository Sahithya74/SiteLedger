import { FileText, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Section } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import type { DocumentEntity } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";
import { documentsFor } from "@/server/services/documents";
import { deleteDocumentAction } from "./actions";
import { UploadButton } from "./upload-button";

/** Photos and files attached to one record, with an upload button. */
export async function Attachments({
  entityType,
  entityId,
  projectId,
  title = "Photos & documents",
  camera = true,
}: {
  entityType: DocumentEntity;
  entityId: string;
  projectId?: string | null;
  title?: string;
  camera?: boolean;
}) {
  const user = await requireUser();
  const docs = await documentsFor(user, entityType, entityId);
  const images = docs.filter((d) => d.mimeType.startsWith("image/"));
  const files = docs.filter((d) => !d.mimeType.startsWith("image/"));
  return (
    <Section
      title={title}
      actions={can(user, "documents.upload") ? <UploadButton entityType={entityType} entityId={entityId} projectId={projectId} camera={camera} /> : undefined}
    >
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing attached yet. Bills, receipts, drawings and site photos can be added here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((d) => (
                <a key={d.id} href={`/api/files/${d.id}`} target="_blank" rel="noopener" className="group relative block aspect-square overflow-hidden rounded-lg border bg-muted" title={d.title}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, permission-checked files */}
                  <img src={`/api/files/${d.id}`} alt={d.title} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
                </a>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <ul className="flex flex-col divide-y rounded-lg border">
              {files.map((d) => (
                <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <a href={`/api/files/${d.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate hover:underline">
                    {d.title}
                  </a>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{formatDateTime(d.createdAt)}</span>
                  {(d.uploadedById === user.id || user.role === "ADMIN") && (
                    <ConfirmAction
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${d.title}`}>
                          <Trash2 className="size-4" />
                        </Button>
                      }
                      title="Remove this attachment?"
                      description="It disappears from this record. The removal is kept in the audit log."
                      confirmLabel="Remove"
                      destructive
                      action={deleteDocumentAction.bind(null, d.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {docs.length} attachment{docs.length === 1 ? "" : "s"} · last added by {docs[0].uploadedBy.name}
          </p>
        </div>
      )}
    </Section>
  );
}
