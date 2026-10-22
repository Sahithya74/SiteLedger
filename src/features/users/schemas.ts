import { z } from "zod";
import { zOptionalPhone, zText } from "@/lib/validation";

export const usernameSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z
    .string({ error: "Login name is required." })
    .min(3, "Login name must be at least 3 characters.")
    .max(40, "Login name is too long.")
    .regex(/^[a-z0-9._-]+$/, "Use only letters, numbers, dots, dashes or underscores (no spaces)."),
);

const password = z.string({ error: "Password is required." }).min(1, "Password is required.").max(200);

export const createManagerSchema = z
  .object({
    name: zText("Name", 100),
    username: usernameSchema,
    phone: zOptionalPhone(),
    password,
    confirmPassword: z.string(),
    preset: z.enum(["SITE_MANAGER", "OFFICE_MANAGER", "NONE"]).default("SITE_MANAGER"),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "The two passwords do not match." });

export const setupOwnerSchema = z
  .object({
    companyName: zText("Company name", 150),
    name: zText("Your name", 100),
    username: usernameSchema,
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "The two passwords do not match." });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "The two passwords do not match." });

export const resetPasswordSchema = z
  .object({
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "The two passwords do not match." });

export const updateUserSchema = z.object({
  name: zText("Name", 100),
  phone: zOptionalPhone(),
});

export const resetWithCodeSchema = z
  .object({
    identifier: zText("Login name or email", 150),
    code: z.string().trim().regex(/^\d{6}$/, "The code has 6 digits."),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "The two passwords do not match." });

export const emailSchema = z.object({
  email: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.email("Enter a valid email address.").max(150)),
});
