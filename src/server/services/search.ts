import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { LABOUR_CATEGORY } from "@/lib/labels";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { accessibleProjectIds } from "@/server/scope";

export type SearchResult = {
  type: "project" | "client" | "engineer" | "work" | "worker" | "material" | "supplier" | "bill" | "quotation";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

/**
 * Forgiving search across the records that have pages: matches parts of
 * words and tolerates small spelling mistakes ("ramesh" finds "Ramesh Kumar",
 * "villa gren" finds "Green Villa") using PostgreSQL trigram similarity.
 */
export async function globalSearch(user: CurrentUser, rawQuery: string): Promise<SearchResult[]> {
  const q = rawQuery.trim().slice(0, 80);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const ids = await accessibleProjectIds(user);
  const projectScope =
    ids === null ? Prisma.empty : ids.length ? Prisma.sql`AND p."id" IN (${Prisma.join(ids)})` : Prisma.sql`AND FALSE`;

  const money = can(user, "quotations.manage") || can(user, "projects.viewMoney");
  const quoteScope =
    ids === null
      ? Prisma.empty
      : ids.length
        ? Prisma.sql`AND (q."projectId" IN (${Prisma.join(ids)}) OR (q."projectId" IS NULL AND q."createdById" = ${user.id}))`
        : Prisma.sql`AND q."projectId" IS NULL AND q."createdById" = ${user.id}`;

  const [projects, clients, engineers, work, workers, materials, suppliers, bills, quotes] = await Promise.all([
    db.$queryRaw<{ id: string; name: string; code: string; city: string | null; client: string }[]>`
      SELECT p."id", p."name", p."code", p."city", c."name" AS client
      FROM "Project" p JOIN "Client" c ON c."id" = p."clientId"
      WHERE p."deletedAt" IS NULL ${projectScope}
        AND (p."name" ILIKE ${like} OR p."code" ILIKE ${like} OR p."city" ILIKE ${like} OR c."name" ILIKE ${like}
             OR word_similarity(${q}, p."name") > 0.35)
      ORDER BY (p."name" ILIKE ${like}) DESC, word_similarity(${q}, p."name") DESC
      LIMIT 6`,
    db.$queryRaw<{ id: string; name: string; phone: string | null; city: string | null }[]>`
      SELECT c."id", c."name", c."phone", c."city"
      FROM "Client" c
      WHERE c."deletedAt" IS NULL
        ${ids === null ? Prisma.empty : Prisma.sql`AND EXISTS (SELECT 1 FROM "Project" p WHERE p."clientId" = c."id" ${projectScope})`}
        AND (c."name" ILIKE ${like} OR c."phone" ILIKE ${like} OR word_similarity(${q}, c."name") > 0.35)
      ORDER BY (c."name" ILIKE ${like}) DESC, word_similarity(${q}, c."name") DESC
      LIMIT 5`,
    db.$queryRaw<{ id: string; name: string; role: string | null; phone: string | null }[]>`
      SELECT e."id", e."name", e."role", e."phone"
      FROM "Engineer" e
      WHERE e."deletedAt" IS NULL
        AND (e."name" ILIKE ${like} OR e."phone" ILIKE ${like} OR word_similarity(${q}, e."name") > 0.35)
      ORDER BY (e."name" ILIKE ${like}) DESC, word_similarity(${q}, e."name") DESC
      LIMIT 5`,
    db.$queryRaw<{ id: string; name: string; projectId: string; project: string }[]>`
      SELECT w."id", w."name", w."projectId", p."name" AS project
      FROM "WorkItem" w JOIN "Project" p ON p."id" = w."projectId"
      WHERE w."deletedAt" IS NULL AND p."deletedAt" IS NULL ${projectScope}
        AND w."name" ILIKE ${like}
      ORDER BY w."updatedAt" DESC
      LIMIT 5`,
    db.$queryRaw<{ id: string; name: string; code: string; phone: string | null; category: keyof typeof LABOUR_CATEGORY }[]>`
      SELECT l."id", l."name", l."code", l."phone", l."category"::text AS category
      FROM "Labour" l
      WHERE l."deletedAt" IS NULL
        AND (l."name" ILIKE ${like} OR l."code" ILIKE ${like} OR l."phone" ILIKE ${like} OR word_similarity(${q}, l."name") > 0.35)
      ORDER BY (l."name" ILIKE ${like}) DESC, word_similarity(${q}, l."name") DESC
      LIMIT 5`,
    db.$queryRaw<{ id: string; name: string; code: string; unit: string }[]>`
      SELECT m."id", m."name", m."code", m."unit"
      FROM "Material" m
      WHERE m."deletedAt" IS NULL
        AND (m."name" ILIKE ${like} OR m."code" ILIKE ${like} OR word_similarity(${q}, m."name") > 0.35)
      ORDER BY (m."name" ILIKE ${like}) DESC, word_similarity(${q}, m."name") DESC
      LIMIT 5`,
    db.$queryRaw<{ id: string; name: string; phone: string | null; city: string | null }[]>`
      SELECT s."id", s."name", s."phone", s."city"
      FROM "Supplier" s
      WHERE s."deletedAt" IS NULL
        AND (s."name" ILIKE ${like} OR s."code" ILIKE ${like} OR s."phone" ILIKE ${like} OR word_similarity(${q}, s."name") > 0.35)
      ORDER BY (s."name" ILIKE ${like}) DESC, word_similarity(${q}, s."name") DESC
      LIMIT 5`,
    money
      ? db.$queryRaw<{ id: string; number: string; raNumber: number | null; project: string }[]>`
          SELECT i."id", i."number", i."raNumber", p."name" AS project
          FROM "Invoice" i JOIN "Project" p ON p."id" = i."projectId"
          WHERE i."number" ILIKE ${like} ${projectScope}
          ORDER BY i."date" DESC
          LIMIT 5`
      : Promise.resolve([]),
    money
      ? db.$queryRaw<{ id: string; number: string; title: string; client: string }[]>`
          SELECT q."id", q."number", q."title", c."name" AS client
          FROM "Quotation" q JOIN "Client" c ON c."id" = q."clientId"
          WHERE q."deletedAt" IS NULL AND (q."number" ILIKE ${like} OR q."title" ILIKE ${like}) ${quoteScope}
          ORDER BY q."date" DESC
          LIMIT 5`
      : Promise.resolve([]),
  ]);

  return [
    ...projects.map((p) => ({
      type: "project" as const,
      id: p.id,
      title: p.name,
      subtitle: [p.code, p.client, p.city].filter(Boolean).join(" · "),
      href: `/projects/${p.id}`,
    })),
    ...clients.map((c) => ({
      type: "client" as const,
      id: c.id,
      title: c.name,
      subtitle: [c.phone, c.city].filter(Boolean).join(" · ") || null,
      href: `/clients/${c.id}`,
    })),
    ...engineers.map((e) => ({
      type: "engineer" as const,
      id: e.id,
      title: e.name,
      subtitle: [e.role, e.phone].filter(Boolean).join(" · ") || null,
      href: `/engineers/${e.id}`,
    })),
    ...work.map((w) => ({
      type: "work" as const,
      id: w.id,
      title: w.name,
      subtitle: w.project,
      href: `/projects/${w.projectId}/work#item-${w.id}`,
    })),
    ...workers.map((l) => ({
      type: "worker" as const,
      id: l.id,
      title: l.name,
      subtitle: [l.code, LABOUR_CATEGORY[l.category], l.phone].filter(Boolean).join(" · "),
      href: `/labour/${l.id}`,
    })),
    ...materials.map((m) => ({ type: "material" as const, id: m.id, title: m.name, subtitle: `${m.code} · per ${m.unit}`, href: `/materials/${m.id}` })),
    ...suppliers.map((s) => ({
      type: "supplier" as const,
      id: s.id,
      title: s.name,
      subtitle: [s.phone, s.city].filter(Boolean).join(" · ") || null,
      href: `/materials/suppliers/${s.id}`,
    })),
    ...bills.map((b) => ({
      type: "bill" as const,
      id: b.id,
      title: `${b.number}${b.raNumber ? ` · RA-${b.raNumber}` : ""}`,
      subtitle: b.project,
      href: `/clients/bills/${b.id}`,
    })),
    ...quotes.map((qt) => ({ type: "quotation" as const, id: qt.id, title: `${qt.number} · ${qt.title}`, subtitle: qt.client, href: `/clients/quotations/${qt.id}` })),
  ];
}
