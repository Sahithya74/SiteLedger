import { can } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { backupChunks, backupFileName } from "@/server/backup";
import { getCurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db";

/** Owner-only download of all data. The file holds everything, so keep it safe. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Please log in.", { status: 401 });
  if (!can(user, "data.backup")) return new Response("Only the owner can download backups.", { status: 403 });
  await audit(db, { actor: user, action: "EXPORT", entityType: "Backup", summary: "downloaded a full backup" });
  const encoder = new TextEncoder();
  const chunks = backupChunks();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${backupFileName()}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
