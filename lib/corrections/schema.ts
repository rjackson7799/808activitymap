import { z } from "zod";
import { LOCALES } from "@/lib/locales";

export const correctionFields = [
  "name",
  "address",
  "phone",
  "hours",
  "menu",
  "closure",
  "other",
] as const;

export const correctionRequestSchema = z.strictObject({
  listingId: z.uuid(),
  locale: z.enum(LOCALES),
  field: z.enum(correctionFields),
  details: z.string().trim().min(10).max(2000),
  name: z.string().trim().max(100).optional().default(""),
  email: z.union([z.literal(""), z.email().max(320)]).optional().default(""),
  website: z.string().max(200).optional().default(""),
});

export type CorrectionRequestInput = z.infer<typeof correctionRequestSchema>;
