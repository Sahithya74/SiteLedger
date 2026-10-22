import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed/index.ts",
  },
  datasource: {
    // Not using env() so commands that don't need a database (generate,
    // validate, format) still work before .env exists.
    url: process.env.DATABASE_URL ?? "",
  },
});
