import type { LabourCategory } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { createEngineer } from "@/server/services/engineers";
import { nextCode } from "@/server/services/sequence";
import { createManager } from "@/server/services/users";
import { log, rupees, type SeedContext } from "./context";

export async function seedManager(ctx: SeedContext, projectIds: string[]) {
  const username = process.env.SEED_MANAGER_USERNAME ?? "manager";
  const password = process.env.SEED_MANAGER_PASSWORD ?? "Site@2026";
  const { id } = await createManager(ctx.owner, {
    name: "Suresh Babu",
    username,
    phone: "9876501234",
    password,
    preset: "SITE_MANAGER",
  });
  // Demo convenience: skip the first-login password change.
  await db.user.update({ where: { id }, data: { mustChangePassword: false } });
  await db.projectAssignment.createMany({ data: projectIds.map((projectId) => ({ userId: id, projectId })) });
  ctx.ids.manager = id;
  log(`manager login: ${username} / ${password} (Site Manager permissions, ${projectIds.length} projects)`);
}

export async function seedEngineers(ctx: SeedContext) {
  const engineers = [
    {
      key: "karthik",
      name: "Karthik Raman",
      phone: "9840011223",
      role: "Site Engineer",
      qualification: "B.E. Civil",
      payFrequency: "MONTHLY" as const,
      salaryPaise: rupees(45_000),
      dailyWagePaise: 0n,
      joiningDate: ctx.day(-400),
      projects: ["villa"],
      responsibilities: "Day-to-day site supervision, quality checks, daily report.",
    },
    {
      key: "priya",
      name: "Priya Shankar",
      phone: "9940055667",
      role: "Project Engineer",
      qualification: "M.E. Structural",
      payFrequency: "MONTHLY" as const,
      salaryPaise: rupees(52_000),
      dailyWagePaise: 0n,
      joiningDate: ctx.day(-700),
      projects: ["complex"],
      responsibilities: "Structural work, bar bending schedules, client coordination.",
    },
    {
      key: "venkatesh",
      name: "Venkatesh Murthy",
      phone: "9790088991",
      role: "Supervisor",
      qualification: "Diploma Civil",
      payFrequency: "DAILY" as const,
      salaryPaise: 0n,
      dailyWagePaise: rupees(1_200),
      joiningDate: ctx.day(-250),
      projects: ["villa", "complex"],
      responsibilities: "Labour supervision and material checks.",
    },
    {
      key: "abdul",
      name: "Abdul Rahman",
      phone: "9884433221",
      role: "Structural Consultant",
      qualification: "M.Tech Structures",
      payFrequency: "MONTHLY" as const,
      salaryPaise: 0n,
      dailyWagePaise: 0n,
      joiningDate: ctx.day(-200),
      projects: ["complex"],
      responsibilities: "Structural design checks and inspections (paid per visit).",
    },
  ];
  for (const e of engineers) {
    const { id } = await createEngineer(ctx.owner, {
      name: e.name,
      phone: e.phone,
      altPhone: null,
      email: null,
      qualification: e.qualification,
      role: e.role,
      joiningDate: e.joiningDate,
      payFrequency: e.payFrequency,
      salaryPaise: e.salaryPaise,
      dailyWagePaise: e.dailyWagePaise,
      responsibilities: e.responsibilities,
      notes: "Demo data",
      projectIds: e.projects.map((p) => ctx.ids[p]).filter(Boolean),
    });
    ctx.ids[e.key] = id;
  }
  log(`${engineers.length} engineers`);
}

type WorkerSpec = [name: string, category: LabourCategory, wage: number, project: "villa" | "complex"];

const WORKERS: WorkerSpec[] = [
  ["Murugan K", "MASON", 1100, "villa"],
  ["Selvam P", "MASON", 1050, "villa"],
  ["Raju M", "MASON", 1000, "villa"],
  ["Kannan S", "HELPER", 700, "villa"],
  ["Lakshmi R", "HELPER", 650, "villa"],
  ["Ganesan V", "HELPER", 700, "villa"],
  ["Meena D", "HELPER", 650, "villa"],
  ["Prakash T", "CARPENTER", 950, "villa"],
  ["Anand J", "STEEL_WORKER", 900, "villa"],
  ["Ravi C", "STEEL_WORKER", 900, "villa"],
  ["Kumar N", "ELECTRICIAN", 1000, "villa"],
  ["Saravanan L", "PLUMBER", 950, "villa"],
  ["Devi A", "HELPER", 650, "villa"],
  ["Mani B", "MACHINE_OPERATOR", 1100, "villa"],
  ["Rajesh Yadav", "MASON", 1050, "complex"],
  ["Sunil Kumar", "MASON", 1050, "complex"],
  ["Mohan Lal", "MASON", 1000, "complex"],
  ["Basavaraj H", "HELPER", 700, "complex"],
  ["Shanthi G", "HELPER", 650, "complex"],
  ["Imran Khan", "STEEL_WORKER", 950, "complex"],
  ["Arjun P", "STEEL_WORKER", 900, "complex"],
  ["Ramesh Gowda", "CARPENTER", 1000, "complex"],
  ["Vijay S", "HELPER", 700, "complex"],
  ["Ponni M", "HELPER", 650, "complex"],
  ["Dinesh R", "TILE_WORKER", 1000, "complex"],
];

export async function seedLabour(ctx: SeedContext): Promise<{ villa: string[]; complex: string[] }> {
  const contractor = await db.$transaction(async (tx) =>
    tx.labourContractor.create({
      data: {
        code: await nextCode(tx, "contractor"),
        name: "Murugesan (mestri)",
        phone: "9789012345",
        trade: "MASON",
        notes: "Demo data — supplies the mason gang for plastering and brickwork.",
      },
    }),
  );
  ctx.ids.contractor = contractor.id;

  const result = { villa: [] as string[], complex: [] as string[] };
  for (const [name, category, wage, project] of WORKERS) {
    const worker = await db.$transaction(async (tx) =>
      tx.labour.create({
        data: {
          code: await nextCode(tx, "labour"),
          name,
          category,
          dailyWagePaise: rupees(wage),
          overtimeRatePaise: rupees(Math.round(wage / 8 / 10) * 10 * 1.5),
          phone: `9${String(Math.floor(ctx.rand() * 1e9)).padStart(9, "0")}`,
          joinedOn: new Date(`${ctx.day(-90)}T00:00:00.000Z`),
          contractorId: category === "MASON" && project === "complex" ? contractor.id : null,
          notes: "Demo data",
        },
      }),
    );
    result[project].push(worker.id);
  }
  log(`${WORKERS.length} workers and 1 labour contractor`);
  return result;
}
