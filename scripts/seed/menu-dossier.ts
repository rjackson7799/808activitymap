import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const ref = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const menuItem = z.object({
  ref,
  position: z.number().int().min(0),
  price_cents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).default("USD"),
  price_type: z.enum(["fixed", "market", "from"]).default("fixed"),
  variant: z.string().trim().min(1).nullable().optional(),
  flags: z.record(z.string(), z.unknown()).default({}),
  owner_pick: z.boolean().default(false),
}).superRefine((item, ctx) => {
  if (item.price_type === "market" && item.price_cents != null) ctx.addIssue({ code: "custom", message: "market price must not include price_cents" });
  if (item.price_type !== "market" && item.price_cents == null) ctx.addIssue({ code: "custom", message: `${item.price_type} price requires price_cents` });
});

const localeItem = z.object({
  ref,
  original_name: z.string().trim().min(1).optional(),
  transliteration: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  extraction_confidence: z.number().min(0).max(1).optional(),
  human_confirmed: z.boolean().default(false),
});
const localeBlock = z.object({
  sections: z.array(z.object({ ref, name: z.string().trim().min(1), items: z.array(localeItem).min(1) })).min(1),
});

export const menuDossierSchema = z.object({
  listing_external_ref: ref,
  menu_ref: ref,
  version: z.number().int().min(1).default(1),
  source: z.object({
    file: z.string().trim().min(1), license: z.string().trim().min(1),
    granted_by: z.string().trim().min(1), captured_at: z.iso.datetime(),
  }),
  approval: z.object({
    file: z.string().trim().min(1), license: z.string().trim().min(1), granted_by: z.string().trim().min(1),
  }),
  sections: z.array(z.object({ ref, position: z.number().int().min(0), items: z.array(menuItem).min(1) })).min(1),
  locales: z.object({ en: localeBlock, ja: localeBlock.optional(), ko: localeBlock.optional() }),
}).superRefine((dossier, ctx) => {
  const sectionRefs = dossier.sections.map((section) => section.ref);
  if (new Set(sectionRefs).size !== sectionRefs.length) ctx.addIssue({ code: "custom", path: ["sections"], message: "section refs must be unique" });
  const itemRefs = dossier.sections.flatMap((section) => section.items.map((item) => item.ref));
  if (new Set(itemRefs).size !== itemRefs.length) ctx.addIssue({ code: "custom", path: ["sections"], message: "item refs must be unique across the menu" });
  for (const [locale, block] of Object.entries(dossier.locales)) {
    if (!block) continue;
    const localizedSections = block.sections.map((section) => section.ref);
    if ([...localizedSections].sort().join("|") !== [...sectionRefs].sort().join("|")) ctx.addIssue({ code: "custom", path: ["locales", locale], message: "locale must contain every menu section exactly once" });
    for (const section of block.sections) {
      const source = dossier.sections.find((candidate) => candidate.ref === section.ref);
      const localizedItems = section.items.map((item) => item.ref);
      const sourceItems = source?.items.map((item) => item.ref) ?? [];
      if (new Set(localizedItems).size !== localizedItems.length || [...localizedItems].sort().join("|") !== [...sourceItems].sort().join("|")) ctx.addIssue({ code: "custom", path: ["locales", locale, section.ref], message: "locale must contain every section item exactly once" });
    }
  }
});

export type MenuDossier = z.infer<typeof menuDossierSchema>;

export function readMenuDossier(path: string): { dossier: MenuDossier; directory: string } {
  const absolute = resolve(path);
  return { dossier: menuDossierSchema.parse(parse(readFileSync(absolute, "utf8"))), directory: resolve(absolute, "..") };
}

export function menuSeedHash(dossier: MenuDossier): string {
  return createHash("sha256").update(JSON.stringify(dossier)).digest("hex");
}
