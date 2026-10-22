import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_PERMISSIONS,
  can,
  GRANTABLE_PERMISSIONS,
  PERMISSION_PRESETS,
  sanitizeManagerPermissions,
} from "@/lib/permissions";
import { calculateDailyWage, workerBalance } from "@/lib/wages";

describe("calculateDailyWage", () => {
  const rates = { dailyWagePaise: 800_00n, overtimeRatePaise: 125_00n };

  it("pays a full day, half day or nothing", () => {
    expect(calculateDailyWage({ ...rates, status: "PRESENT", overtimeHours: 0 })).toBe(800_00n);
    expect(calculateDailyWage({ ...rates, status: "HALF_DAY", overtimeHours: 0 })).toBe(400_00n);
    expect(calculateDailyWage({ ...rates, status: "ABSENT", overtimeHours: 3 })).toBe(0n);
  });

  it("adds overtime hours", () => {
    expect(calculateDailyWage({ ...rates, status: "PRESENT", overtimeHours: "2.5" })).toBe(800_00n + 312_50n);
  });

  it("rounds an odd half-day to the paisa", () => {
    expect(calculateDailyWage({ dailyWagePaise: 75_05n, overtimeRatePaise: 0n, status: "HALF_DAY", overtimeHours: 0 })).toBe(
      37_53n,
    );
  });
});

describe("workerBalance", () => {
  it("shows wages pending", () => {
    expect(workerBalance({ earnedPaise: 5000_00n, wagesPaidPaise: 3000_00n, advancesPaise: 500_00n })).toEqual({
      balancePaise: 1500_00n,
      pendingWagesPaise: 1500_00n,
      advanceOutstandingPaise: 0n,
    });
  });
  it("shows an advance not yet recovered", () => {
    expect(workerBalance({ earnedPaise: 1000_00n, wagesPaidPaise: 0n, advancesPaise: 3000_00n }).advanceOutstandingPaise).toBe(
      2000_00n,
    );
  });
});

describe("permissions", () => {
  const manager = (permissions: string[]) => ({ role: "MANAGER" as const, permissions });

  it("gives the owner everything", () => {
    expect(can({ role: "ADMIN", permissions: [] }, "users.manage")).toBe(true);
    expect(can({ role: "ADMIN", permissions: [] }, "finance.reverse")).toBe(true);
  });

  it("gives a manager only what was granted", () => {
    expect(can(manager(["work.manage"]), "work.manage")).toBe(true);
    expect(can(manager(["work.manage"]), "clients.manage")).toBe(false);
    expect(can(null, "work.manage")).toBe(false);
  });

  it("never gives a manager admin-only permissions, even if stored", () => {
    for (const key of ADMIN_ONLY_PERMISSIONS) {
      expect(can(manager([key]), key)).toBe(false);
    }
  });

  it("keeps the required owner-only actions out of reach", () => {
    for (const key of ["users.manage", "settings.manage", "finance.reverse", "bank.manage", "projects.delete"] as const) {
      expect(ADMIN_ONLY_PERMISSIONS).toContain(key);
      expect(GRANTABLE_PERMISSIONS).not.toContain(key);
    }
  });

  it("strips unknown and admin-only keys when saving", () => {
    expect(sanitizeManagerPermissions(["work.manage", "users.manage", "made.up", "work.manage"])).toEqual(["work.manage"]);
  });

  it("presets only contain grantable permissions", () => {
    for (const preset of Object.values(PERMISSION_PRESETS)) {
      for (const key of preset.permissions) expect(GRANTABLE_PERMISSIONS).toContain(key);
    }
  });
});
