import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  describeDue,
  diffDays,
  endOfMonth,
  financialYear,
  formatDate,
  formatDateLong,
  isISODate,
  todayIST,
  wageWeek,
} from "@/lib/dates";

describe("todayIST", () => {
  it("uses India time, not UTC", () => {
    // 20 Oct 2026 20:00 UTC is already 21 Oct 01:30 in India
    expect(todayIST(new Date("2026-10-20T20:00:00Z"))).toBe("2026-10-21");
    // 21 Oct 2026 18:29 UTC is 23:59 in India — still the 21st
    expect(todayIST(new Date("2026-10-21T18:29:00Z"))).toBe("2026-10-21");
  });
});

describe("calendar arithmetic", () => {
  it("adds days across months and leap years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("adds months, clamping to month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-21", -6)).toBe("2026-04-21");
  });
  it("counts days between dates", () => {
    expect(diffDays("2026-10-24", "2026-10-21")).toBe(3);
    expect(diffDays("2026-10-18", "2026-10-21")).toBe(-3);
  });
  it("finds month end", () => {
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2026-12-05")).toBe("2026-12-31");
  });
  it("validates ISO dates", () => {
    expect(isISODate("2026-10-21")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("21-10-2026")).toBe(false);
  });
});

describe("financialYear", () => {
  it("runs April to March", () => {
    expect(financialYear("2026-10-21")).toEqual({ label: "2026-27", start: "2026-04-01", end: "2027-03-31" });
    expect(financialYear("2027-03-31").label).toBe("2026-27");
    expect(financialYear("2027-04-01").label).toBe("2027-28");
    expect(financialYear("2099-06-01").label).toBe("2099-00");
  });
});

describe("wageWeek", () => {
  it("defaults to Sunday–Saturday", () => {
    // 21 Oct 2026 is a Wednesday
    expect(wageWeek("2026-10-21")).toEqual({ start: "2026-10-18", end: "2026-10-24" });
    // a Saturday is the end of its own week
    expect(wageWeek("2026-10-24")).toEqual({ start: "2026-10-18", end: "2026-10-24" });
  });
  it("supports another settlement day", () => {
    // week ending Sunday
    expect(wageWeek("2026-10-21", 0)).toEqual({ start: "2026-10-19", end: "2026-10-25" });
  });
});

describe("display", () => {
  it("formats DD-MM-YYYY and long form", () => {
    expect(formatDate("2026-10-21")).toBe("21-10-2026");
    expect(formatDateLong("2026-10-01")).toBe("1 Oct 2026");
    expect(formatDate(null)).toBe("—");
  });
  it("describes due dates", () => {
    expect(describeDue("2026-10-21", "2026-10-21")).toBe("Due today");
    expect(describeDue("2026-10-22", "2026-10-21")).toBe("Due tomorrow");
    expect(describeDue("2026-10-25", "2026-10-21")).toBe("4 days left");
    expect(describeDue("2026-10-20", "2026-10-21")).toBe("1 day late");
    expect(describeDue("2026-10-18", "2026-10-21")).toBe("3 days late");
  });
});
