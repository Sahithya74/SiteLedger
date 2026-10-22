import { describe, expect, it } from "vitest";
import { attemptLogin, MAX_FAILURES_PER_USERNAME } from "@/server/auth/login";
import { hashToken, validateSessionToken } from "@/server/auth/session";
import { db } from "@/server/db";
import { makeUser } from "./helpers";

const meta = { ipAddress: "10.0.0.1", userAgent: "vitest" };

describe("login", () => {
  it("accepts the right password, case-insensitive login name, and creates a session", async () => {
    await makeUser("ADMIN", { username: "ramesh", password: "Correct-Horse-9" });
    const result = await attemptLogin("  Ramesh ", "Correct-Horse-9", meta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const session = await validateSessionToken(result.token);
    expect(session?.user.username).toBe("ramesh");
    // Only the hash of the token is stored.
    expect(await db.session.count({ where: { id: result.token } })).toBe(0);
    expect(await db.session.count({ where: { id: hashToken(result.token) } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "LOGIN" } })).toBe(1);
  });

  it("gives the same message for a wrong password and an unknown user", async () => {
    await makeUser("ADMIN", { username: "ramesh" });
    const wrongPassword = await attemptLogin("ramesh", "nope-nope-nope", meta);
    const unknownUser = await attemptLogin("nobody", "nope-nope-nope", { ...meta, ipAddress: "10.0.0.2" });
    expect(wrongPassword).toEqual({ ok: false, error: "Wrong login name or password." });
    expect(unknownUser).toEqual({ ok: false, error: "Wrong login name or password." });
  });

  it(`locks the login name after ${MAX_FAILURES_PER_USERNAME} wrong passwords`, async () => {
    await makeUser("ADMIN", { username: "ramesh", password: "Correct-Horse-9" });
    for (let i = 0; i < MAX_FAILURES_PER_USERNAME; i++) {
      await attemptLogin("ramesh", "wrong-password", meta);
    }
    const locked = await attemptLogin("ramesh", "Correct-Horse-9", meta);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error).toMatch(/Too many wrong attempts/);
  });

  it("refuses a deactivated account", async () => {
    const user = await makeUser("MANAGER", { username: "suresh", password: "Correct-Horse-9" });
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    const result = await attemptLogin("suresh", "Correct-Horse-9", meta);
    expect(result.ok).toBe(false);
  });
});

describe("sessions", () => {
  it("rejects expired sessions and removes them", async () => {
    await makeUser("ADMIN", { username: "ramesh", password: "Correct-Horse-9" });
    const result = await attemptLogin("ramesh", "Correct-Horse-9", meta);
    if (!result.ok) throw new Error("login failed");
    await db.session.update({ where: { id: hashToken(result.token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSessionToken(result.token)).toBeNull();
    expect(await db.session.count()).toBe(0);
  });

  it("ends sessions of a user who is deactivated", async () => {
    const user = await makeUser("MANAGER", { username: "suresh", password: "Correct-Horse-9" });
    const result = await attemptLogin("suresh", "Correct-Horse-9", meta);
    if (!result.ok) throw new Error("login failed");
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await validateSessionToken(result.token)).toBeNull();
  });
});
