import { describe, expect, it } from "vitest";
import { addDays, todayIST, toDbDate } from "@/lib/dates";
import { db } from "@/server/db";
import { getAttentionItems } from "@/server/services/alerts";
import { addStandardStages, listPendingWork, updateWorkItem, updateWorkProgress } from "@/server/services/work";
import { makeProject, makeUser } from "./helpers";

async function item(projectId: string, name: string) {
  return db.workItem.findFirstOrThrow({ where: { projectId, name } });
}

describe("work breakdown", () => {
  it("adds the standard stages once, with 'must finish first' links", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId } = await makeProject(owner);
    const first = await addStandardStages(owner, projectId);
    expect(first.added).toBeGreaterThan(20);
    const again = await addStandardStages(owner, projectId);
    expect(again.added).toBe(0);
    const pcc = await item(projectId, "PCC");
    const deps = await db.workItemDependency.findMany({ where: { workItemId: pcc.id }, include: { dependsOn: true } });
    expect(deps.map((d) => d.dependsOn.name)).toEqual(["Excavation"]);
  });

  it("refuses a dependency loop", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId } = await makeProject(owner);
    await addStandardStages(owner, projectId);
    const excavation = await item(projectId, "Excavation");
    const footing = await item(projectId, "Footing");
    await expect(
      updateWorkItem(owner, excavation.id, {
        name: "Excavation",
        description: null,
        parentId: excavation.parentId,
        siteId: null,
        status: "NOT_STARTED",
        priority: "MEDIUM",
        percentComplete: 0,
        engineerId: null,
        team: null,
        startDate: null,
        expectedEndDate: null,
        actualEndDate: null,
        estimatedCostPaise: 0n,
        actualCostPaise: 0n,
        pendingReason: null,
        notes: null,
        dependsOnIds: [footing.id], // footing → PCC → excavation → footing
      }),
    ).rejects.toThrow(/loop/);
  });

  it("marks 100% as completed and warns when starting before prerequisites finish", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId } = await makeProject(owner);
    await addStandardStages(owner, projectId);
    const pcc = await item(projectId, "PCC");
    const result = await updateWorkProgress(owner, pcc.id, { status: "IN_PROGRESS", percentComplete: 100, pendingReason: null });
    const after = await db.workItem.findUniqueOrThrow({ where: { id: pcc.id } });
    expect(after.status).toBe("COMPLETED");
    expect(after.actualEndDate).not.toBeNull();
    expect(result.warning).toMatch(/Excavation is not finished/);
  });

  it("lists overdue work first and raises an alert for it", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId } = await makeProject(owner);
    await addStandardStages(owner, projectId);
    const slab = await item(projectId, "Slab");
    await db.workItem.update({
      where: { id: slab.id },
      data: { status: "IN_PROGRESS", percentComplete: 60, priority: "HIGH", expectedEndDate: toDbDate(addDays(todayIST(), -3)) },
    });
    const pending = await listPendingWork(owner);
    expect(pending[0].name).toBe("Slab");
    expect(pending[0].overdue).toBe(true);
    expect(pending[0].daysRemaining).toBe(-3);

    const alerts = await getAttentionItems(owner);
    const slabAlert = alerts.find((a) => a.key === `work:${slab.id}`);
    expect(slabAlert?.severity).toBe("CRITICAL");
    expect(slabAlert?.title).toContain("delayed by 3 days");
  });
});
