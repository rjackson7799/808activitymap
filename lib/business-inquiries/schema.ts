import { z } from "zod";

export const businessInquirySchema = z.strictObject({
  locale: z.enum(["en", "ja"]),
  businessName: z.string().trim().min(1).max(160),
  contactName: z.string().trim().min(1).max(100),
  email: z.email().max(320),
  phone: z.string().trim().max(40).optional().default(""),
  companyWebsite: z.union([z.literal(""), z.url().max(500)]).optional().default(""),
  preferredLanguage: z.enum(["en", "ja"]),
  message: z.string().trim().min(20).max(2000),
  consent: z.literal(true),
  website: z.string().max(200).optional().default(""),
});

export type BusinessInquiryInput = z.infer<typeof businessInquirySchema>;
