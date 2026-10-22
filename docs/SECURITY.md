# SITECORE — Security notes

| Concern | What SITECORE does |
|---|---|
| Who can log in | Only users created by the owner (roles ADMIN / MANAGER). There is no sign-up page or public API. `/setup` works only while the database has zero users. |
| Passwords | argon2id (19 MiB, t=2). Minimum 8 characters; easy patterns and the login name are refused. Passwords can only be reset by the owner (no email reset). A manager must choose their own password at first login. |
| Sessions | 256-bit random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` with the `__Host-` prefix in production). Only SHA-256(token) is stored. 8-hour idle timeout, 7-day absolute limit, both configurable. Sessions end on deactivation and on password change or reset. Users can see their devices and sign them out. |
| Brute force | 5 failed logins per login name, or 20 per IP, within 15 minutes locks login for 15 minutes. Timing is equalised for unknown users. Every failure is audited. |
| Authorisation | Checked on the server in every page, action and service. Hidden buttons are only a convenience. Managers are limited to their assigned projects. Owner-only permissions can never be granted, even by editing the database. Not-found and forbidden look the same for other people's projects. |
| CSRF | Next.js server actions check the `Origin` header. Cookies are `SameSite=Lax`. There are no state-changing GET routes. |
| Injection / XSS | All queries go through Prisma or tagged-template `$queryRaw` (parameterised). React escapes output. No `dangerouslySetInnerHTML` with user data. |
| Validation | Zod parses every action input on the server: amounts, dates, phone, GSTIN, PAN, ids. |
| Financial integrity | Database triggers stop DELETE on payments, receipts, expenses, income, transfers, the ledger and the audit log, and stop edits to their amounts. Corrections use owner-only reversals. Month lock blocks backdated entries. Amounts are integer paise. |
| Audit | Every change writes who, what, when and before/after, in the same transaction as the change. The audit log cannot be edited or deleted. |
| Secrets | Only `.env` on the server (never committed; see `.env.example`). Nothing secret is exposed to the browser. Only `NEXT_PUBLIC_MAP_*` values are public. |
| Bank details | Only the last 4 digits of account numbers are stored. |
| Uploads (Stage 4) | A storage provider outside `public/`, checks by file content (magic bytes), size limits, random names, and downloads only through an authorised route. |

## Before going live (Stage 5 checklist)

- Serve over HTTPS only (reverse proxy or host). Set `NODE_ENV=production`.
- Add security headers / CSP in `next.config.ts`.
- Turn on 2-step login (TOTP) for the owner.
- Schedule the daily backup (pg_dump) and test a restore.
- Use a dedicated PostgreSQL role with access to only the `sitecore` database.
