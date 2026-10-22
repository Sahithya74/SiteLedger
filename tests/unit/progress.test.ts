import { describe, expect, it } from "vitest";
import {
  createsDependencyCycle,
  effectivePercent,
  normalizeWorkUpdate,
  isOverdue,
  leafItems,
  overallProgress,
  phaseProgress,
  plannedProgress,
  scheduleHealth,
  type ProgressItem,
} from "@/lib/progress";

function item(partial: Partial<ProgressItem> & { id: string }): ProgressItem {
  return {
    parentId: null,
    status: "IN_PROGRESS",
    percentComplete: 0,
    estimatedCostPaise: 0n,
    ...partial,
  };
}

const breakdown: ProgressItem[] = [
  item({ id: "foundation" }),
  item({ id: "excavation", parentId: "foundation", status: "COMPLETED", percentComplete: 80, estimatedCostPaise: 100n }),
  item({ id: "footing", parentId: "foundation", percentComplete: 50, estimatedCostPaise: 300n }),
  item({ id: "structure" }),
  item({ id: "slab", parentId: "structure", percentComplete: 0, estimatedCostPaise: 600n }),
];

describe("progress roll-up", () => {
  it("treats completed items as 100% whatever was typed", () => {
    expect(effectivePercent({ status: "COMPLETED", percentComplete: 10 })).toBe(100);
    expect(effectivePercent({ status: "IN_PROGRESS", percentComplete: 140 })).toBe(100);
  });

  it("measures only leaves", () => {
    expect(leafItems(breakdown).map((i) => i.id)).toEqual(["excavation", "footing", "slab"]);
  });

  it("weights by estimated cost when every leaf has one", () => {
    // (100×100 + 50×300 + 0×600) / 1000 = 25
    expect(overallProgress(breakdown)).toBe(25);
  });

  it("falls back to equal weights when some costs are missing", () => {
    const items = breakdown.map((i) => (i.id === "slab" ? { ...i, estimatedCostPaise: 0n } : i));
    // (100 + 50 + 0) / 3 = 50
    expect(overallProgress(items)).toBe(50);
  });

  it("rolls up each phase", () => {
    const phases = phaseProgress(breakdown);
    expect(phases.get("foundation")).toBe(63); // (100×100 + 50×300)/400 = 62.5 → 63
    expect(phases.get("structure")).toBe(0);
  });

  it("returns 0 for an empty breakdown", () => {
    expect(overallProgress([])).toBe(0);
  });
});

describe("schedule", () => {
  const scheduled: ProgressItem[] = [
    item({ id: "a", startDate: "2026-10-01", expectedEndDate: "2026-10-11", percentComplete: 20 }),
  ];

  it("computes planned progress on a straight line", () => {
    expect(plannedProgress(scheduled, "2026-09-30")).toBe(0);
    expect(plannedProgress(scheduled, "2026-10-06")).toBe(50);
    expect(plannedProgress(scheduled, "2026-10-20")).toBe(100);
    expect(plannedProgress([item({ id: "x" })], "2026-10-06")).toBeNull();
  });

  it("flags work that is behind plan", () => {
    const health = scheduleHealth(scheduled, "2026-10-06");
    expect(health.gap).toBe(30);
    expect(health.state).toBe("behind");
    expect(scheduleHealth([{ ...scheduled[0], percentComplete: 48 }], "2026-10-06").state).toBe("on_track");
  });

  it("detects overdue work", () => {
    expect(isOverdue({ status: "IN_PROGRESS", expectedEndDate: "2026-10-20" }, "2026-10-21")).toBe(true);
    expect(isOverdue({ status: "COMPLETED", expectedEndDate: "2026-10-20" }, "2026-10-21")).toBe(false);
    expect(isOverdue({ status: "IN_PROGRESS", expectedEndDate: "2026-10-21" }, "2026-10-21")).toBe(false);
    expect(isOverdue({ status: "IN_PROGRESS", expectedEndDate: null }, "2026-10-21")).toBe(false);
  });
});

describe("normalizeWorkUpdate", () => {
  const today = "2026-10-21";
  it("marks 100% as completed with today's date", () => {
    expect(normalizeWorkUpdate({ status: "IN_PROGRESS", percentComplete: 100, actualEndDate: null }, today)).toEqual({
      status: "COMPLETED",
      percentComplete: 100,
      actualEndDate: today,
    });
  });
  it("keeps an existing completion date", () => {
    expect(normalizeWorkUpdate({ status: "COMPLETED", percentComplete: 40, actualEndDate: "2026-10-01" }, today)).toEqual({
      status: "COMPLETED",
      percentComplete: 100,
      actualEndDate: "2026-10-01",
    });
  });
  it("starts work that has progress and clears completion date when reopened", () => {
    expect(normalizeWorkUpdate({ status: "NOT_STARTED", percentComplete: 10, actualEndDate: "2026-10-01" }, today)).toEqual({
      status: "IN_PROGRESS",
      percentComplete: 10,
      actualEndDate: null,
    });
  });
  it("leaves on-hold work alone even at 100%", () => {
    expect(normalizeWorkUpdate({ status: "ON_HOLD", percentComplete: 100, actualEndDate: null }, today).status).toBe("ON_HOLD");
  });
});

describe("createsDependencyCycle", () => {
  const edges = new Map([
    ["footing", ["pcc"]],
    ["pcc", ["excavation"]],
  ]);
  it("allows a normal chain", () => {
    expect(createsDependencyCycle(edges, "concrete", ["footing"])).toBe(false);
  });
  it("detects direct and indirect loops", () => {
    expect(createsDependencyCycle(edges, "excavation", ["footing"])).toBe(true);
    expect(createsDependencyCycle(edges, "footing", ["footing"])).toBe(true);
  });
});
