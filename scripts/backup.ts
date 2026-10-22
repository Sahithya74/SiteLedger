/**
 * Writes a full backup to the backups/ folder (same file as "Download backup"
 * in Settings). Schedule it daily with Windows Task Scheduler:
 *   npm run backup
 */
import "dotenv/config";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { backupChunks, backupFileName } from "@/server/backup";
import { db } from "@/server/db";

const dir = path.resolve(process.argv[2] ?? "backups");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, backupFileName());
const out = createWriteStream(file);
for await (const chunk of backupChunks()) {
  if (!out.write(chunk)) await new Promise<void>((resolve) => out.once("drain", () => resolve()));
}
await new Promise<void>((resolve) => out.end(() => resolve()));
await db.$disconnect();
console.log(`Backup written to ${file}`);
