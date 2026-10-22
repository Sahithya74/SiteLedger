# SITECORE — Architecture

This document explains how the code is organised and why. It is written for a developer joining the project.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, **Cache Components** + Partial Prefetching), React 19 |
| Language | TypeScript (strict) |
| UI | Tailwind CSS v4, shadcn/ui (Radix base), lucide icons, Recharts, Leaflet + OpenStreetMap |
| Database | PostgreSQL 17+ through Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`, multi-file schema) |
| Validation | Zod 4 (the same schemas run on the server for every action) |
| Auth | Own database sessions (argon2id passwords, SHA-256-hashed session tokens) |
| Tests | Vitest (unit + integration against a real test database), Playwright (end-to-end) |

## Folder layout

```
prisma/
  schema/*.prisma         one file per area (access, projects, people, materials, money, operations, system)
  migrations/             SQL migrations; *_integrity_guards adds triggers, CHECKs and trigram indexes
  seed/                   default categories (always) + demo company (development only)
src/
  app/
    (auth)/               login, first-run setup, change password — centred layout, no menu
    (app)/                signed-in pages with the sidebar shell
      projects/[id]/(tabs)/   overview, work, map share the project header + tabs
  components/
    ui/                   shadcn primitives (generated; lightly adjusted)
    app/                  SITECORE building blocks: Money, StatTile, badges, forms, ConfirmAction, EmptyState…
    shell/                sidebar, search, user menu
  features/<module>/      zod schemas, server actions and client components for one module
  server/
    auth/                 passwords, sessions, login + rate limiting, current user
    services/             all business logic (projects, work, ledger, stock, alerts, dashboard…)
    action.ts             wraps server actions: validation errors → friendly messages
    audit.ts              audit log writer + "what changed" descriptions
    scope.ts              which projects a user may see
  lib/                    pure helpers shared by server and browser: money, dates, labels, permissions, progress…
  integrations/maps/      places providers (supplier directory, optional OpenStreetMap) and tile config
tests/unit | tests/integration | tests/e2e
```

**Rule of thumb:**
- Pages read data through `src/server/services` and never build queries themselves.
- Mutations go page → server action (`features/*/actions.ts`) → service.
- Services always check permission and project scope, and write the audit entry in the same transaction as the change.

## Request flow and security layers

1. **`src/proxy.ts`** (Next 16's middleware). If there is no session cookie, the visitor is redirected to `/login`. This is a convenience, not the security check.
2. **Server components** call `requireUser()` *before any database access*. With Cache Components this also marks the work as per-request. Pages render `NoAccess` when a permission is missing.
3. **Server actions** call `requireActionUser(permission)`, parse input with Zod, and call a service.
4. **Services** check again:
   - `can(user, permission)`
   - `projectWhere(user)` / `accessibleProjectIds(user)` to scope managers
   - business rules such as the archive/delete guard, period lock and overpayment confirmation.
5. **The database** enforces what must never happen even if code is wrong:
   - financial rows and the audit log cannot be deleted
   - amounts on saved financial rows cannot be updated
   - shape rules: one payee per payment, one person per attendance row, reversal sign.

## Money

- Every amount is `BigInt` **paise** (`…Paise` columns). `src/lib/money.ts` provides:
  - exact arithmetic
  - `qty × rate` with half-up rounding through decimal.js
  - Indian grouping (₹1,25,000.00), short forms (₹2.8 Cr / ₹90 L)
  - amount in words
  - a parser for typed amounts ("1,25,000.50").
- **Append-only ledger.**
  - Each money movement writes its business record (ClientPayment / Payment / Expense / OtherIncome / AccountTransfer) **and** a signed `BankTransaction` in the same transaction.
  - Balance = opening + Σ ledger.
  - Corrections are reversal rows with negative amounts linked by `reversalOfId`. Only the owner can reverse, and only once.
- **Costs are counted when incurred:**
  - purchases, attendance wages, approved contractor bills, expenses
  - salary payments and "other" payments to engineers or consultants.
- Payments that only *settle* something already counted (paying a purchase, wages, an advance) are never counted twice. See `src/lib/project-finance.ts` and `src/server/services/project-money.ts`.
- **Worker balance** = earned − wages paid − advances. Positive means wages are pending; negative means an advance is still outstanding.

## Stock

- Stock is a ledger (`InventoryTransaction`), never a number that gets overwritten.
- Remaining = opening + purchased + transfers in + adjustments − used − transfers out − damaged − returned, per material per location. A location is a project or the main store.
- Value uses the weighted average purchase rate.
- LOW / OUT status compares the remaining quantity with the material's reorder level.

## Dates

- Business dates are `@db.Date` and handled as `"YYYY-MM-DD"` strings (`ISODate`).
- "Today" is always India time (`todayIST()`). The display format is DD-MM-YYYY.
- The financial year runs April–March (`financialYear()`). The default wage week is Sunday–Saturday (`wageWeek()`).

## Permissions

- `src/lib/permissions.ts` lists every permission key with a plain-English label and group.
- The owner has all of them.
- Managers hold `UserPermission` rows that the owner edits, either on a checklist or with the "Site Manager" / "Office Manager" presets.
- Admin-only keys (users, settings, bank management, reversing money, archiving or deleting projects, month lock, backups) are refused in `can()` even if a row exists in the database.

## Alerts ("Things that need your attention")

- `src/server/services/alerts.ts` computes the attention list live from the records each time the dashboard loads:
  - overdue and due client bills
  - overdue and delayed work
  - projects past their date or behind plan
  - low and out-of-stock materials
  - pending wages
  - supplier payments due
  - deliveries
  - critical site issues
  - engineer tasks
  - post-dated cheques
  - material requests
  - recent payments received
- Items are ranked by severity, then by weight (amount or days late).
- Stage 4 will persist them to `Notification` (with `dedupeKey`) for the notification centre and engineer reminders.

## Maps

- `integrations/maps` defines a `PlacesProvider` interface.
- **Directory provider (default):** your own suppliers that have coordinates, sorted by distance.
- **Overpass (OpenStreetMap) provider:** optional, turned on with `MAPS_OVERPASS_ENABLED=true`.
- The map tab also links to live Google Maps searches around the site.
- No provider ever invents businesses. A Google Places or Mapbox provider can be added by implementing the same interface.

## Next.js 16 notes

- **Cache Components is enabled.**
  - Anything that reads the session, URL params or the database sits inside a `<Suspense>` boundary.
  - Each page is a thin wrapper that renders its async content component inside `Suspense` with a skeleton.
  - Nothing here uses `"use cache"`: financial numbers are always read fresh.
- **Forms:** `useActionForm` submits through `startTransition` instead of `<form action>`, so React does not reset the form when validation fails. The person never loses what they typed.
- **Route types** (`PageProps<"/projects/[id]">`) are generated by `next typegen`. `npm run typecheck` runs it first.

## Testing strategy

| Level | What | Command |
|---|---|---|
| Unit | Money arithmetic, rounding and words; IST / FY / wage-week dates; progress roll-up and schedule health; project money summary; wage calculation; the permission resolver | `npm test` |
| Integration | Real PostgreSQL (`TEST_DATABASE_URL`, wiped per test): login + lockout + sessions; manager scoping and refusals; owner-only permissions; ledger + balances; DB triggers blocking delete/update; reversals; period lock; overpayment confirmation; delete guard; work dependencies and alerts | `npm run test:integration` |
| End-to-end | Playwright against the demo data: login, dashboard attention list, create project → standard stages → delayed item → pending work; manager blocked from owner pages; phone layout without horizontal scroll | `npm run test:e2e` |

Each later stage adds tests for its own workflows: attendance → wages → payment; purchase → stock → payable; RA bill → client payment → receivable.
