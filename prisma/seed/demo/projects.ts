import type { Priority, WorkStatus } from "@/generated/prisma/enums";
import type { ProjectFormInput } from "@/features/projects/schemas";
import { toDbDate, type ISODate } from "@/lib/dates";
import { db } from "@/server/db";
import { createClient } from "@/server/services/clients";
import { createProject } from "@/server/services/projects";
import { addStandardStages } from "@/server/services/work";
import { lakhs, log, type SeedContext } from "./context";

const NO_EXTRAS = { description: null, mapUrl: null, actualEndDate: null, statusNote: null, pincode: null } as const;

export async function seedClientsAndProjects(ctx: SeedContext) {
  const clients = [
    { key: "arun", name: "Arun Kumar & Family", phone: "9841234567", email: "arun.k@example.com", city: "Chennai", address: "12, 3rd Cross Street, Velachery, Chennai" },
    { key: "lakshmi", name: "Lakshmi Traders (P) Ltd", phone: "9442211334", email: "accounts@lakshmitraders.example", city: "Coimbatore", address: "45, Avinashi Road, Coimbatore", gstin: "33AABCL1234M1Z5", pan: "AABCL1234M" },
    { key: "ramesh", name: "Ramesh Iyer", phone: "9845098450", email: null, city: "Bengaluru", address: "221, 8th Main, Jayanagar 4th Block, Bengaluru" },
    { key: "sai", name: "Sai Developers", phone: "9848012345", email: "projects@saidevelopers.example", city: "Hyderabad", address: "Plot 17, Kondapur, Hyderabad", gstin: "36AAJFS5678K1Z2", pan: "AAJFS5678K" },
    { key: "meera", name: "Dr. Meera Nair", phone: "9447011223", email: "meera.nair@example.com", city: "Madurai", address: "7, Anna Nagar, Madurai" },
  ];
  for (const c of clients) {
    const { id } = await createClient(ctx.owner, {
      name: c.name,
      phone: c.phone,
      altPhone: null,
      email: c.email,
      address: c.address,
      city: c.city,
      gstin: c.gstin ?? null,
      pan: c.pan ?? null,
      notes: "Demo client",
    });
    ctx.ids[c.key] = id;
  }

  const projects: (ProjectFormInput & { key: string })[] = [
    {
      key: "villa",
      ...NO_EXTRAS,
      name: "Green Valley Villa",
      clientId: ctx.ids.arun,
      type: "RESIDENTIAL",
      status: "ACTIVE",
      description: "G+1 independent villa, 3,200 sq.ft built-up, with terrace garden.",
      address: "Plot 23, Green Valley Layout, Medavakkam, Chennai",
      city: "Chennai",
      state: "Tamil Nadu",
      pincode: "600100",
      latitude: 12.9206,
      longitude: 80.1924,
      startDate: ctx.day(-120),
      expectedEndDate: ctx.day(150),
      quotedPaise: lakhs(88),
      contractPaise: lakhs(85),
    },
    {
      key: "complex",
      ...NO_EXTRAS,
      name: "Lakshmi Commercial Complex",
      clientId: ctx.ids.lakshmi,
      type: "COMMERCIAL",
      status: "ACTIVE",
      description: "G+3 commercial building — shops on ground floor, offices above. 14,500 sq.ft.",
      address: "Survey No. 112, Saravanampatti, Coimbatore",
      city: "Coimbatore",
      state: "Tamil Nadu",
      pincode: "641035",
      latitude: 11.0797,
      longitude: 76.9997,
      startDate: ctx.day(-200),
      expectedEndDate: ctx.day(240),
      quotedPaise: lakhs(255),
      contractPaise: lakhs(240),
    },
    {
      key: "renovation",
      ...NO_EXTRAS,
      name: "Iyer Residence Renovation",
      clientId: ctx.ids.ramesh,
      type: "RENOVATION",
      status: "COMPLETED",
      description: "Kitchen and two bathrooms rebuilt, new flooring, full repainting.",
      address: "221, 8th Main, Jayanagar 4th Block, Bengaluru",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560011",
      latitude: 12.9293,
      longitude: 77.5826,
      startDate: ctx.day(-150),
      expectedEndDate: ctx.day(-20),
      actualEndDate: ctx.day(-25),
      quotedPaise: lakhs(19.5),
      contractPaise: lakhs(18),
    },
    {
      key: "apartments",
      ...NO_EXTRAS,
      name: "Sai Residency Apartments",
      clientId: ctx.ids.sai,
      type: "RESIDENTIAL",
      status: "PLANNING",
      description: "Stilt + 5 apartment block, 20 flats. Waiting for building approval.",
      address: "Kondapur, Hyderabad",
      city: "Hyderabad",
      state: "Telangana",
      latitude: null,
      longitude: null,
      startDate: ctx.day(30),
      expectedEndDate: ctx.day(600),
      quotedPaise: lakhs(320),
      contractPaise: 0n,
      statusNote: "Waiting for GHMC building approval",
    },
  ];
  for (const { key, ...input } of projects) {
    const { id } = await createProject(ctx.owner, input);
    ctx.ids[key] = id;
  }
  log(`${clients.length} clients and ${projects.length} projects`);
}

type WorkState = {
  status: WorkStatus;
  percent: number;
  start?: number;
  end?: number;
  done?: number;
  est?: number; // lakhs
  priority?: Priority;
  engineer?: string;
  team?: string;
  reason?: string;
};

async function setWork(ctx: SeedContext, projectKey: string, name: string, s: WorkState) {
  const item = await db.workItem.findFirst({ where: { projectId: ctx.ids[projectKey], name, deletedAt: null } });
  if (!item) throw new Error(`Seed: work item ${name} not found`);
  const date = (offset?: number) => (offset === undefined ? null : toDbDate(ctx.day(offset) as ISODate));
  await db.workItem.update({
    where: { id: item.id },
    data: {
      status: s.status,
      percentComplete: s.status === "COMPLETED" ? 100 : s.percent,
      startDate: date(s.start),
      expectedEndDate: date(s.end),
      actualEndDate: s.status === "COMPLETED" ? date(s.done ?? s.end) : null,
      estimatedCostPaise: s.est ? lakhs(s.est) : 0n,
      actualCostPaise: s.status === "COMPLETED" && s.est ? lakhs(Math.round(s.est * (0.92 + 0.15 * ctx.rand()) * 100) / 100) : 0n,
      priority: s.priority ?? "MEDIUM",
      engineerId: s.engineer ? ctx.ids[s.engineer] : null,
      team: s.team ?? null,
      pendingReason: s.reason ?? null,
    },
  });
}

export async function seedWork(ctx: SeedContext) {
  await addStandardStages(ctx.owner, ctx.ids.villa);
  await addStandardStages(ctx.owner, ctx.ids.complex);
  await addStandardStages(ctx.owner, ctx.ids.renovation);

  // Green Valley Villa — foundation done, slab running 3 days late.
  const v = (name: string, s: WorkState) => setWork(ctx, "villa", name, { engineer: "karthik", ...s });
  await v("Excavation", { status: "COMPLETED", percent: 100, start: -118, end: -110, done: -111, est: 1.8 });
  await v("PCC", { status: "COMPLETED", percent: 100, start: -110, end: -104, done: -104, est: 1.2 });
  await v("Footing", { status: "COMPLETED", percent: 100, start: -104, end: -92, done: -90, est: 3.5 });
  await v("Reinforcement", { status: "COMPLETED", percent: 100, start: -96, end: -85, done: -84, est: 4.2 });
  await v("Concrete", { status: "COMPLETED", percent: 100, start: -86, end: -78, done: -77, est: 3.8 });
  await v("Columns", { status: "COMPLETED", percent: 100, start: -76, end: -55, done: -54, est: 5.5 });
  await v("Beams", { status: "COMPLETED", percent: 100, start: -54, end: -30, done: -28, est: 6.0 });
  await v("Slab", { status: "IN_PROGRESS", percent: 60, start: -27, end: -3, est: 7.5, priority: "HIGH", reason: "Shuttering sheets arrived late; concreting rescheduled", team: "Murugan's mason gang (6)" });
  await v("Brickwork", { status: "NOT_STARTED", percent: 0, start: 5, end: 40, est: 6.5 });
  await v("Blockwork", { status: "NOT_STARTED", percent: 0, start: 15, end: 45, est: 2.0 });
  await v("Plastering", { status: "NOT_STARTED", percent: 0, start: 45, end: 80, est: 5.0 });
  await v("Electrical", { status: "IN_PROGRESS", percent: 20, start: -20, end: 90, est: 4.5, engineer: "venkatesh", reason: "Conduits laid with slab; wiring after plastering" });
  await v("Plumbing", { status: "IN_PROGRESS", percent: 15, start: -20, end: 95, est: 3.8, engineer: "venkatesh" });
  await v("Flooring", { status: "NOT_STARTED", percent: 0, start: 85, end: 115, est: 6.0 });
  await v("Granite", { status: "NOT_STARTED", percent: 0, start: 100, end: 120, est: 2.5 });
  await v("Doors", { status: "NOT_STARTED", percent: 0, start: 110, end: 130, est: 2.8 });
  await v("Windows", { status: "NOT_STARTED", percent: 0, start: 110, end: 130, est: 2.2 });
  await v("Painting", { status: "NOT_STARTED", percent: 0, start: 120, end: 148, est: 3.5 });

  // Lakshmi Commercial Complex — structure underway, blockwork late.
  const c = (name: string, s: WorkState) => setWork(ctx, "complex", name, { engineer: "priya", ...s });
  await c("Excavation", { status: "COMPLETED", percent: 100, start: -198, end: -185, done: -186, est: 4.5 });
  await c("PCC", { status: "COMPLETED", percent: 100, start: -185, end: -178, done: -177, est: 3.0 });
  await c("Footing", { status: "COMPLETED", percent: 100, start: -178, end: -160, done: -158, est: 9.0 });
  await c("Reinforcement", { status: "COMPLETED", percent: 100, start: -165, end: -150, done: -149, est: 12.0 });
  await c("Concrete", { status: "COMPLETED", percent: 100, start: -150, end: -140, done: -139, est: 11.0 });
  await c("Columns", { status: "COMPLETED", percent: 100, start: -138, end: -90, done: -88, est: 16.0 });
  await c("Beams", { status: "IN_PROGRESS", percent: 80, start: -88, end: 10, est: 18.0 });
  await c("Slab", { status: "IN_PROGRESS", percent: 45, start: -60, end: 25, est: 24.0, priority: "HIGH" });
  await c("Brickwork", { status: "IN_PROGRESS", percent: 30, start: -40, end: 60, est: 14.0, team: "Murugesan mestri gang", engineer: "venkatesh" });
  await c("Blockwork", { status: "NOT_STARTED", percent: 0, start: -20, end: -5, est: 6.0, reason: "Solid blocks not yet delivered" });
  await c("Plastering", { status: "NOT_STARTED", percent: 0, start: 60, end: 120, est: 12.0 });
  await c("Electrical", { status: "PLANNING", percent: 0, start: 30, end: 200, est: 15.0 });
  await c("Plumbing", { status: "PLANNING", percent: 0, start: 30, end: 200, est: 10.0 });
  await c("Flooring", { status: "NOT_STARTED", percent: 0, start: 150, end: 200, est: 14.0 });
  await c("Granite", { status: "NOT_STARTED", percent: 0, start: 170, end: 210, est: 5.0 });
  await c("Doors", { status: "NOT_STARTED", percent: 0, start: 180, end: 220, est: 6.0 });
  await c("Windows", { status: "NOT_STARTED", percent: 0, start: 180, end: 220, est: 8.0 });
  await c("Painting", { status: "NOT_STARTED", percent: 0, start: 200, end: 238, est: 9.0 });

  // Renovation — everything finished.
  const renovationItems = await db.workItem.findMany({ where: { projectId: ctx.ids.renovation, parentId: { not: null } } });
  for (const [i, item] of renovationItems.entries()) {
    await db.workItem.update({
      where: { id: item.id },
      data: {
        status: "COMPLETED",
        percentComplete: 100,
        startDate: toDbDate(ctx.day(-150 + i * 6)),
        expectedEndDate: toDbDate(ctx.day(-140 + i * 6)),
        actualEndDate: toDbDate(ctx.day(-141 + i * 6)),
        estimatedCostPaise: lakhs(0.8),
      },
    });
  }

  // Extra work agreed with the villa client.
  await db.variation.create({
    data: {
      projectId: ctx.ids.villa,
      number: 1,
      title: "Terrace pergola and planter boxes",
      description: "Client requested a steel pergola with planter boxes on the terrace.",
      amountPaise: lakhs(2.5),
      status: "APPROVED",
      requestedOn: toDbDate(ctx.day(-40)),
      decidedOn: toDbDate(ctx.day(-35)),
    },
  });

  // Budgets (estimated cost) by cost head.
  const budgets: [string, "MATERIALS" | "LABOUR" | "CONTRACTORS" | "ENGINEERS" | "OTHER", number][] = [
    ["villa", "MATERIALS", 38],
    ["villa", "LABOUR", 12],
    ["villa", "CONTRACTORS", 10],
    ["villa", "ENGINEERS", 4],
    ["villa", "OTHER", 5],
    ["complex", "MATERIALS", 110],
    ["complex", "LABOUR", 30],
    ["complex", "CONTRACTORS", 28],
    ["complex", "ENGINEERS", 8],
    ["complex", "OTHER", 14],
  ];
  await db.projectBudget.createMany({
    data: budgets.map(([p, group, amount]) => ({ projectId: ctx.ids[p], group, budgetPaise: lakhs(amount) })),
  });

  log("work breakdown, a variation and budgets");
}

export async function seedSiteItems(ctx: SeedContext) {
  await db.issue.createMany({
    data: [
      {
        projectId: ctx.ids.villa,
        title: "Water seepage in sump",
        description: "Seepage seen on the north wall of the underground sump after rain.",
        severity: "HIGH",
        status: "OPEN",
        reportedOn: toDbDate(ctx.day(-2)),
        reportedById: ctx.ids.manager,
        assignedTo: "Karthik Raman",
      },
      {
        projectId: ctx.ids.complex,
        title: "Scaffolding unsafe on east side",
        description: "Two scaffolding pipes loose near 2nd floor. Work on that side stopped until fixed.",
        severity: "CRITICAL",
        status: "OPEN",
        reportedOn: toDbDate(ctx.today),
        reportedById: ctx.ids.manager,
        assignedTo: "Priya Shankar",
      },
      {
        projectId: ctx.ids.complex,
        title: "Crack in compound wall plaster",
        severity: "MEDIUM",
        status: "IN_PROGRESS",
        reportedOn: toDbDate(ctx.day(-6)),
        reportedById: ctx.owner.id,
      },
    ],
  });

  await db.engineerTask.createMany({
    data: [
      {
        engineerId: ctx.ids.karthik,
        projectId: ctx.ids.villa,
        kind: "INSPECTION",
        title: "Concrete cube test inspection",
        description: "7-day cube test for the first-floor slab concrete.",
        dueDate: toDbDate(ctx.day(1)),
        status: "NOT_STARTED",
      },
      {
        engineerId: ctx.ids.priya,
        projectId: ctx.ids.complex,
        kind: "REPORT",
        title: "Submit bar bending schedule for 2nd floor slab",
        dueDate: toDbDate(ctx.day(-2)),
        status: "IN_PROGRESS",
      },
      {
        engineerId: ctx.ids.abdul,
        projectId: ctx.ids.complex,
        kind: "SITE_VISIT",
        title: "Structural check before 3rd floor slab",
        dueDate: toDbDate(ctx.day(12)),
        status: "NOT_STARTED",
      },
    ],
  });

  await db.dailyReport.create({
    data: {
      projectId: ctx.ids.villa,
      siteId: (await db.site.findFirstOrThrow({ where: { projectId: ctx.ids.villa, isDefault: true } })).id,
      date: toDbDate(ctx.day(-1)),
      weather: "CLOUDY",
      labourPresent: 13,
      engineersPresent: 2,
      workCompleted: "Slab shuttering completed on the east half. Reinforcement checking for the west half.",
      materialsReceived: "None",
      materialsUsed: "40 bags cement, 200 cft M-Sand",
      equipmentUsed: "Concrete mixer (4 hours)",
      issues: "Shuttering sheets for west half still awaited.",
      safetyObservations: "Edge protection fixed on the slab perimeter.",
      submittedById: ctx.ids.manager,
    },
  });
  log("site issues, engineer tasks and a daily report");
}
