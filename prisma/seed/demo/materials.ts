import type { SupplierCategory } from "@/generated/prisma/enums";
import { toDbDate } from "@/lib/dates";
import { db } from "@/server/db";
import { recordPurchase } from "@/server/services/purchases";
import { nextCode } from "@/server/services/sequence";
import { recordMaterialUsage } from "@/server/services/stock";
import { log, rupees, type SeedContext } from "./context";

type SupplierSpec = {
  key: string;
  name: string;
  categories: SupplierCategory[];
  contact: string;
  phone: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  materials: string;
  terms: string;
  creditDays: number;
  rating: number;
};

// Demo directory entries (clearly marked as demo data in their notes).
const SUPPLIERS: SupplierSpec[] = [
  { key: "hardware", name: "Sri Murugan Hardwares", categories: ["HARDWARE", "PLUMBING", "ELECTRICAL"], contact: "Mr. Senthil", phone: "9841100221", city: "Chennai", address: "Medavakkam Main Road", lat: 12.9172, lng: 80.1891, materials: "Binding wire, nails, PVC pipes, electrical conduits", terms: "Monthly credit", creditDays: 30, rating: 4 },
  { key: "cementChennai", name: "Balaji Cement Agencies", categories: ["CEMENT"], contact: "Mr. Balaji", phone: "9840223344", city: "Chennai", address: "Velachery Bypass Road", lat: 12.9758, lng: 80.2205, materials: "UltraTech, Ramco, Dalmia cement", terms: "50% advance, balance on delivery", creditDays: 7, rating: 5 },
  { key: "steelChennai", name: "Kaveri Steels", categories: ["STEEL"], contact: "Mr. Prabhu", phone: "9884455661", city: "Chennai", address: "GST Road, Tambaram", lat: 12.9249, lng: 80.1275, materials: "TMT bars 8–25 mm (ARS, Kamachi)", terms: "15 days credit", creditDays: 15, rating: 4 },
  { key: "sand", name: "Ganga M-Sand & Aggregates", categories: ["SAND", "STONE"], contact: "Mr. Kumar", phone: "9790011223", city: "Chennai", address: "Ottiyambakkam", lat: 12.8919, lng: 80.2206, materials: "M-Sand, P-Sand, 20mm & 40mm jelly", terms: "Cash on delivery", creditDays: 0, rating: 3 },
  { key: "granite", name: "Royal Granites", categories: ["GRANITE", "TILES"], contact: "Mr. Faizal", phone: "9445566778", city: "Chennai", address: "Pallikaranai", lat: 12.9372, lng: 80.2128, materials: "Black Galaxy, Tan Brown, Kashmir White granite; vitrified tiles", terms: "Advance on order", creditDays: 0, rating: 4 },
  { key: "transport", name: "Annai Lorry Service", categories: ["TRANSPORT"], contact: "Mr. Raja", phone: "9677788990", city: "Chennai", address: "Perumbakkam", lat: 12.9009, lng: 80.2033, materials: "Tipper lorries, tractor trips", terms: "Per trip, cash", creditDays: 0, rating: 4 },
  { key: "cementCbe", name: "Kongu Building Materials", categories: ["CEMENT", "SAND", "STONE"], contact: "Mr. Palanisamy", phone: "9443322110", city: "Coimbatore", address: "Sathy Road, Saravanampatti", lat: 11.0771, lng: 76.9946, materials: "Cement, M-Sand, jelly, solid blocks", terms: "30 days credit", creditDays: 30, rating: 4 },
  { key: "steelCbe", name: "Coimbatore TMT Traders", categories: ["STEEL"], contact: "Mr. Arumugam", phone: "9443211009", city: "Coimbatore", address: "Ganapathy", lat: 11.0346, lng: 76.9787, materials: "TMT bars, binding wire", terms: "15 days credit", creditDays: 15, rating: 5 },
];

type MaterialSpec = { key: string; name: string; category: string; unit: string; reorder: number; rate: number; specs?: Record<string, string | number> };

const MATERIALS: MaterialSpec[] = [
  { key: "msand", name: "M-Sand", category: "Aggregates (sand, jelly, metal)", unit: "cft", reorder: 300, rate: 58, specs: { type: "Manufactured sand" } },
  { key: "psand", name: "P-Sand (plastering)", category: "Aggregates (sand, jelly, metal)", unit: "cft", reorder: 200, rate: 68 },
  { key: "jelly20", name: "20mm Jelly (blue metal)", category: "Aggregates (sand, jelly, metal)", unit: "cft", reorder: 300, rate: 48, specs: { sizeMm: 20 } },
  { key: "cementOpc", name: "Cement – UltraTech OPC 53", category: "Cement", unit: "bag", reorder: 100, rate: 395, specs: { brand: "UltraTech", grade: "OPC 53" } },
  { key: "cementPpc", name: "Cement – Ramco PPC", category: "Cement", unit: "bag", reorder: 80, rate: 370, specs: { brand: "Ramco", grade: "PPC" } },
  { key: "tmt8", name: "TMT bar 8mm", category: "Steel", unit: "kg", reorder: 500, rate: 66, specs: { diameterMm: 8 } },
  { key: "tmt12", name: "TMT bar 12mm", category: "Steel", unit: "kg", reorder: 1000, rate: 64, specs: { diameterMm: 12 } },
  { key: "tmt16", name: "TMT bar 16mm", category: "Steel", unit: "kg", reorder: 800, rate: 63, specs: { diameterMm: 16 } },
  { key: "bricks", name: "Red bricks (chamber)", category: "Bricks & blocks", unit: "nos", reorder: 3000, rate: 9.5 },
  { key: "blocks", name: "Solid block 6 inch", category: "Bricks & blocks", unit: "nos", reorder: 500, rate: 42 },
  { key: "granite", name: "Granite – Black Galaxy 18mm", category: "Stone & granite", unit: "sqft", reorder: 0, rate: 210, specs: { colour: "Black", thicknessMm: 18 } },
  { key: "tiles", name: "Vitrified tiles 2x2 ft (Kajaria)", category: "Tiles", unit: "box", reorder: 0, rate: 720, specs: { brand: "Kajaria", size: "600x600", finish: "Glossy" } },
];

export async function seedSuppliersAndMaterials(ctx: SeedContext) {
  for (const s of SUPPLIERS) {
    const supplier = await db.$transaction(async (tx) =>
      tx.supplier.create({
        data: {
          code: await nextCode(tx, "supplier"),
          name: s.name,
          categories: s.categories,
          contactPerson: s.contact,
          phone: s.phone,
          address: s.address,
          city: s.city,
          latitude: s.lat,
          longitude: s.lng,
          materialsSupplied: s.materials,
          paymentTerms: s.terms,
          creditDays: s.creditDays,
          rating: s.rating,
          notes: "Demo supplier (not a real business record)",
        },
      }),
    );
    ctx.ids[`sup:${s.key}`] = supplier.id;
  }
  const categories = await db.materialCategory.findMany();
  for (const m of MATERIALS) {
    const category = categories.find((c) => c.name === m.category);
    if (!category) throw new Error(`Seed: material category ${m.category} missing`);
    const material = await db.$transaction(async (tx) =>
      tx.material.create({
        data: {
          code: await nextCode(tx, "material"),
          name: m.name,
          categoryId: category.id,
          unit: m.unit,
          reorderLevel: String(m.reorder),
          defaultRatePaise: rupees(m.rate),
          specs: m.specs,
        },
      }),
    );
    ctx.ids[`mat:${m.key}`] = material.id;
  }
  log(`${SUPPLIERS.length} suppliers and ${MATERIALS.length} materials`);
}

const rate = (key: string) => rupees(MATERIALS.find((m) => m.key === key)!.rate);

/** Purchases (with deliveries into stock) and site usage, leaving a few items low on purpose. */
export async function seedPurchasesAndUsage(ctx: SeedContext) {
  const p = (args: {
    supplier: string;
    project: string | null;
    daysAgo: number;
    items: [string, number][];
    received?: boolean;
    expectedIn?: number;
    dueIn?: number;
    transport?: number;
    gst?: number;
    invoice?: string;
  }) =>
    recordPurchase(ctx.owner, {
      supplierId: ctx.ids[`sup:${args.supplier}`],
      projectId: args.project ? ctx.ids[args.project] : null,
      purchaseDate: ctx.day(-args.daysAgo),
      expectedDelivery: args.expectedIn !== undefined ? ctx.day(args.expectedIn) : null,
      dueDate: args.dueIn !== undefined ? ctx.day(args.dueIn) : null,
      invoiceNumber: args.invoice ?? null,
      transportPaise: args.transport ? rupees(args.transport) : 0n,
      receivedOn: args.received === false ? null : ctx.day(-args.daysAgo),
      items: args.items.map(([key, quantity]) => ({
        materialId: ctx.ids[`mat:${key}`],
        quantity: String(quantity),
        ratePaise: rate(key),
        taxPercent: String(args.gst ?? 0),
      })),
    });

  // Green Valley Villa
  const villaBuys = [
    await p({ supplier: "cementChennai", project: "villa", daysAgo: 110, items: [["cementOpc", 300]], gst: 28, invoice: "BCA/2241" }),
    await p({ supplier: "sand", project: "villa", daysAgo: 108, items: [["msand", 800], ["jelly20", 900]], transport: 6000 }),
    await p({ supplier: "steelChennai", project: "villa", daysAgo: 100, items: [["tmt8", 1800], ["tmt12", 3200], ["tmt16", 2400]], gst: 18, invoice: "KS-889" }),
    await p({ supplier: "cementChennai", project: "villa", daysAgo: 60, items: [["cementOpc", 300]], gst: 28, invoice: "BCA/2390" }),
    await p({ supplier: "sand", project: "villa", daysAgo: 30, items: [["msand", 400]], transport: 3000 }),
    await p({ supplier: "hardware", project: "villa", daysAgo: 25, items: [["bricks", 4000]], transport: 2500 }),
  ];
  // Ordered M-Sand arriving tomorrow (not yet delivered).
  await p({ supplier: "sand", project: "villa", daysAgo: 1, items: [["msand", 600]], received: false, expectedIn: 1, transport: 3000 });

  // Lakshmi Commercial Complex
  const complexBuys = [
    await p({ supplier: "cementCbe", project: "complex", daysAgo: 190, items: [["cementPpc", 900], ["msand", 2500], ["jelly20", 3000]], gst: 28, invoice: "KBM-1102" }),
    await p({ supplier: "steelCbe", project: "complex", daysAgo: 170, items: [["tmt8", 5000], ["tmt12", 8000], ["tmt16", 9000]], gst: 18, invoice: "CTT-561" }),
    await p({ supplier: "cementCbe", project: "complex", daysAgo: 90, items: [["cementPpc", 700], ["msand", 1500]], gst: 28, invoice: "KBM-1240" }),
    await p({ supplier: "cementCbe", project: "complex", daysAgo: 40, items: [["bricks", 12000]], transport: 9000 }),
  ];
  // Steel bought two weeks ago, payment due tomorrow and not yet paid.
  const steelDue = await p({ supplier: "steelCbe", project: "complex", daysAgo: 14, items: [["tmt12", 4000], ["tmt16", 3000]], gst: 18, dueIn: 1, invoice: "CTT-604" });

  // Renovation (finished)
  const renovationBuys = [
    await p({ supplier: "granite", project: "renovation", daysAgo: 120, items: [["granite", 180], ["tiles", 95]], gst: 18, invoice: "RG-310" }),
    await p({ supplier: "cementChennai", project: "renovation", daysAgo: 140, items: [["cementPpc", 60]], gst: 28 }),
  ];

  // Usage — leaves villa cement low, villa M-Sand out, complex 12mm steel low.
  const consume = (project: string, key: string, quantity: number, daysAgo: number) =>
    recordMaterialUsage(ctx.owner, {
      date: ctx.day(-daysAgo),
      materialId: ctx.ids[`mat:${key}`],
      projectId: ctx.ids[project],
      quantity: String(quantity),
      confirmShortage: true,
    });
  for (const [key, qty, ago] of [
    ["cementOpc", 260, 90], ["cementOpc", 300, 20], ["msand", 800, 80], ["msand", 400, 3], ["jelly20", 820, 80],
    ["tmt8", 1200, 70], ["tmt12", 2000, 70], ["tmt16", 1500, 60], ["bricks", 600, 2],
  ] as [string, number, number][]) {
    await consume("villa", key, qty, ago);
  }
  for (const [key, qty, ago] of [
    ["cementPpc", 1450, 60], ["msand", 3600, 60], ["jelly20", 2500, 100], ["tmt8", 4200, 90],
    ["tmt12", 7500, 50], ["tmt12", 4200, 7], ["tmt16", 8200, 50], ["bricks", 7000, 5],
  ] as [string, number, number][]) {
    await consume("complex", key, qty, ago);
  }
  for (const [key, qty] of [["granite", 180], ["tiles", 95], ["cementPpc", 60]] as [string, number][]) {
    await consume("renovation", key, qty, 100);
  }

  await db.$transaction(async (tx) => {
    await tx.materialRequest.create({
      data: {
        number: await nextCode(tx, "materialRequest"),
        projectId: ctx.ids.villa,
        requestedOn: toDbDate(ctx.today),
        neededBy: toDbDate(ctx.day(4)),
        priority: "HIGH",
        notes: "For the west half of the first-floor slab",
        requestedById: ctx.ids.manager,
        items: {
          create: [
            { materialId: ctx.ids["mat:jelly20"], quantity: "600" },
            { materialId: ctx.ids["mat:cementOpc"], quantity: "150" },
          ],
        },
      },
    });
  });

  log("purchases, deliveries, material usage and a material request");
  return { villaBuys, complexBuys, renovationBuys, steelDue };
}
