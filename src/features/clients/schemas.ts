import { z } from "zod";
import {
  zOptionalEmail,
  zOptionalGstin,
  zOptionalPan,
  zOptionalPhone,
  zOptionalText,
  zText,
} from "@/lib/validation";

export const clientFormSchema = z.object({
  name: zText("Client name", 150),
  phone: zOptionalPhone(),
  altPhone: zOptionalPhone(),
  email: zOptionalEmail(),
  address: zOptionalText(500),
  city: zOptionalText(100),
  gstin: zOptionalGstin(),
  pan: zOptionalPan(),
  notes: zOptionalText(4000),
});

export type ClientFormInput = z.infer<typeof clientFormSchema>;
