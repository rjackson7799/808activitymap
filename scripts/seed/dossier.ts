import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const day = z.union([
  z.literal("closed"),
  z.literal("24h"),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d(?:,([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d)*$/),
]);

const locale = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1).optional(),
  editorial_note: z.string().trim().min(1),
  seo_title: z.string().trim().min(1),
  seo_desc: z.string().trim().min(1),
});

export const dossierSchema = z.object({
  external_ref: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  organization: z.object({ name: z.string().trim().min(1), legal_name: z.string().trim().min(1).optional() }),
  location: z.object({
    address: z.object({
      street: z.string().trim().min(1), city: z.string().trim().min(1),
      region: z.string().trim().min(1), postal_code: z.string().trim().min(1),
      country: z.string().length(2).default("US"),
    }),
    geo: z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]),
    phone: z.string().trim().min(1),
  }),
  hours: z.object({
    mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day,
  }),
  category: z.object({ primary: z.string().trim().min(1), secondary: z.array(z.string().trim().min(1)).default([]) }),
  photos: z.array(z.object({
    file: z.string().trim().min(1), license: z.string().trim().min(1),
    granted_by: z.string().trim().min(1), alt: z.string().trim().min(1),
  })).default([]),
  locales: z.object({ en: locale }),
  source: z.object({ website: z.url().refine((url) => new URL(url).protocol === "https:", "website must use HTTPS") }),
  verification: z.discriminatedUnion("confirmed", [
    z.object({ confirmed: z.literal(false) }),
    z.object({
      confirmed: z.literal(true), permission_form: z.string().trim().min(1),
      granted_by: z.string().trim().min(1), verified_at: z.iso.datetime(),
    }),
  ]),
});

export type Dossier = z.infer<typeof dossierSchema>;

export function readDossier(path: string): { dossier: Dossier; directory: string } {
  const absolute = resolve(path);
  return { dossier: dossierSchema.parse(parse(readFileSync(absolute, "utf8"))), directory: resolve(absolute, "..") };
}

const NS = "808activitymap:permissioned-seed:v1";
export function deterministicUuid(externalRef: string, entity: string): string {
  const bytes = createHash("sha256").update(`${NS}:${externalRef}:${entity}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizeHours(hours: Dossier["hours"]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(hours).map(([key, value]) => {
    if (value === "closed") return [key, { closed: true }];
    if (value === "24h") return [key, { is24h: true }];
    return [key, { spans: value.split(",").map((span) => { const [open, close] = span.split("-"); return { open, close }; }) }];
  }));
}
