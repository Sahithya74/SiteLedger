# SITECORE — Product specification

**Private Construction Operations & Accounts Management System**

Sections 1–49 are the original requirements, written down compactly with every requirement kept. Sections 50–65 are additions agreed during planning. The **Stage** column in [Build status](#build-status) records what is built so far.

---

## Part A — Original requirements (1–49)

### 1. Core access model
There are only two roles.

- **Admin / Owner** has complete authority. They can:
  - view everything
  - create, edit and delete projects and sites
  - manage managers, engineers, labour, vendors and shops, materials, clients, quotations, invoices, payments, expenses, wages, bank accounts, budgets and documents
  - view all reports and financial dashboards
  - configure notifications
  - export data, back up and restore
  - change system settings
- **Manager** maintains operational information. They can:
  - view assigned projects
  - update progress and site activities
  - record attendance, material usage and deliveries
  - add site issues and update work status
  - maintain engineer assignments
  - record expenses and daily reports
  - upload photos and documents
  - see project finance only as their permissions allow
- **A Manager must NOT automatically be able to:**
  - delete financial records
  - modify bank transactions
  - change historical payments
  - modify owner-level settings
  - create another administrator
  - alter system security
  - permanently delete projects
- Permission controls let the Admin decide what each Manager can access.

### 2. No other users
- There is no public registration and no client, labour, engineer, vendor, public or guest accounts.
- The application is private and only Admin and Manager can log in.
- Security requirements: secure authentication, password hashing, session management, RBAC, rate limiting, and server-side authorisation on every protected route. Hiding a button is never the security.

### 3. Main purpose
The application is a complete, central "control room" view of the business:
- projects: active, completed and pending, with locations
- work: current, delayed and upcoming
- materials: required, available and to purchase, plus the vendors who supply them
- people: labour count and wages, engineer assignments and wages
- money: quotations, received, pending, contractor and worker payments, expenses, bank transactions, profit and loss
- deadlines and notifications

### 4. Main dashboard
- **Top row:** active, completed and pending projects; total project value; received; pending; current expenses; outstanding payments.
- **Project status:** Active, Planning, On Hold, Delayed, Completed, Cancelled.
- **Financial summary:** quoted, received, pending, expenses, labour wages, engineer wages, material costs, other expenses, net position.
- **Today's site activity:** active sites, labour present, engineers present, work today, materials received and required, issues reported.
- **Alerts** with severity, e.g. low cement stock, steel payment pending, client payment overdue, worker wages pending, engineer task overdue, delivery tomorrow, project behind schedule.

### 5. Project management
Fields:
- ID, name, client name, phone and email
- address, location, GPS, map link
- type, start, expected and actual completion dates, status, description
- quoted amount, final contract amount
- received, pending, total expenses, estimated profit, actual profit

Types: Residential, Commercial, Industrial, Renovation, Interior, Infrastructure, Other.

### 6. Project map
- Each project shows its location, a map and its coordinates.
- It lists nearby material shops, hardware, steel, sand, stone and granite suppliers, transport and labour services.
- **No hard-coded fake businesses.** It must be designed so real map and place data can be connected through an API later.

### 7. Project work management
- A work breakdown, e.g.:
  - Foundation: excavation, PCC, footing, reinforcement, concrete
  - Structure: columns, beams, slab
  - Masonry: brickwork, blockwork
  - Finishing: plastering, flooring, painting, doors, windows, granite, electrical, plumbing
- Each item has: name, description, engineer, team, start, expected and actual completion, status, % complete, estimated and actual cost, notes, photos, documents and dependencies.
- Statuses: Not Started, Planning, In Progress, Delayed, Completed, On Hold.

### 8. Pending work
- A dedicated view showing: project, site, work, responsible person, due date, days remaining, priority (Low, Medium, High, Critical), reason pending, estimated cost and dependencies.
- Overdue work is visually obvious.

### 9. Material management
Categories:
- **Aggregates:** M-Sand, River Sand, P-Sand, 6, 12 and 20 mm aggregate, jelly, blue metal, gravel, other.
- **Cement:** brand, grade, bags, price, supplier, purchase date.
- **Steel:** 6–25 mm and custom sizes, with quantity, weight, rate, supplier and amount.
- **Bricks and blocks:** red, fly ash, AAC, solid, hollow.
- **Stone and granite:** type, colour, thickness, size, quantity, supplier, rate.
- **Tiles:** brand, type, size, finish, quantity, rate.
- **Custom** categories.

### 10. Material stock
- Per material: opening, purchased, used, transferred, damaged, remaining, reorder level and value.
- Status is AVAILABLE, LOW STOCK or OUT OF STOCK, with a warning when stock falls below the threshold.

### 11. Material purchases
- Fields: supplier, material, quantity, unit, rate, tax, transport, total, payment status (Paid, Partially Paid, Pending), purchase date, expected and actual delivery, invoice number and invoice document.

### 12. Supplier / shop directory
- Fields: name, category, contact, phone, address, location, materials, price range, payment terms, notes, rating, last purchase, outstanding.
- Categories: Hardware, Cement, Steel, Sand, Stone, Granite, Tiles, Electrical, Plumbing, Paint, Transport, Other.
- Vendors can be associated with projects.

### 13. Labour management
- Fields: name, category, contact, project, work type, daily wage, overtime rate, attendance, days worked, total wages, paid, pending.
- Categories: Mason, Helper, Carpenter, Painter, Electrician, Plumber, Steel worker, Tile worker, Granite worker, Machine operator, Other.
- No labour logins.

### 14. Labour attendance
- Per project and date: worker, present, absent or half-day, overtime, daily wage, calculated wage.
- Automatic daily, weekly and monthly totals and pending wages.
- Manual adjustments with an audit trail.

### 15. Labour food / welfare expenses
- Breakfast, lunch, dinner, water, accommodation, travel, other.
- Recorded with date, project, category, quantity, cost, paid by and notes.
- These count in project expenses.

### 16. Site engineers
- Fields: name, contact, qualification, role, projects, joining date, salary or daily wage, payment frequency, paid, pending, responsibilities.
- Work tracked per engineer: task, project, deadline, status, completion, notes, site visits, reports.
- No engineer logins.

### 17. Engineer notifications
- Work-based reminders, e.g. "Concrete inspection required at Project A tomorrow".
- Admin or Manager records that the reminder was sent.
- No SMS or WhatsApp integration in version 1, but the design allows it later.

### 18. Client management
- Fields: name, phone, email, address, projects, quotation, contract amount, received, pending, payment history, notes, documents.
- No client logins.

### 19. Quotations
- Contents: client, project, work items (quantity, unit, rate, amount), tax, discount, total, terms, validity, notes.
- Statuses: Draft, Sent, Accepted, Rejected, Expired.
- PDF export and printing.

### 20. Client payments
- Fields: client, project, date, amount, method (Bank transfer, UPI, Cheque, Cash, Other), bank account, transaction reference, milestone, invoice or receipt, notes.
- Shows total contract, billed, received and pending.

### 21. Bank management
- Fields: bank, account name, type, identifier, opening and current balance. Sensitive details are not shown unnecessarily.
- Every transaction is tied to a bank or cash account: client, supplier, labour and engineer payments, expenses, transfers, each with a reference.
- A ledger that makes reconciliation possible.

### 22. Accounting
Simple language, not accounting software.
- **Income:** client payments, other income.
- **Expenses:** materials, labour, engineers, transport, food, equipment, rent, electricity, other.
- **Payables** and **receivables**.
- **Project profitability:** contract − materials − labour − engineers − other = estimated or actual profit.

### 23. Worker payment tracking
- Per worker: earned, paid and pending, plus a payment history (date, amount, method, account, reference, notes).
- Records are never deleted; corrections use reversal or adjustment entries.

### 24. Expense management
- Fields: date, project, category (configurable), description, amount, method, account, paid to, reference, receipt, notes.

### 25. Document management
- Attachments for projects, quotations, payments, purchases, expenses, site reports, work items and inspections.
- Examples: bills, invoices, receipts, contracts, photos, drawings, approvals, quotations.

### 26. Daily site report
- Fields: date, project, weather, labour and engineers present, work completed, materials received and used, equipment, issues, safety observations, photos, notes.
- Produces a professional report.

### 27. Equipment
- Types: mixer, vibrator, drill, cutter, excavator, JCB, crane, generator, other.
- Tracked: owned or rented, rental cost, operator, project, usage, maintenance, fuel, status.

### 28. Notification center
- One central list with severity indicators (🔴 🟠 🟢 🔵), e.g. payment overdue, stock low, wages pending, work overdue, payment received, delivery scheduled.
- Notifications can be marked as read.

### 29. Reports
- Reports: project progress, expenses and profitability; client payments and pending payments; supplier payments; worker wages; engineer payments; material purchases and stock; daily site activity; monthly expenses; bank transactions; cash flow.
- Filters: project, date, category, status. Export as PDF and CSV.

### 30. Search
- Fast, forgiving global search across projects, clients, materials, suppliers, workers, engineers, payments, expenses and documents.

### 31. Audit log
- Every important change records: user, action, date and time, entity, and before and after values.
- Financial records get stronger protection.

### 32. User experience
- For non-technical users: plain English, clear labels, large numbers, familiar icons and obvious buttons.
- Confirmation before destructive actions, empty states, tooltips and sensible defaults.
- Wording examples: "Add Client Payment" (not "Create receivable transaction"), "Material stock is low", "Assign Work".

### 33. Design style
- Professional, modern, clean, premium, calm and suited to construction.
- No excessive animation, gaming look, neon, huge gradients, clutter or needless charts.
- Subtle transitions only.

### 34. Responsive design
- Works on desktop, laptop, tablet and mobile. Desktop and tablet come first; site pages must be comfortable on mobile.

### 35. Technical architecture
- React, TypeScript, Next.js, Tailwind, shadcn/ui, PostgreSQL, Prisma, Zod, Recharts.
- Secure session authentication.
- A map integration layer (Google, Mapbox or OSM) and a storage abstraction (local now, S3 later).

### 36. Database
- Normalised, with foreign keys, timestamps and soft delete.
- Critical financial history is never hard-deleted.
- Entities include: User, Role, Permission, Project, Client, Site, WorkItem, WorkAssignment, Engineer, Labour, Attendance, LabourPayment, EngineerPayment, Material, MaterialCategory, InventoryTransaction, Supplier, Purchase, PurchaseItem, Quotation, QuotationItem, Invoice, ClientPayment, BankAccount, BankTransaction, Expense, ExpenseCategory, ProjectBudget, Equipment, EquipmentUsage, DailyReport, Notification, Document, AuditLog.

### 37. Security
- Secure authentication, hashing, session expiry, RBAC and permission checks.
- Validation, ORM protection against SQL injection, XSS and CSRF protection, rate limiting.
- Safe uploads, audit logging and secure environment variables. No secrets in the frontend.

### 38. Financial safety
- Precise money: integer minor units or decimals, never careless floats.
- ₹1,25,000.00 with Indian numbering.
- Historical records are never changed silently.

### 39. India-first design
- INR, Indian dates and numbering, UPI, bank transfer, cheque and cash.
- GST, PAN and GSTIN fields where they are needed.
- The data must be exportable for an accountant, without over-complicating compliance.

### 40. Dashboard visualisation
- Charts only where useful: project status, cash flow, income vs expenses, profitability, material consumption, pending payments, work progress.

### 41. Admin navigation
- **Dashboard**
- **Projects:** all, active, pending, completed, work schedule, daily reports
- **Materials:** inventory, purchases, suppliers, low stock
- **People:** engineers, labour, attendance, wages
- **Clients:** clients, quotations, payments, pending payments
- **Accounts:** overview, income, expenses, payables, receivables, bank accounts, transactions
- **Equipment**
- **Reports**
- **Notifications**
- **Documents**
- **Audit Log**
- **Settings**

### 42. Dashboard concept
- The owner should understand the whole company in about 30 seconds.
- Headline figures: active projects (value), received, pending, expenses, labour present, open issues, overdue work.
- Then **"Things that need your attention"**, a ranked list.

### 43. Project detail page
- Header: name, client, location, status and progress.
- Tabs: Overview, Work, Materials, Labour, Engineers, Expenses, Payments, Documents, Reports, Map.

### 44. Data integrity
- A project with financial transactions cannot be deleted. The message is: *"This project contains financial records and cannot be permanently deleted. You can archive it instead."*
- A payment above the relevant balance needs a warning and confirmation.

### 45. Seed data
- Realistic demo data for development: 3 projects plus clients, workers, engineers, materials, suppliers, expenses, payments, bank accounts, pending work and notifications.
- No demo data in production.

### 46. Development approach
Stages:
1. Auth, database, dashboards, projects, clients, basic work
2. Materials, suppliers, labour, engineers, attendance, wages
3. Quotations, payments, expenses, banks, accounting
4. Reports, documents, notifications, maps, daily reports
5. Hardening, audit, performance, responsive polish, testing

Rules for every stage: the app stays runnable, migrations stay valid, there are no placeholder buttons, and nothing pretends to be finished.

### 47. Code quality
- Strong types, reusable components, a clear structure and service separation.
- Error, loading and empty states, and validation.
- Unit tests for money calculations and integration tests for key workflows.
- No massive files, duplication, hard-coded values or permissions, or fake APIs.

### 48. Product principle
"One simple control room for my entire construction business." The user should always know:
- what is happening, and where
- who is responsible
- how much it costs and how much has been paid
- what is pending
- what needs attention

### 49. Final deliverable
- A working full-stack project with structure, schema, auth, RBAC, UI, APIs, migrations, seed, validation, error handling, responsive design and docs.
- Also: setup instructions, an env example and a testing strategy.

---

## Part B — Additions agreed during planning (50–65)

| # | Addition | Stage |
|---|---|---|
| 50 | **Sites inside projects.** A project can have several sites; a default "Main site" is created automatically and the site picker is hidden when there is only one. | 1 ✅ |
| 51 | **Labour contractors (mestri / gang leaders).** Piece-rate or lump-sum work orders, contractor bills with retention and TDS (194C), and payments. | 2 (schema ✅) |
| 52 | **Worker advances and weekly wage settlement.** Settlement day is configurable (default Saturday). Wage sheet = attendance + overtime − advances − deductions; pay the whole sheet in one action. | 2 (schema ✅) |
| 53 | **Site cash (petty cash).** The owner gives cash to the manager, who records site expenses against it. Balance, top-ups and settlement are tracked. | 3 (schema ✅) |
| 54 | **Material requests.** The site raises a request, the owner approves it and it becomes a purchase. Stock is kept per site plus a main store, with transfers. | 2 (schema ✅) |
| 55 | **Client running (RA) bills.** GST (CGST+SGST / IGST) with HSN/SAC, retention held by the client, client TDS, and **extra work / variations** that change the contract value once approved. | 3 (schema ✅) |
| 56 | **Cheque tracking.** Received → deposited → cleared / bounced, with a reminder when a post-dated cheque can be deposited. | 3 (schema ✅, alert ✅) |
| 57 | **Indian financial year (Apr–Mar)** filters, plus a **month lock** so closed periods cannot receive backdated entries. | 3 (enforced in services ✅) |
| 58 | **Account safety.** Optional 2-step login for the owner, owner-only password resets, a list of active sessions, and "sign out everywhere". | 1 ✅ (2-step: 5) |
| 59 | **WhatsApp share links** (`wa.me`) for reminders and reports, with no API needed. | 4 (contact links ✅) |
| 60 | **India formatting.** IST "today", DD-MM-YYYY, ₹1,25,000.00, ₹2.8 Cr and ₹90 L, and amount in words on bills ("Rupees One Lakh Twenty-Five Thousand Only"). | 1 ✅ |
| 61 | **Supplier price history**, compared across suppliers. | 2 |
| 62 | **Excel/CSV import** of workers, materials and suppliers. | 5 |
| 63 | **Backup.** "Download backup" plus a daily script. Restore is from the command line only. | 5 |
| 64 | **Mobile site use.** Installable PWA, camera upload, image compression. | 4 |
| 65 | **Ready for other languages.** All labels live in one place. | 1 (structure ✅) |

---

## Build status

| Area | Status |
|---|---|
| Database schema for every module, plus integrity guards (triggers, CHECKs, trigram search) | ✅ Stage 1 |
| Login, sessions, rate limiting, first-run setup, password change and reset, sessions page | ✅ Stage 1 |
| Roles and editable manager permissions (with presets and owner-only permissions) | ✅ Stage 1 |
| Owner dashboard and manager dashboard (attention list, KPIs, today on site, money, cash flow) | ✅ Stage 1 |
| Projects (list, tabs, create and edit, status, archive, delete guard, overview, work, map) | ✅ Stage 1 |
| Clients, engineers (basic), pending work, global search, audit log | ✅ Stage 1 |
| Money, stock, attendance and purchase **services** (used by the demo data; screens come in Stages 2–3) | ✅ services only |
| Materials, suppliers, labour, attendance, wages screens | Stage 2 |
| Quotations, bills, payments, expenses, banks, accounting screens | Stage 3 |
| Reports, documents, notification centre, daily report screen, equipment, PWA | Stage 4 |
| Admin 2-step login, backups, CSV import, CSP headers, performance pass | Stage 5 |
