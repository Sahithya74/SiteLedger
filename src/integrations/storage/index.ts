import "server-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Where uploaded files are kept. Local disk today (outside /public, so files
 * are only reachable through the permission-checked download route); an
 * S3-compatible provider can implement the same interface later.
 */
export interface StorageProvider {
  save(data: Buffer, extension: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalDiskStorage implements StorageProvider {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async save(data: Buffer, extension: string): Promise<string> {
    const now = new Date();
    const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const key = `${folder}/${randomBytes(16).toString("hex")}.${extension.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin"}`;
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data, { flag: "wx" });
    return key;
  }

  read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}

let provider: StorageProvider | null = null;

export function storage(): StorageProvider {
  provider ??= new LocalDiskStorage(path.resolve(process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage", "uploads")));
  return provider;
}
