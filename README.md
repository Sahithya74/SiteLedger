# SITECORE

**One simple control room for a construction business.** Projects, sites, work, people, materials, money and alerts all live in one private app. Only two kinds of people can log in: the **Owner** and a **Manager**.

> **Status: Stage 1 of 5.**
> - Built: login and roles, the owner and manager dashboards, projects (overview, work breakdown, map), clients, engineers, pending work, search, audit log and settings.
> - The full database (materials, labour, accounts, equipment…) is in place, and the demo data fills it.
> - The screens for those modules arrive in Stages 2–4.
>
> See [docs/SPEC.md](docs/SPEC.md) for the build status.

---

## Set up on Windows (first time)

You need **Node.js 22+** (24 recommended), **Git** and **PostgreSQL 17** (or newer).

### 1. Install PostgreSQL

Open PowerShell and run:

```powershell
winget install PostgreSQL.PostgreSQL.17
```

Or download the installer from <https://www.postgresql.org/download/windows/>.

During installation:
- Set a password for the `postgres` user and write it down.
- Keep port **5432**.
- You can untick *Stack Builder*.

### 2. Create the databases

Open **SQL Shell (psql)** from the Start menu. Press Enter to accept the defaults, then type the `postgres` password. Then run:

```sql
CREATE ROLE sitecore WITH LOGIN PASSWORD 'choose-a-strong-password' CREATEDB;
CREATE DATABASE sitecore OWNER sitecore;
CREATE DATABASE sitecore_test OWNER sitecore;
```

`CREATEDB` lets Prisma create a temporary "shadow" database while it prepares migrations in development.

### 3. Configure

```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\SiteLedger"
copy .env.example .env
notepad .env
```

In `.env`, replace `CHANGE_ME` in `DATABASE_URL` and `TEST_DATABASE_URL` with the password from step 2.

### 4. Install, create the tables and load the demo company

```powershell
npm install
npm run db:deploy      # create all tables, guards and indexes
npm run db:seed        # default categories + demo company (because SEED_DEMO=true)
```

### 5. Start

```powershell
npm run dev
```

Open <http://localhost:3000> and log in with one of the demo accounts:

| Who | Login name | Password |
|---|---|---|
| Owner | `owner` | `Sunrise@2026` |
| Manager (Site Manager permissions) | `manager` | `Site@2026` |

To start again from a clean demo at any time, run `npm run db:reset`.

---

## Using it for real (production)

1. In `.env`, set `SEED_DEMO=false`.
2. Run `npm run db:deploy`, then `npm run db:seed`. With demo data off, the seed only creates the default categories.
3. `npm run build`, then `npm start` (set `NODE_ENV=production` and serve over HTTPS).
4. Open the site. The first visit shows **Set up SITECORE**, where the owner account is created. After that, the setup page is closed for good.
5. The owner adds managers under **Settings → Users & permissions**.

Read [docs/SECURITY.md](docs/SECURITY.md) before going live.

---

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app for development (http://localhost:3000) |
| `npm run build` / `npm start` | Production build / run |
| `npm run typecheck` | TypeScript check (regenerates route types first) |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (no database needed) |
| `npm run test:integration` | Integration tests against `TEST_DATABASE_URL` (wiped each run) |
| `npm run test:e2e` | Browser tests (needs the demo data; first run `npx playwright install chromium`) |
| `npm run db:migrate` | Create a new migration after changing `prisma/schema/*.prisma` |
| `npm run db:deploy` | Apply migrations |
| `npm run db:seed` | Defaults (+ demo company when `SEED_DEMO=true`) |
| `npm run db:reset` | **Development only:** wipe the database and reload the demo |
| `npm run db:studio` | Browse the database in a web UI |

## Environment variables

All variables are described in [.env.example](.env.example).

## Documentation

- [docs/SPEC.md](docs/SPEC.md): the full requirements, the 16 additions, and what each stage delivers
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): code layout, money and stock rules, permissions, and testing strategy
- [docs/SECURITY.md](docs/SECURITY.md): how logins, sessions, permissions and financial records are protected
