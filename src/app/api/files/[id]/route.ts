import { getCurrentUser } from "@/server/auth/current-user";
import { readDocument } from "@/server/services/documents";

const INLINE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

/** Download / view an attachment. Only for logged-in people who can see it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Please log in.", { status: 401 });
  const { id } = await params;
  const found = await readDocument(user, id).catch(() => null);
  if (!found) return new Response("Not found.", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = !download && INLINE.has(found.doc.mimeType) ? "inline" : "attachment";
  return new Response(new Uint8Array(found.data), {
    headers: {
      "Content-Type": found.doc.mimeType,
      "Content-Length": String(found.data.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(found.doc.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
