/**
 * Turns off 2-step login for one user — for when the phone with the
 * authenticator app is lost. Run on the computer where SITECORE is installed:
 *   npm run user:disable-2fa -- owner
 */
import "dotenv/config";
import { db } from "@/server/db";
import { audit } from "@/server/audit";

const username = (process.argv[2] ?? "").trim().toLowerCase();
if (!username) {
  console.error("Usage: npm run user:disable-2fa -- <login name>");
  process.exit(1);
}
const user = await db.user.findUnique({ where: { username } });
if (!user) {
  console.error(`No user with login name "${username}".`);
  process.exit(1);
}
await db.$transaction(async (tx) => {
  await tx.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  await audit(tx, { actor: null, action: "UPDATE", entityType: "User", entityId: user.id, summary: `2-step login for "${username}" was turned off from the server command line` });
});
console.log(`2-step login is now off for "${username}". They can log in with the password and turn it on again in Settings.`);
await db.$disconnect();
