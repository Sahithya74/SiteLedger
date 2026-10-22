import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { VerificationPurpose } from "@/generated/prisma/enums";
import { sendEmail } from "@/integrations/email";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";

/**
 * One-time 6-digit codes sent by email, for confirming an email address and
 * for "forgot password". Codes expire after 10 minutes, allow 5 tries, and
 * at most 3 can be sent per person per hour. Only a hash is stored.
 */

export const CODE_MINUTES = 10;
const MAX_TRIES = 5;
const MAX_SENDS_PER_HOUR = 3;
const MAX_SENDS_PER_IP_PER_HOUR = 10;

function hashCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "s*****4@gmail.com" — enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "your email";
  const shown = name.length <= 2 ? name[0] : `${name[0]}${"*".repeat(Math.min(5, name.length - 2))}${name.at(-1)}`;
  return `${shown}@${domain}`;
}

const SUBJECT: Record<VerificationPurpose, string> = {
  EMAIL_VERIFY: "Confirm your email for SITECORE",
  PASSWORD_RESET: "Your SITECORE password reset code",
};

export async function issueCode(user: { id: string; name: string }, purpose: VerificationPurpose, email: string, ipAddress: string | null): Promise<void> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [recentForUser, recentForIp] = await Promise.all([
    db.verificationCode.count({ where: { userId: user.id, purpose, createdAt: { gte: hourAgo } } }),
    ipAddress ? db.verificationCode.count({ where: { ipAddress, createdAt: { gte: hourAgo } } }) : Promise.resolve(0),
  ]);
  if (recentForUser >= MAX_SENDS_PER_HOUR || recentForIp >= MAX_SENDS_PER_IP_PER_HOUR) {
    throw new AppError("Too many codes were sent. Please wait an hour and try again, or ask the owner.");
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Only the newest code works.
  await db.verificationCode.updateMany({ where: { userId: user.id, purpose, usedAt: null }, data: { expiresAt: new Date() } });
  await db.verificationCode.create({
    data: { userId: user.id, purpose, email, codeHash: hashCode(user.id, code), expiresAt: new Date(Date.now() + CODE_MINUTES * 60 * 1000), ipAddress },
  });
  const why =
    purpose === "PASSWORD_RESET"
      ? "Someone (hopefully you) asked to reset your SITECORE password."
      : "You added this email address to your SITECORE account.";
  try {
    await sendEmail({
      to: email,
      subject: SUBJECT[purpose],
      text: `Hello ${user.name},\n\n${why}\n\nYour code is: ${code}\n\nIt works once and expires in ${CODE_MINUTES} minutes. Do not share it with anyone.\n\nIf you did not ask for this, ignore this email and tell the owner.\n\n— SITECORE`,
    });
  } catch {
    throw new AppError("The email could not be sent. Check the email settings, or ask the owner to reset your password.");
  }
}

/** True if the code is right (and marks it used). Wrong tries are counted. */
export async function consumeCode(userId: string, purpose: VerificationPurpose, code: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const given = code.replace(/\s/g, "");
  const row = await db.verificationCode.findFirst({
    where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, error: "This code has expired. Ask for a new one." };
  if (row.attempts >= MAX_TRIES) return { ok: false, error: "Too many wrong codes. Ask for a new one." };
  const right = /^\d{6}$/.test(given) && timingSafeEqual(Buffer.from(hashCode(userId, given)), Buffer.from(row.codeHash));
  if (!right) {
    await db.verificationCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    const left = MAX_TRIES - row.attempts - 1;
    return { ok: false, error: left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Ask for a new one." };
  }
  // Mark used only if still unused (two tabs submitting the same code).
  const used = await db.verificationCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count === 0) return { ok: false, error: "This code was already used. Ask for a new one." };
  return { ok: true, email: row.email };
}
