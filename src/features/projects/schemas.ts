import { z } from "zod";
import { ProjectStatus, ProjectType } from "@/generated/prisma/enums";
import {
  zEnum,
  zId,
  zMoney,
  zOptionalCoordinate,
  zOptionalDate,
  zOptionalText,
  zText,
} from "@/lib/validation";

export const projectFormSchema = z
  .object({
    name: zText("Project name", 120),
    clientId: zId("Client"),
    type: zEnum(ProjectType, "Project type"),
    status: zEnum(ProjectStatus, "Status"),
    description: zOptionalText(4000),
    address: zOptionalText(500),
    city: zOptionalText(100),
    state: zOptionalText(100),
    pincode: zOptionalText(10),
    latitude: zOptionalCoordinate("latitude"),
    longitude: zOptionalCoordinate("longitude"),
    mapUrl: zOptionalText(1000),
    startDate: zOptionalDate("Start date"),
    expectedEndDate: zOptionalDate("Expected completion"),
    actualEndDate: zOptionalDate("Actual completion"),
    quotedPaise: zMoney("Quoted amount"),
    contractPaise: zMoney("Contract amount"),
    statusNote: zOptionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.expectedEndDate && v.expectedEndDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["expectedEndDate"], message: "Completion date must be after the start date." });
    }
    if ((v.latitude === null) !== (v.longitude === null)) {
      ctx.addIssue({ code: "custom", path: ["longitude"], message: "Enter both latitude and longitude, or neither." });
    }
    if (v.mapUrl && !/^https?:\/\//i.test(v.mapUrl)) {
      ctx.addIssue({ code: "custom", path: ["mapUrl"], message: "Map link should start with https://" });
    }
  });

export type ProjectFormInput = z.infer<typeof projectFormSchema>;

export const projectStatusSchema = z.object({
  status: zEnum(ProjectStatus, "Status"),
  statusNote: zOptionalText(500),
  actualEndDate: zOptionalDate("Completion date"),
});

export const projectLocationSchema = z
  .object({
    latitude: zOptionalCoordinate("latitude"),
    longitude: zOptionalCoordinate("longitude"),
    address: zOptionalText(500),
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    path: ["longitude"],
    message: "Enter both latitude and longitude, or neither.",
  });

export const siteFormSchema = z.object({
  name: zText("Site name", 120),
  address: zOptionalText(500),
});
