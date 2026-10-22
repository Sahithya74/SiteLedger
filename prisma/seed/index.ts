import "dotenv/config";
import type { CurrentUser } from "@/server/auth/current-user";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { ensureDefaults } from "@/server/services/defaults";
import { createContext, log } from "./demo/context";
import {
  seedAccounts,
  seedClientMoney,
  seedContractorAndStaffPay,
  seedExpenses,
  seedSupplierPayments,
  seedWagePayments,
} from "./demo/money";
import { seedPurchasesAndUsage, seedSuppliersAndMaterials } from "./demo/materials";
import { seedEngineers, seedLabour, seedManager } from "./demo/people";
import { seedClientsAndProjects, seedSiteItems, seedWork } from "./demo/projects";
import { seedAttendance } from "./demo/site";

/**
 * Seeds the database.
 *  - Always: default material and expense categories and the office cash box
 *    (safe in production, idempotent).
 *  - Only when SEED_DEMO=true and NOT in production: a realistic demo company.
 */
async function main() {
  const started = Date.now();
  console.log("SITECORE seed");
  await db.$transaction((tx) => ensureDefaults(tx));
  log("default categories ready");

  const wantDemo = process.env.SEED_DEMO === "true";
  if (!wantDemo) {
    console.log("Demo data skipped (set SEED_DEMO=true in .env for development).");
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to load demo data in production.");
  }
  if ((await db.user.count()) > 0) {
    console.log("Demo data skipped: the database already has users. Run `npm run db:reset` for a fresh demo.");
    return;
  }

  const username = process.env.SEED_OWNER_USERNAME ?? "owner";
  const password = process.env.SEED_OWNER_PASSWORD ?? "Sunrise@2026";
  const ownerRow = await db.user.create({
    data: { name: "Rajendran K", username, role: "ADMIN", passwordHash: await hashPassword(password), passwordChangedAt: new Date() },
  });
  await db.appSetting.upsert({
    where: { key: "company" },
    create: { key: "company", value: { name: "Sunrise Builders (Demo)" } },
    update: { value: { name: "Sunrise Builders (Demo)" } },
  });
  const owner: CurrentUser = {
    id: ownerRow.id,
    name: ownerRow.name,
    username: ownerRow.username,
    role: "ADMIN",
    permissions: [],
    mustChangePassword: false,
    sessionId: "seed",
  };
  log(`owner login: ${username} / ${password}`);

  const ctx = createContext(owner);
  await seedClientsAndProjects(ctx);
  await seedManager(ctx, [ctx.ids.villa, ctx.ids.complex]);
  await seedEngineers(ctx);
  await seedWork(ctx);
  const workers = await seedLabour(ctx);
  await seedSuppliersAndMaterials(ctx);
  await seedAccounts(ctx);
  await seedAttendance(ctx, workers);
  const purchases = await seedPurchasesAndUsage(ctx);
  await seedSupplierPayments(ctx, purchases);
  await seedClientMoney(ctx);
  await seedContractorAndStaffPay(ctx);
  await seedWagePayments(ctx);
  await seedExpenses(ctx);
  await seedSiteItems(ctx);

  console.log(`Demo company ready in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
