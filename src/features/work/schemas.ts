import { z } from "zod";
import { Priority, WorkStatus } from "@/generated/prisma/enums";
import {
  zEnum,
  zInt,
  zMoney,
  zOptionalDate,
  zOptionalId,
  zOptionalText,
  zText,
} from "@/lib/validation";

const idList = z.preprocess(
  (v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.string().min(1).max(50)).max(100),
);

export const workItemFormSchema = z
  .object({
    name: zText("Work name", 150),
    description: zOptionalText(4000),
    parentId: zOptionalId(),
    siteId: zOptionalId(),
    status: zEnum(WorkStatus, "Status"),
    priority: zEnum(Priority, "Priority"),
    percentComplete: zInt("Percentage completed", 0, 100),
    engineerId: zOptionalId(),
    team: zOptionalText(150),
    startDate: zOptionalDate("Start date"),
    expectedEndDate: zOptionalDate("Expected completion"),
    actualEndDate: zOptionalDate("Actual completion"),
    estimatedCostPaise: zMoney("Estimated cost"),
    actualCostPaise: zMoney("Actual cost"),
    pendingReason: zOptionalText(500),
    notes: zOptionalText(4000),
    dependsOnIds: idList,
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.expectedEndDate && v.expectedEndDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["expectedEndDate"], message: "Completion date must be after the start date." });
    }
  });

export type WorkItemFormInput = z.infer<typeof workItemFormSchema>;

export const phaseFormSchema = z.object({
  name: zText("Stage name", 150),
  description: zOptionalText(2000),
});

export const quickProgressSchema = z.object({
  status: zEnum(WorkStatus, "Status"),
  percentComplete: zInt("Percentage completed", 0, 100),
  pendingReason: zOptionalText(500),
});
