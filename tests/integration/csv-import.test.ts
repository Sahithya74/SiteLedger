import { describe, expect, it } from "vitest";
import { importTemplate, previewImport, runImport } from "@/server/services/csv-import";
import { db } from "@/server/db";
import { makeUser } from "./helpers";

const header = "Name *,Phone,Type of work *,Daily wage *,Overtime rate per hour,Address,Emergency contact,UPI ID,Joined on,Notes";

describe("CSV import", () => {
  it("gives a template with headings and an example row", () => {
    const csv = importTemplate("workers");
    expect(csv.startsWith("﻿Name *,Phone,Type of work *")).toBe(true);
    expect(csv).toContain("Murugan S");
  });

  it("reports every bad row and imports nothing until all are fixed", async () => {
    const owner = await makeUser("ADMIN");
    const bad = [header, "Ravi K,9876543210,Mason,900,120,,,,01-04-2026,", "Selvi,,Dancer,800,,,,,,", ",,Helper,,,,,,,"].join("\r\n");
    const preview = await previewImport(owner, "workers", bad);
    expect(preview.total).toBe(3);
    expect(preview.problems.map((p) => p.line)).toEqual([3, 4]);
    expect(preview.problems[0].errors.join(" ")).toMatch(/Type of work "Dancer" is not known/);
    await expect(runImport(owner, "workers", bad)).rejects.toThrow(/nothing was imported/);
    expect(await db.labour.count()).toBe(0);

    const good = [header, "Ravi K,9876543210,Mason,900,120,,,,01-04-2026,", "Selvi,,helper,\"1,050\",,,,,,"].join("\r\n");
    expect(await runImport(owner, "workers", good)).toBe(2);
    const selvi = await db.labour.findFirstOrThrow({ where: { name: "Selvi" } });
    expect(selvi.category).toBe("HELPER");
    expect(selvi.dailyWagePaise).toBe(105000n);
    const ravi = await db.labour.findFirstOrThrow({ where: { name: "Ravi K" } });
    expect(ravi.joinedOn?.toISOString().slice(0, 10)).toBe("2026-04-01");

    // Same file again: every row is now a duplicate.
    const again = await previewImport(owner, "workers", good);
    expect(again.problems).toHaveLength(2);
    expect(again.problems[0].errors[0]).toMatch(/already exists/);
  });

  it("matches material categories by name and supplier types by label", async () => {
    const owner = await makeUser("ADMIN");
    await db.materialCategory.create({ data: { name: "Cement", kind: "CEMENT" } });
    const materials = ["Name *,Category *,Unit *,Reorder level,Usual rate", "OPC 53,cement,bag,50,420", "M Sand,Sand,cft,,"].join("\n");
    const preview = await previewImport(owner, "materials", materials);
    expect(preview.problems).toHaveLength(1);
    expect(preview.problems[0].errors[0]).toMatch(/Category "Sand" does not exist/);

    const suppliers = ["Business name *,Supplies (comma separated),Phone,City", "Sri Murugan Hardwares,\"Hardware, Paint\",9840012345,Chennai"].join("\n");
    expect(await runImport(owner, "suppliers", suppliers)).toBe(1);
    expect((await db.supplier.findFirstOrThrow()).categories).toEqual(["HARDWARE", "PAINT"]);
  });

  it("refuses people without permission", async () => {
    const manager = await makeUser("MANAGER", { permissions: [] });
    await expect(previewImport(manager, "workers", `${header}\nA,,Mason,900,,,,,,`)).rejects.toThrow(/permission/);
  });
});
