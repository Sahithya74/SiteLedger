import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { base32Decode, base32Encode, otpauthUrl, totpCode, verifyTotp } = await import("@/server/auth/totp");

// RFC 6238 test secret "12345678901234567890" (ASCII), base32 encoded.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("round-trips base32", () => {
    expect(base32Decode(base32Encode(Buffer.from("hello world"))).toString()).toBe("hello world");
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("matches the RFC 6238 SHA-1 test vectors (last 6 digits)", () => {
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totpCode(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpCode(RFC_SECRET, Math.floor(1234567890 / 30))).toBe("005924");
    expect(totpCode(RFC_SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("accepts the current and neighbouring codes only", () => {
    const at = 1_700_000_000_000;
    const step = Math.floor(at / 30000);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), at)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), at)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), at)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", at)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", at)).toBeNull();
  });

  it("builds an authenticator link", () => {
    expect(otpauthUrl("ABC", "owner", "SITECORE")).toBe("otpauth://totp/SITECORE%3Aowner?secret=ABC&issuer=SITECORE&algorithm=SHA1&digits=6&period=30");
  });
});
