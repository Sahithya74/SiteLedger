#!/usr/bin/env node
/**
 * Portable PostgreSQL for SITECORE — no installer, no admin rights.
 *
 *   node scripts/pg.mjs setup    first time: create the database folder, users and databases, write .env
 *   node scripts/pg.mjs start    start the database (runs in the background)
 *   node scripts/pg.mjs stop     stop it
 *   node scripts/pg.mjs status   is it running?
 *
 * The data lives in ./.pgdata (never commit it). Back it up with
 * Settings → Backup inside the app.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".pgdata");
const secretFile = path.join(root, ".pgdata.secret.json");
const envFile = path.join(root, ".env");
const port = Number(process.env.PG_PORT ?? 5433);
const require = createRequire(import.meta.url);

function binDir() {
  const platformPkg = `@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
  // The package only exports its JS entry, so locate the folder on disk.
  const dir = path.join(root, "node_modules", ...platformPkg.split("/"), "native", "bin");
  if (!fs.existsSync(dir)) {
    console.error(`Portable PostgreSQL for ${process.platform}-${process.arch} is not installed. Run "npm install" first.`);
    process.exit(1);
  }
  return dir;
}

const exe = (name) => path.join(binDir(), process.platform === "win32" ? `${name}.exe` : name);

function run(name, args, options = {}) {
  const result = spawnSync(exe(name), args, { stdio: "inherit", windowsHide: true, ...options });
  return result.status ?? 1;
}

function isRunning() {
  if (!fs.existsSync(dataDir)) return false;
  return run("pg_ctl", ["-D", dataDir, "status"], { stdio: "ignore" }) === 0;
}

function start() {
  if (!fs.existsSync(dataDir)) {
    console.error('No database yet. Run "npm run db:setup" first.');
    process.exit(1);
  }
  if (isRunning()) {
    console.log(`Database already running on port ${port}.`);
    return;
  }
  // stdio "ignore" lets pg_ctl return while PostgreSQL keeps running in the background.
  const status = run(
    "pg_ctl",
    ["-D", dataDir, "-o", `-p ${port} -c listen_addresses=localhost`, "-l", path.join(dataDir, "server.log"), "-w", "-t", "60", "start"],
    { stdio: "ignore", detached: process.platform !== "win32" },
  );
  if (status !== 0) {
    console.error(`Database did not start. See ${path.join(dataDir, "server.log")}`);
    process.exit(1);
  }
  console.log(`Database running on localhost:${port}.`);
}

function stop() {
  if (!isRunning()) {
    console.log("Database is not running.");
    return;
  }
  run("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"], { stdio: "ignore" });
  console.log("Database stopped.");
}

function setEnvLine(text, key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

async function setup() {
  const pg = require("pg");
  let secret;
  if (!fs.existsSync(dataDir)) {
    secret = {
      superPassword: randomBytes(18).toString("base64url"),
      appPassword: randomBytes(18).toString("base64url"),
    };
    const pwFile = path.join(root, ".pg-init-pw.tmp");
    fs.writeFileSync(pwFile, secret.superPassword, { mode: 0o600 });
    const status = run("initdb", ["-D", dataDir, "-U", "postgres", `--pwfile=${pwFile}`, "-E", "UTF8", "--locale=C", "--auth=scram-sha-256"], {
      stdio: "ignore",
    });
    fs.rmSync(pwFile, { force: true });
    if (status !== 0) {
      console.error("Could not create the database folder.");
      process.exit(1);
    }
    fs.writeFileSync(secretFile, JSON.stringify(secret, null, 2), { mode: 0o600 });
    console.log("Created the database folder (.pgdata).");
  } else {
    secret = JSON.parse(fs.readFileSync(secretFile, "utf8"));
  }
  start();

  const admin = new pg.Client({ host: "localhost", port, user: "postgres", password: secret.superPassword, database: "postgres" });
  await admin.connect();
  const role = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'sitecore'");
  if (role.rowCount === 0) {
    await admin.query(`CREATE ROLE sitecore WITH LOGIN PASSWORD '${secret.appPassword}' CREATEDB`);
  }
  for (const db of ["sitecore", "sitecore_test"]) {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${db} OWNER sitecore`);
  }
  await admin.end();

  let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : fs.readFileSync(path.join(root, ".env.example"), "utf8");
  env = env.replace(/^# TEMPORARY:.*\n(# After installing.*\n)?/m, "");
  env = setEnvLine(env, "DATABASE_URL", `postgresql://sitecore:${secret.appPassword}@localhost:${port}/sitecore`);
  env = setEnvLine(env, "TEST_DATABASE_URL", `postgresql://sitecore:${secret.appPassword}@localhost:${port}/sitecore_test`);
  fs.writeFileSync(envFile, env);
  console.log("Users and databases ready; .env updated. Next: npm run db:deploy && npm run db:seed");
}

const command = process.argv[2];
if (command === "setup") await setup();
else if (command === "start") start();
else if (command === "stop") stop();
else if (command === "status") console.log(isRunning() ? `Database running on localhost:${port}.` : "Database is not running.");
else {
  console.log("Usage: node scripts/pg.mjs setup|start|stop|status");
  process.exit(1);
}
