import { NextResponse } from "next/server";
import { z } from "zod";
import { DocumentEntity, DocumentKind } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { MAX_UPLOAD_BYTES, saveUpload } from "@/server/services/documents";

const fieldsSchema = z.object({
  entityType: z.enum(DocumentEntity),
  entityId: z.string().min(1).max(50),
  projectId: z.preprocess((v) => (v ? v : null), z.string().max(50).nullable()),
  kind: z.enum(DocumentKind).default("OTHER"),
  title: z.string().max(200).default(""),
});

/** Upload one file (multipart form). Requires a session and "upload documents". */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  // Server actions check the Origin header; this route checks it too.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: "Upload refused." }, { status: 403 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 512 * 1024) return NextResponse.json({ error: "The file is larger than 15 MB." }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to attach." }, { status: 400 });
    const fields = fieldsSchema.parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
    const doc = await saveUpload(user, {
      data: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      ...fields,
      title: fields.title || file.name,
    });
    return NextResponse.json({ id: doc.id });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Upload details were not valid." }, { status: 400 });
    console.error("[upload]", error);
    return NextResponse.json({ error: "Could not save the file. Please try again." }, { status: 500 });
  }
}
