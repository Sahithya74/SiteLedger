import type { AttendanceStatus } from "@/generated/prisma/enums";
import { toDbDate } from "@/lib/dates";
import { markAttendance, type AttendanceEntry } from "@/server/services/attendance";
import { log, type SeedContext } from "./context";

/** 30 days of attendance at both active sites (Sundays off, except today). */
export async function seedAttendance(ctx: SeedContext, workers: { villa: string[]; complex: string[] }) {
  let rows = 0;
  for (let offset = -29; offset <= 0; offset++) {
    const date = ctx.day(offset);
    const isSunday = toDbDate(date).getUTCDay() === 0;
    if (isSunday && offset !== 0) continue;

    for (const project of ["villa", "complex"] as const) {
      const entries: AttendanceEntry[] = workers[project].map((labourId) => {
        const r = ctx.rand();
        // Today most of the crew is in, so the dashboard has a realistic morning count.
        const status: AttendanceStatus = offset === 0 ? (r < 0.92 ? "PRESENT" : "ABSENT") : r < 0.86 ? "PRESENT" : r < 0.93 ? "HALF_DAY" : "ABSENT";
        const overtimeHours = status === "PRESENT" && ctx.rand() < 0.12 ? "2" : "0";
        return { labourId, status, overtimeHours };
      });
      // Engineers on site
      if (project === "villa") entries.push({ engineerId: ctx.ids.karthik, status: "PRESENT" });
      if (project === "complex") entries.push({ engineerId: ctx.ids.priya, status: ctx.rand() < 0.9 ? "PRESENT" : "ABSENT" });
      // The supervisor splits his week between the two sites.
      const supervisorSite = offset % 2 === 0 ? "villa" : "complex";
      if (project === supervisorSite) entries.push({ engineerId: ctx.ids.venkatesh, status: "PRESENT" });

      await markAttendance(ctx.owner, { date, projectId: ctx.ids[project], entries });
      rows += entries.length;
    }
  }
  log(`${rows} attendance entries (last 30 days)`);
}
