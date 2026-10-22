import type { Priority, WorkStatus } from "@/generated/prisma/enums";

// Plain module (no "use client") so server pages can use these values directly.

export type WorkOptions = {
  phases: { id: string; name: string }[];
  sites: { id: string; name: string }[];
  engineers: { id: string; name: string; role: string | null; onProject: boolean }[];
  items: { id: string; name: string; phase: string | null }[];
  showMoney: boolean;
};

export type WorkItemValues = {
  name: string;
  description: string;
  parentId: string;
  siteId: string;
  status: WorkStatus;
  priority: Priority;
  percentComplete: string;
  engineerId: string;
  team: string;
  startDate: string;
  expectedEndDate: string;
  actualEndDate: string;
  estimatedCost: string;
  actualCost: string;
  pendingReason: string;
  notes: string;
  dependsOnIds: string[];
};

export const EMPTY_WORK_ITEM: WorkItemValues = {
  name: "",
  description: "",
  parentId: "",
  siteId: "",
  status: "NOT_STARTED",
  priority: "MEDIUM",
  percentComplete: "0",
  engineerId: "",
  team: "",
  startDate: "",
  expectedEndDate: "",
  actualEndDate: "",
  estimatedCost: "",
  actualCost: "",
  pendingReason: "",
  notes: "",
  dependsOnIds: [],
};
