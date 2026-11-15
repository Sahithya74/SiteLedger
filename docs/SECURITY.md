# SITECORE — Security notes

| Concern | What SITECORE does |
|---|---|
| Who can log in | Only users created by the owner (roles ADMIN / MANAGER). There is no sign-up page or public API. `/setup` works only while the database has zero users. |
| Passwords | argon2id (19 MiB, t=2). Minimum 8 characters; easy patterns and the login name are refused. A manager must choose their own password at first login. |
| Forgot password | Only to an email the person confirmed with a code first. 6-digit code, valid 10 minutes, single use, 5 tries, at most 3 codes per person (10 per IP) per hour. Only a hash of the code is stored. The reply is identical whether or not the account exists. A "password was changed" email follows. A successful reset signs out every device. 2-step login stays on. |
| 2-step login | Optional TOTP (RFC 6238, authenticator apps), recommended for the owner. A code can't be reused. Turning it off needs the password and a current code. Recovery: the owner resets a manager's password (also clears their 2-step), or `npm run user:disable-2fa -- <login>` on the server. |
| Sessions | 256-bit random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` with the `__Host-` prefix in production). Only SHA-256(token) is stored. 8-hour idle timeout, 7-day absolute limit, both configurable. Sessions end on deactivation, password change or reset, and when 2-step login is turned on. Users can see their devices and sign them out. |
| Brute force | **3** wrong passwords or 2-step codes per login name (or 20 per IP) within 15 minutes lock login for 15 minutes, with "2 tries left / 1 try left" warnings. Timing and messages are equal for unknown users. Every failure is audited. |
| Authorisation | Checked on the server in every page, action, route and service. Hidden buttons are only a convenience. Managers are limited to their assigned projects. Owner-only permissions can never be granted, even by editing the database. Not-found and forbidden look the same for other people's projects. |
| CSRF | Server actions check `Origin` against the host (extra hosts only via `SERVER_ACTION_ORIGINS`). Cookies are `SameSite=Lax`. Upload route checks `Origin` too. No state-changing GET routes. |
| Headers | CSP (own scripts/styles/images only, plus map tiles), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, strict referrer, permissions policy, HSTS in production. Attachments are served with a sandbox CSP. |
| Injection / XSS | Queries go through Prisma or tagged-template `$queryRaw` (parameterised). The only raw table names (backup / restore) come from the database catalogue. React escapes output; the one `dangerouslySetInnerHTML` is the server-generated QR code. CSV exports neutralise cells that Excel would run as formulas. |
| Validation | Zod parses every action input on the server: amounts, dates, phone, GSTIN, PAN, ids. CSV imports go through the same schemas as the forms and import nothing unless every row passes. |
| Financial integrity | Database triggers stop DELETE on payments, receipts, expenses, income, transfers, the ledger and the audit log, and stop edits to their amounts. Corrections use owner-only reversals. Month lock blocks backdated entries. Amounts are integer paise. |
| Audit | Every change writes who, what, when and before/after, in the same transaction. The audit log cannot be edited or deleted. |
| Backups | Owner-only download (audited) and `npm run backup`. The file contains everything, including password hashes and 2-step secrets — store it like a key. Restore only into an empty database. |
| Secrets | Only `.env` and `.pgdata.secret.json` on the server (never committed). Nothing secret is sent to the browser. Only `NEXT_PUBLIC_MAP_*` values are public. |
| Bank details | Only the last 4 digits of account numbers are stored. |
| Uploads | Stored outside `public/`, checked by file content (magic bytes), 15 MB limit, random names, downloads only through an authorised route. |

## Before going live

- Serve over HTTPS only (reverse proxy, host, or tunnel). Set `NODE_ENV=production`.
- Replace or remove the demo accounts (`SEED_DEMO=false`). Their passwords are public in the README.
- Turn on 2-step login for the owner, and confirm each person's email.
- Schedule `npm run backup` and test a restore into an empty database.
- Keep `.pgdata` out of cloud sync while the database runs (pause OneDrive, or move the folder).
- `npm audit` currently reports issues only in development tools (ESLint config, shadcn CLI), not in anything the running app loads.
