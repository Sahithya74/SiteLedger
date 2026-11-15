/**
 * Runs SITECORE on this PC and shares it through a temporary Cloudflare
 * "quick tunnel" (an https://….trycloudflare.com address, no account needed).
 *
 *   npm run public          (after "npm run build")
 *
 * The address changes every time this starts, and the app is only reachable
 * while this window stays open and the PC is on. Press Ctrl+C to stop.
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const root = path.resolve(import.meta.dirname, "..");
const port = process.env.PORT ?? "3000";
const tools = path.join(root, "tools");
const exe = path.join(tools, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
const DOWNLOAD = {
  win32: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
  linux: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
}[process.platform];

async function ensureCloudflared() {
  if (existsSync(exe)) return;
  if (!DOWNLOAD) throw new Error("Install cloudflared yourself and put it in the tools folder.");
  mkdirSync(tools, { recursive: true });
  console.log("Downloading cloudflared (once)…");
  const res = await fetch(DOWNLOAD);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
  const tmp = `${exe}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  renameSync(tmp, exe);
}

if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
  console.error('No production build yet. Run "npm run build" first.');
  process.exit(1);
}

// 1. Database
spawnSync(process.execPath, [path.join(root, "scripts", "pg.mjs"), "start"], { cwd: root, stdio: "inherit" });

// 2. App (production mode)
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const app = spawn(process.execPath, [nextBin, "start", "-p", port], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", SERVER_ACTION_ORIGINS: process.env.SERVER_ACTION_ORIGINS ?? "*.trycloudflare.com" },
});

// 3. Tunnel
await ensureCloudflared();
const tunnel = spawn(exe, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], { cwd: root });
let shown = false;
const watch = (chunk) => {
  const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !shown) {
    shown = true;
    console.log(`\n  SITECORE is online at:  ${match[0]}\n  (also on this PC at http://localhost:${port}). Keep this window open. Ctrl+C stops it.\n`);
  }
};
tunnel.stdout.on("data", watch);
tunnel.stderr.on("data", watch);

const stop = () => {
  tunnel.kill();
  app.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
app.on("exit", (code) => {
  console.error(`The app stopped (code ${code}).`);
  tunnel.kill();
  process.exit(code ?? 1);
});
tunnel.on("exit", (code) => {
  console.error(`The tunnel stopped (code ${code}). The app is still on http://localhost:${port}.`);
});
