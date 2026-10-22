"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Weather } from "@/generated/prisma/enums";
import { zDate, zEnum, zId, zInt, zOptionalText, zText } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireActionUser } from "@/server/auth/current-user";
import { saveDailyReport } from "@/server/services/daily-reports";

type Result = ActionResult<unknown>;

const reportSchema = z.object({
  projectId: zId("Project"),
  siteId: zId("Site"),
  date: zDate("Date"),
  weather: zEnum(Weather, "Weather"),
  weatherNote: zOptionalText(200),
  labourPresent: zInt("Workers present", 0, 5000),
  engineersPresent: zInt("Engineers present", 0, 500),
  workCompleted: zText("Work done today", 4000),
  materialsReceived: zOptionalText(4000),
  materialsUsed: zOptionalText(4000),
  equipmentUsed: zOptionalText(2000),
  issues: zOptionalText(4000),
  safetyObservations: zOptionalText(2000),
  notes: zOptionalText(2000),
});

export async function saveDailyReportAction(_prev: Result, formData: FormData): Promise<Result> {
  return runAction(async () => {
    const user = await requireActionUser("dailyReports.manage");
    const { id } = await saveDailyReport(user, reportSchema.parse(formToObject(formData)));
    redirect(`/daily-reports/${id}`);
  });
}
