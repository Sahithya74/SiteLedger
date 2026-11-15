# SITECORE

**One simple control room for a construction business.** Projects, sites, work, materials, labour, engineers, clients, bills, payments, bank and cash, equipment, daily reports and alerts — in one private app. Only two kinds of people can log in: the **Owner** and a **Manager**.

All five stages in [docs/SPEC.md](docs/SPEC.md) are built.

---

## What's inside

| Area | What you can do |
|---|---|
| **Dashboard** | Live totals and *Things that need your attention* (overdue payments, low stock, pending wages, late work, cheques due…) |
| **Projects** | Sites, work breakdown with progress and dependencies, map, and tabs for Money, Materials, Labour and Site diary |
| **Clients** | Quotations (with revisions), running (RA) bills with GST and retention, payments received with receipts, pending amounts, cheques |
| **Materials** | Stock per site and main store, purchases, suppliers and price history, material requests, transfers |
| **Labour** | Workers, attendance grid, weekly wage sheet paid in one go, advances, labour contractors with work orders and bills |
| **Engineers** | Assignments, tasks, pay, and reminders passed on by WhatsApp |
| **Accounts** | Money in, expenses, payments made, what we owe, bank and cash accounts with running balance and reconciliation, site cash, month lock |
| **Site** | Daily reports (filled in from the day's records), equipment, documents and photos, notifications |
| **Reports** | 12 reports with filters, print / save as PDF, and CSV download for Excel |
| **Security** | Server-side permissions, 3-try login lock, optional 2-step login, email-confirmed "forgot password", audit log of every change, append-only money records |
| **Data** | One-click backup, restore into an empty database, import workers / materials / suppliers from Excel |

---

## Set up on Windows (first time)

You need **Node.js 22+** (24 recommended) and **Git**. PostgreSQL comes **bundled** — nothing else to install.

```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\SiteLedger"
npm install
npm run db:setup     # creates the bundled database in .pgdata and writes .env
npm run db:start     # starts it on localhost:5433
npm run db:deploy    # creates all tables, guards and indexes
npm run db:seed      # default categories + demo company (when SEED_DEMO=true in .env)
npm run dev
```

Open <http://localhost:3000>. The demo accounts (only when `SEED_DEMO=true`):

| Who | Login name | Password |
|---|---|---|
| Owner | `owner` | `Sunrise@2026` |
| Manager (Site Manager permissions) | `manager` | `Site@2026` |

> **These demo passwords are public** (they are in this file). Never use them on a computer reachable from the internet — see *Going live* below.

Start the database again after a restart with `npm run db:start` (`npm run db:status` / `npm run db:stop`).

Prefer your own PostgreSQL 17+? Create a `sitecore` role and the `sitecore` and `sitecore_test` databases, then put their URLs in `.env` (see [.env.example](.env.example)).

---

## Going live

1. In `.env` set `SEED_DEMO=false` (or change both demo passwords straight away in **Settings → My account**).
2. `npm run build`, then `npm start` (serve over HTTPS — a tunnel such as Cloudflare Tunnel does this for you).
3. If there are no users, the first visit shows **Set up SITECORE**, where the owner account is created. That page then closes for good.
4. The owner adds managers under **Settings → Users & permissions**.
5. Turn on **2-step login** for the owner (Settings → My account).

Behind a proxy or tunnel, also set `SERVER_ACTION_ORIGINS` (for a Cloudflare quick tunnel: `*.trycloudflare.com`).

Read [docs/SECURITY.md](docs/SECURITY.md) before going live.

---

## Free cloud hosting (Vercel + Neon)

A permanent public link that works without this PC.

1. **Database — Neon** (<https://neon.tech>, free): sign up, create a project (region: Singapore or Mumbai), and copy the **direct** connection string (it looks like `postgresql://…@ep-…neon.tech/neondb?sslmode=require`; turn "Connection pooling" off before copying).
2. **App — Vercel** (<https://vercel.com>, free "Hobby"): sign up with GitHub → **Add New → Project** → import `Sahithya74/SiteLedger`.
3. Before clicking **Deploy**, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string |
   | `SETUP_CODE` | any secret phrase only you know |
   | `SEED_DEMO` | `false` |
   | `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465` | optional, for "forgot password" emails |

4. **Deploy.** The build creates all tables in Neon (`vercel-build` runs `prisma migrate deploy`).
5. Open the `https://….vercel.app` link → **Set up SITECORE** → enter the setup code and create the owner account. Then add managers in Settings, and turn on 2-step login.

Every push to `main` on GitHub redeploys automatically. Uploaded photos and bills are stored in the database on Vercel. Backups work the same way (Settings → Download backup).

---

## Email ("Forgot password")

Each person adds their email in **Settings → My account** and confirms it with a 6-digit code. If they later forget their password, **Forgot your password?** on the login page emails a code that lets them set a new one.

Sending needs an email account. With Gmail:

1. Turn on 2-Step Verification for the Google account.
2. Create an **App Password** (Google Account → Security → App passwords).
3. In `.env` fill in `SMTP_USER` (the Gmail address), `SMTP_PASS` (the app password) and `SMTP_FROM`, then restart the app.

Without these settings, "forgot password" is off and the owner resets passwords from **Settings → Users & permissions**.

---

## Backup and restore

- **Download:** Owner → **Settings → My account → Download backup**. One `.sitecore` file holds every record, including login details — keep it safe.
- **From the computer:** `npm run backup` writes the same file into `backups\` (schedule it daily with Windows Task Scheduler).
- **Restore** (only into an empty database — it refuses to overwrite data):

  ```powershell
  npm run db:stop; npm run db:start
  npx prisma migrate reset --skip-seed    # empties the database (asks you to confirm)
  npm run db:restore -- path\to\sitecore-backup-YYYYMMDDHHMM.sitecore
  ```

The bundled database lives in `.pgdata\`. Stop it (`npm run db:stop`) before copying that folder, and pause OneDrive while the app is running so it doesn't sync live database files.

---

## Lost the phone with the 2-step app?

- A manager: the owner resets their password (this also turns off their 2-step login).
- The owner: on the computer running SITECORE, run `npm run user:disable-2fa -- owner`.

---

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app for development (http://localhost:3000) |
| `npm run build` / `npm start` | Production build / run |
| `npm run db:start` / `db:stop` / `db:status` | Bundled database |
| `npm run typecheck` | TypeScript check (regenerates route types first) |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (no database needed) |
| `npm run test:integration` | Integration tests against `TEST_DATABASE_URL` (wiped each run) |
| `npm run test:e2e` | Browser tests (needs the demo data; first run `npx playwright install chromium`) |
| `npm run db:migrate` | Create a new migration after changing `prisma/schema/*.prisma` |
| `npm run db:deploy` | Apply migrations |
| `npm run db:seed` | Defaults (+ demo company when `SEED_DEMO=true`) |
| `npm run db:reset` | **Development only:** wipe the database and reload the demo |
| `npm run backup` / `db:restore -- <file>` | Backup / restore |
| `npm run user:disable-2fa -- <login>` | Turn off 2-step login for one person |

## Documentation

- [docs/SPEC.md](docs/SPEC.md): requirements, additions §50–66, and build status
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): code layout, money and stock rules, permissions, testing
- [docs/SECURITY.md](docs/SECURITY.md): logins, sessions, permissions, money records, backups
