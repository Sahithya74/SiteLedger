import "dotenv/config";
import { afterAll, beforeEach } from "vitest";

// Point every database call in the code under test at the test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { db } = await import("@/server/db");

/** Empty every table (TRUNCATE skips the row-delete guards, which is what we want here). */
export async function resetDatabase() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});
