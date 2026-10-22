import type { ProjectStatus, ProjectType } from "@/generated/prisma/enums";

// Plain module (no "use client") so server pages can use these values directly.

export type ProjectFormValues = {
  name: string;
  clientId: string;
  type: ProjectType;
  status: ProjectStatus;
  description: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: string;
  longitude: string;
  mapUrl: string;
  startDate: string;
  expectedEndDate: string;
  actualEndDate: string;
  quoted: string;
  contract: string;
  statusNote: string;
};

export const EMPTY_PROJECT: ProjectFormValues = {
  name: "",
  clientId: "",
  type: "RESIDENTIAL",
  status: "PLANNING",
  description: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  latitude: "",
  longitude: "",
  mapUrl: "",
  startDate: "",
  expectedEndDate: "",
  actualEndDate: "",
  quoted: "",
  contract: "",
  statusNote: "",
};
