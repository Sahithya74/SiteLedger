import { execSync } from "node:child_process";
import "dotenv/config";

/**
 * Runs once before the integration tests: applies every migration (including
 * the integrity-guard triggers) to the separate TEST database.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. Add it to .env (see .env.example).");
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must point to a different database than DATABASE_URL — tests wipe it.");
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
