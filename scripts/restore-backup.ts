/**
 * Restores a SITECORE backup into an EMPTY database (tables created by the
 * migrations, no users yet). It refuses to touch a database that has data.
 *
 *   npm run db:restore -- path\to\sitecore-backup-YYYYMMDDHHMM.sitecore
 *
 * Rows go straight from the file into PostgreSQL (json_populate_recordset),
 * so amounts are restored exactly.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { BACKUP_MAGIC } from "@/server/backup";
import { db } from "@/server/db";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run db:restore -- <backup file>");
  process.exit(1);
}
const text = readFileSync(file, "utf8");
if (!text.startsWith(`${BACKUP_MAGIC}\n`)) {
  console.error("This is not a SITECORE backup file.");
  process.exit(1);
}
const headerEnd = text.indexOf("\n", BACKUP_MAGIC.length + 1);
const header = JSON.parse(text.slice(BACKUP_MAGIC.length + 1, headerEnd)) as { createdAt: string; migrations: string[]; tables: string[] };

// Split into tables. Rows never contain a raw newline followed by "@table " (JSON escapes newlines).
const sections = new Map<string, string>();
for (const part of text.slice(headerEnd + 1).split(/\n?^@table /m).filter(Boolean)) {
  const nl = part.indexOf("\n");
  sections.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim());
}

const applied = (await db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`).map((m) => m.migration_name);
const missing = header.migrations.filter((m) => !applied.includes(m));
if (missing.length) {
  console.error(`The database is missing these migrations: ${missing.join(", ")}. Run "npm run db:deploy" first.`);
  process.exit(1);
}
if ((await db.user.count()) > 0) {
  console.error("This database already has data. Restore only into an empty database (see README → Backup and restore).");
  process.exit(1);
}

// Parents before children, using the foreign keys in the database.
const links = await db.$queryRaw<{ child: string; parent: string }[]>`
  SELECT trim(both '"' from conrelid::regclass::text) AS child, trim(both '"' from confrelid::regclass::text) AS parent
  FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`;
const ordered: string[] = [];
const visit = (t: string, seen = new Set<string>()) => {
  if (ordered.includes(t) || seen.has(t)) return;
  seen.add(t);
  for (const l of links) if (l.child === t && l.parent !== t && sections.has(l.parent)) visit(l.parent, seen);
  ordered.push(t);
};
for (const t of sections.keys()) visit(t);

console.log(`Restoring backup made ${header.createdAt} (${sections.size} tables)…`);
await db.$transaction(
  async (tx) => {
    let pending = ordered;
    // Tables that point at other tables must come after them; retry until all fit.
    for (let pass = 1; pending.length && pass <= sections.size + 1; pass++) {
      const failed: string[] = [];
      for (const table of pending) {
        const name = `"${table.replace(/"/g, '""')}"`;
        await tx.$executeRawUnsafe("SAVEPOINT restore_table");
        try {
          const count = await tx.$executeRawUnsafe(`INSERT INTO ${name} SELECT * FROM json_populate_recordset(NULL::${name}, $1::json)`, sections.get(table)!);
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT restore_table");
          console.log(`  ${table}: ${count} rows`);
        } catch {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT restore_table");
          failed.push(table);
        }
      }
      if (failed.length === pending.length) throw new Error(`Could not restore: ${failed.join(", ")}`);
      pending = failed;
    }
  },
  { timeout: 15 * 60 * 1000, maxWait: 60 * 1000 },
);
await db.$disconnect();
console.log("Restore finished. Everyone logs in with the passwords they had when the backup was made.");
