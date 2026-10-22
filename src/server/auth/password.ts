import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters (19 MiB memory, 2 iterations).
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export const PASSWORD_MIN_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Returns a plain-English problem with the password, or null if it is acceptable. */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 200) return "That password is too long.";
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return "The password should not contain the login name.";
  }
  if (/^(.)\1+$/.test(password) || /^(?:12345678|password|qwertyui)/i.test(password)) {
    return "That password is too easy to guess.";
  }
  return null;
}

/** A fixed hash used to keep login timing the same when the user does not exist. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("sitecore-timing-equaliser");
  return dummyHash;
}
