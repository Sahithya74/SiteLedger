import { z } from "zod";
import { PayFrequency } from "@/generated/prisma/enums";
import {
  zEnum,
  zMoney,
  zOptionalDate,
  zOptionalEmail,
  zOptionalPhone,
  zOptionalText,
  zText,
} from "@/lib/validation";

export const engineerFormSchema = z.object({
  name: zText("Name", 120),
  phone: zOptionalPhone(),
  altPhone: zOptionalPhone(),
  email: zOptionalEmail(),
  qualification: zOptionalText(150),
  role: zOptionalText(100),
  joiningDate: zOptionalDate("Joining date"),
  payFrequency: zEnum(PayFrequency, "Payment frequency"),
  salaryPaise: zMoney("Monthly salary"),
  dailyWagePaise: zMoney("Daily wage"),
  responsibilities: zOptionalText(2000),
  notes: zOptionalText(2000),
  projectIds: z.preprocess(
    (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
    z.array(z.string().min(1).max(50)).max(200),
  ),
});

export type EngineerFormInput = z.infer<typeof engineerFormSchema>;
