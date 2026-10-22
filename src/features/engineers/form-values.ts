import type { PayFrequency } from "@/generated/prisma/enums";

// Plain module (no "use client") so server pages can use these values directly.

export type EngineerFormValues = {
  name: string;
  phone: string;
  altPhone: string;
  email: string;
  qualification: string;
  role: string;
  joiningDate: string;
  payFrequency: PayFrequency;
  salary: string;
  dailyWage: string;
  responsibilities: string;
  notes: string;
  projectIds: string[];
};

export const EMPTY_ENGINEER: EngineerFormValues = {
  name: "",
  phone: "",
  altPhone: "",
  email: "",
  qualification: "",
  role: "Site Engineer",
  joiningDate: "",
  payFrequency: "MONTHLY",
  salary: "",
  dailyWage: "",
  responsibilities: "",
  notes: "",
  projectIds: [],
};
