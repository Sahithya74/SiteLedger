import "server-only";
import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import type { DocumentEntity, DocumentKind } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { storage } from "@/integrations/storage";
import type { CurrentUser } from "@/server/auth/current-user";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { accessibleProjectIds, projectWhere } from "@/server/scope";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** File types people actually send on a construction job. Checked by content, not by name. */
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/x-cfb": "doc",
};

export const DOCUMENT_ENTITIES: DocumentEntity[] = [
  "PROJECT",
  "CLIENT",
  "QUOTATION",
  "INVOICE",
  "CLIENT_PAYMENT",
  "PAYMENT",
  "PURCHASE",
  "EXPENSE",
  "DAILY_REPORT",
  "WORK_ITEM",
  "ISSUE",
  "ENGINEER_TASK",
  "SUPPLIER",
  "EQUIPMENT",
  "CONTRACTOR_BILL",
];

type Actor = Pick<CurrentUser, "id" | "name" | "role" | "permissions">;

export async function saveUpload(
  actor: Actor & { id: string },
  input: { data: Buffer; fileName: string; entityType: DocumentEntity; entityId: string; projectId: string | null; kind: DocumentKind; title: string },
) {
  if (!can(actor, "documents.upload")) throw new ForbiddenError();
  if (input.data.length === 0) throw new AppError("The file is empty.");
  if (input.data.length > MAX_UPLOAD_BYTES) throw new AppError("The file is larger than 15 MB. Please send a smaller photo or PDF.");
  if (input.projectId) {
    const ids = await accessibleProjectIds(actor);
    if (ids !== null && !ids.includes(input.projectId)) throw new NotFoundError("project");
  }
  const detected = await fileTypeFromBuffer(input.data);
  const extension = detected ? ALLOWED[detected.mime] : undefined;
  if (!detected || !extension) {
    throw new AppError("Only photos (JPG, PNG, WEBP, HEIC), PDF and Word / Excel files can be attached.");
  }
  const key = await storage().save(input.data, extension);
  try {
    return await db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          projectId: input.projectId,
          kind: input.kind,
          title: input.title.slice(0, 200) || input.fileName.slice(0, 200),
          fileName: input.fileName.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 200),
          storageKey: key,
          mimeType: detected.mime,
          sizeBytes: input.data.length,
          sha256: createHash("sha256").update(input.data).digest("hex"),
          uploadedById: actor.id,
        },
      });
      await audit(tx, {
        actor,
        action: "CREATE",
        entityType: "Document",
        entityId: doc.id,
        projectId: input.projectId,
        summary: `attached "${doc.title}" (${extension.toUpperCase()}, ${Math.ceil(doc.sizeBytes / 1024)} KB)`,
      });
      return doc;
    });
  } catch (error) {
    await storage().remove(key);
    throw error;
  }
}

/** Documents visible to this user (project documents only for accessible projects). */
function visibleWhere(user: Actor & { id: string }) {
  return { deletedAt: null, OR: [{ projectId: null }, { project: projectWhere(user) }] };
}

export async function documentsFor(user: Actor & { id: string }, entityType: DocumentEntity, entityId: string) {
  return db.document.findMany({
    where: { ...visibleWhere(user), entityType, entityId },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });
}

export async function listDocuments(
  user: Actor & { id: string },
  filter: { projectId?: string; kind?: DocumentKind; entityType?: DocumentEntity; q?: string } = {},
) {
  return db.document.findMany({
    where: {
      ...visibleWhere(user),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.q ? { OR: [{ title: { contains: filter.q, mode: "insensitive" as const } }, { fileName: { contains: filter.q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { uploadedBy: { select: { name: true } }, project: { select: { id: true, name: true } } },
  });
}

/** Loads a file for download after checking the person may see it. */
export async function readDocument(user: Actor & { id: string }, id: string) {
  const doc = await db.document.findFirst({ where: { id, ...visibleWhere(user) } });
  if (!doc) return null;
  return { doc, data: await storage().read(doc.storageKey) };
}

export async function deleteDocument(actor: Actor & { id: string }, id: string): Promise<void> {
  const doc = await db.document.findFirst({ where: { id, ...visibleWhere(actor) } });
  if (!doc) throw new NotFoundError("document");
  if (doc.uploadedById !== actor.id && actor.role !== "ADMIN") throw new ForbiddenError("Only the person who uploaded it or the owner can remove it.");
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { actor, action: "DELETE", entityType: "Document", entityId: id, projectId: doc.projectId, summary: `removed attachment "${doc.title}"` });
  });
}
