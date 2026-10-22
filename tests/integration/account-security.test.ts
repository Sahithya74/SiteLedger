import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture outgoing email instead of sending it.
const sent: { to: string; subject: string; text: string }[] = [];
vi.mock("@/integrations/email", () => ({
  emailConfigured: () => true,
  sendEmail: async (m: { to: string; subject: string; text: string }) => {
    sent.push(m);
    return "sent";
  },
}));

const { attemptLogin } = await import("@/server/auth/login");
const { requestPasswordReset, resetPasswordWithCode } = await import("@/server/auth/password-reset");
const { totpCode, timeStep } = await import("@/server/auth/totp");
const { confirmOwnEmail, setOwnEmail, beginTotpSetup, enableTotp } = await import("@/server/services/users");
const { db } = await import("@/server/db");
const { makeUser } = await import("./helpers");

const meta = { ipAddress: "10.0.0.9", userAgent: "vitest" };
const codeIn = (text: string) => text.match(/Your code is: (\d{6})/)?.[1] ?? "";

beforeEach(() => {
  sent.length = 0;
});

describe("login lock", () => {
  it("locks after 3 wrong passwords for 15 minutes, with a warning before", async () => {
    await makeUser("ADMIN", { username: "ramesh", password: "Correct-Horse-9" });
    const first = await attemptLogin("ramesh", "wrong-1", meta);
    const second = await attemptLogin("ramesh", "wrong-2", meta);
    expect(first.ok || first.error).toMatch(/2 tries left/);
    expect(second.ok || second.error).toMatch(/1 try left/);
    const third = await attemptLogin("ramesh", "wrong-3", meta);
    expect(third.ok || third.error).toMatch(/wait 15 minutes/);
    const right = await attemptLogin("ramesh", "Correct-Horse-9", meta);
    expect(right.ok).toBe(false);
  });
});

describe("email confirmation and forgot password", () => {
  it("only sends reset codes to a confirmed email, and the code resets the password once", async () => {
    const user = await makeUser("MANAGER", { username: "suresh", password: "Correct-Horse-9" });

    // Not confirmed yet: nothing is sent, and the reply gives nothing away.
    await setOwnEmail(user, "Suresh@Example.com", meta.ipAddress);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("suresh@example.com");
    await requestPasswordReset("suresh", meta);
    expect(sent).toHaveLength(1);

    await expect(confirmOwnEmail(user, "000000")).rejects.toThrow(/not right/);
    await confirmOwnEmail(user, codeIn(sent[0].text));
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull();

    // Lock the login with wrong passwords; the email reset lifts the lock.
    for (let i = 0; i < 3; i++) await attemptLogin("suresh", "wrong-password", meta);

    await requestPasswordReset("suresh@example.com", meta);
    expect(sent).toHaveLength(2);
    const code = codeIn(sent[1].text);
    await expect(resetPasswordWithCode("suresh", "123456", "New-Password-77", meta)).rejects.toThrow(/not right/);
    await resetPasswordWithCode("suresh", code, "New-Password-77", meta);
    expect(sent.at(-1)?.subject).toMatch(/password was changed/);

    // The code works only once.
    await expect(resetPasswordWithCode("suresh", code, "Another-Pass-88", meta)).rejects.toThrow(/expired|used/);

    expect((await attemptLogin("suresh", "Correct-Horse-9", meta)).ok).toBe(false);
    expect((await attemptLogin("suresh", "New-Password-77", meta)).ok).toBe(true);
  });

  it("stops after 5 wrong codes and limits how many codes are sent", async () => {
    const user = await makeUser("MANAGER", { username: "kumar", password: "Correct-Horse-9" });
    await setOwnEmail(user, "kumar@example.com", meta.ipAddress);
    await confirmOwnEmail(user, codeIn(sent[0].text));
    await requestPasswordReset("kumar", meta);
    const code = codeIn(sent.at(-1)!.text);
    for (let i = 0; i < 5; i++) await resetPasswordWithCode("kumar", "111111", "New-Password-77", meta).catch(() => undefined);
    await expect(resetPasswordWithCode("kumar", code, "New-Password-77", meta)).rejects.toThrow(/Too many wrong codes/);
    await requestPasswordReset("kumar", meta);
    await requestPasswordReset("kumar", meta);
    await expect(requestPasswordReset("kumar", meta)).rejects.toThrow(/Too many codes/);
  });

  it("does not let one person take another person's email", async () => {
    const a = await makeUser("MANAGER", { username: "anil" });
    const b = await makeUser("MANAGER", { username: "bala" });
    await setOwnEmail(a, "same@example.com", meta.ipAddress);
    await expect(setOwnEmail(b, "SAME@example.com", meta.ipAddress)).rejects.toThrow(/already used/);
  });
});

describe("2-step login", () => {
  it("asks for the code after the password, rejects wrong and reused codes", async () => {
    const owner = await makeUser("ADMIN", { username: "owner", password: "Correct-Horse-9" });
    const { secret } = await beginTotpSetup(owner);
    await enableTotp(owner, totpCode(secret, timeStep()));

    const noCode = await attemptLogin("owner", "Correct-Horse-9", meta);
    expect(noCode).toMatchObject({ ok: false, needsCode: true });
    const wrong = await attemptLogin("owner", "Correct-Horse-9", meta, "000000");
    expect(wrong.ok).toBe(false);
    // A code from the next time window, so it hasn't been used by enableTotp.
    const next = totpCode(secret, timeStep() + 1);
    expect((await attemptLogin("owner", "Correct-Horse-9", { ...meta, ipAddress: "10.0.0.10" }, next)).ok).toBe(true);
    const reused = await attemptLogin("owner", "Correct-Horse-9", { ...meta, ipAddress: "10.0.0.11" }, next);
    expect(reused.ok).toBe(false);
  });
});
