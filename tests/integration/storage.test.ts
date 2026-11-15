import { describe, expect, it, vi } from "vitest";

vi.stubEnv("STORAGE_DRIVER", "database");
const { storage } = await import("@/integrations/storage");
const { db } = await import("@/server/db");

describe("database file storage (cloud hosting)", () => {
  it("saves, reads back exactly and removes a file", async () => {
    const data = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10, 0x20, 0xff, 0xd9]);
    const key = await storage().save(data, "jpg");
    expect(key).toMatch(/^\d{4}\/\d{2}\/[0-9a-f]{32}\.jpg$/);
    expect(Buffer.compare(await storage().read(key), data)).toBe(0);
    await storage().remove(key);
    expect(await db.storedFile.count()).toBe(0);
  });
});
