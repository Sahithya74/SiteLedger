/**
 * Gives one login a new strong random password and prints it once.
 * Use it to replace the public demo passwords before sharing a link:
 *   npm run user:set-password -- owner
 * Everyone signed in as that user is signed out.
 */
import "dotenv/config";
import { randomInt } from "node:crypto";
import { audit } from "@/server/audit";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { invalidateUserSessions } from "@/server/auth/session";
import { db } from "@/server/db";

// No look-alike characters (0/O, 1/l/I), so it can be typed from a phone screen.
const LETTERS = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const pick = (set: string) => set[randomInt(set.length)];

/** e.g. "Kx7m-p4Rt-9hQe-W3nz": 16 random characters, about 90 bits. */
function strongPassword(): string {
  const all = LETTERS + UPPER + DIGITS;
  for (;;) {
    const groups = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => pick(all)).join(""));
    const p = groups.join("-");
    if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)) return p;
  }
}

const username = (process.argv[2] ?? "").trim().toLowerCase();
if (!username) {
  console.error("Usage: npm run user:set-password -- <login name>");
  process.exit(1);
}
const user = await db.user.findUnique({ where: { username } });
if (!user) {
  console.error(`No user with login name "${username}".`);
  process.exit(1);
}
const password = strongPassword();
const problem = passwordProblem(password, username);
if (problem) throw new Error(problem);
await db.$transaction(async (tx) => {
  await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: false, passwordChangedAt: new Date() } });
  await audit(tx, { actor: null, action: "PASSWORD_CHANGE", entityType: "User", entityId: user.id, summary: `password for "${username}" was set from the server command line` });
});
await invalidateUserSessions(user.id);
await db.$disconnect();
console.log(`${username}: ${password}`);
