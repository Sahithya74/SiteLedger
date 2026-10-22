import "server-only";
import { db } from "@/server/db";

/**
 * Full data backup as a text file:
 *
 *   SITECORE-BACKUP 1
 *   {"createdAt": "...", "migrations": [...], "tables": [...]}
 *   @table <Name>
 *   [ ...rows as JSON, exactly as PostgreSQL wrote them... ]
 *   …
 *
 * Rows are written by PostgreSQL itself (json_agg) and read back by
 * PostgreSQL (json_populate_recordset), so large money values never pass
 * through JavaScript numbers. Login sessions and login attempts are left out.
 */

export const BACKUP_MAGIC = "SITECORE-BACKUP 1";
const SKIP = new Set(["_prisma_migrations", "Session", "LoginAttempt"]);

/** Every app table in the public schema, by name. */
async function tableNames(): Promise<string[]> {
  const rows = await db.$queryRaw<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
  return rows.map((r) => r.name).filter((n) => !SKIP.has(n));
}

export async function* backupChunks(): AsyncGenerator<string> {
  const [tables, migrations] = await Promise.all([
    tableNames(),
    db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`,
  ]);
  yield `${BACKUP_MAGIC}\n`;
  yield `${JSON.stringify({ createdAt: new Date().toISOString(), migrations: migrations.map((m) => m.migration_name), tables })}\n`;
  for (const table of tables) {
    // Table names come from the database catalogue above, never from a request.
    const [row] = await db.$queryRawUnsafe<{ data: string }[]>(`SELECT coalesce(json_agg(t), '[]'::json)::text AS data FROM "${table.replace(/"/g, '""')}" t`);
    yield `@table ${table}\n${row.data}\n`;
  }
}

export function backupFileName(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `sitecore-backup-${stamp}.sitecore`;
}
