import { existsSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { Dossier } from "./dossier";
import { readDossier } from "./dossier";

export type InventoryEntry = { path: string; directory: string; dossier: Dossier };
export type InventoryIssue = {
  code: string;
  path?: string;
  external_ref?: string;
  detail: string;
};

export type InventoryReport = {
  directory: string;
  filesScanned: number;
  validDossiers: number;
  confirmed: number;
  withPhotos: number;
  withJapanese: number;
  withKorean: number;
  target: { min: number; max: number };
  ready: boolean;
  issues: InventoryIssue[];
};

const photoExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const evidenceExtensions = new Set([...photoExtensions, ".pdf"]);

function yamlFiles(directory: string): string[] {
  const files: string[] = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink() || item.name.startsWith(".")) continue;
    const path = resolve(directory, item.name);
    if (item.isDirectory()) files.push(...yamlFiles(path));
    else if ([".yaml", ".yml"].includes(extname(item.name).toLowerCase())) files.push(path);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export function readInventoryDirectory(directory: string): {
  root: string;
  filesScanned: number;
  entries: InventoryEntry[];
  issues: InventoryIssue[];
} {
  const root = resolve(directory);
  const files = yamlFiles(root);
  const entries: InventoryEntry[] = [];
  const issues: InventoryIssue[] = [];
  for (const path of files) {
    try {
      const parsed = readDossier(path);
      entries.push({ path, ...parsed });
    } catch (error) {
      issues.push({ code: "invalid_dossier", path, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return { root, filesScanned: files.length, entries, issues };
}

export function auditInventory(
  input: ReturnType<typeof readInventoryDirectory>,
  target = { min: 25, max: 40 },
  assetExists: (path: string) => boolean = existsSync,
): InventoryReport {
  const issues = [...input.issues];
  if (input.filesScanned < target.min || input.filesScanned > target.max) {
    issues.push({ code: "inventory_count", detail: `found ${input.filesScanned}; launch target is ${target.min}–${target.max}` });
  }

  const refs = new Map<string, string>();
  const slugs = new Map<string, string>();
  for (const { dossier, directory, path } of input.entries) {
    const priorRef = refs.get(dossier.external_ref);
    if (priorRef) issues.push({ code: "duplicate_external_ref", path, external_ref: dossier.external_ref, detail: `also used by ${priorRef}` });
    else refs.set(dossier.external_ref, path);

    for (const locale of ["en", "ja", "ko"] as const) {
      const content = dossier.locales[locale];
      if (!content) continue;
      const slug = content.slug ?? dossier.external_ref;
      const key = `${locale}:${slug}`;
      const priorSlug = slugs.get(key);
      if (priorSlug) issues.push({ code: "duplicate_locale_slug", path, external_ref: dossier.external_ref, detail: `${locale} slug ${slug} also used by ${priorSlug}` });
      else slugs.set(key, path);
    }

    if (!dossier.verification.confirmed) {
      issues.push({ code: "verification_unconfirmed", path, external_ref: dossier.external_ref, detail: "in-person verification and written permission are required" });
    }
    if (dossier.photos.length === 0) {
      issues.push({ code: "photo_missing", path, external_ref: dossier.external_ref, detail: "at least one licensed photo is required" });
    }
    if (!dossier.locales.ja) {
      issues.push({ code: "ja_missing", path, external_ref: dossier.external_ref, detail: "Japanese launch content is required" });
    }

    for (const photo of dossier.photos) {
      const asset = resolve(directory, photo.file);
      if (!photoExtensions.has(extname(asset).toLowerCase())) {
        issues.push({ code: "photo_type_unsupported", path, external_ref: dossier.external_ref, detail: photo.file });
      } else if (!assetExists(asset)) {
        issues.push({ code: "asset_missing", path, external_ref: dossier.external_ref, detail: photo.file });
      }
    }
    if (dossier.verification.confirmed) {
      const asset = resolve(directory, dossier.verification.permission_form);
      if (!evidenceExtensions.has(extname(asset).toLowerCase())) {
        issues.push({ code: "evidence_type_unsupported", path, external_ref: dossier.external_ref, detail: dossier.verification.permission_form });
      } else if (!assetExists(asset)) {
        issues.push({ code: "asset_missing", path, external_ref: dossier.external_ref, detail: dossier.verification.permission_form });
      }
    }
  }

  return {
    directory: input.root,
    filesScanned: input.filesScanned,
    validDossiers: input.entries.length,
    confirmed: input.entries.filter(({ dossier }) => dossier.verification.confirmed).length,
    withPhotos: input.entries.filter(({ dossier }) => dossier.photos.length > 0).length,
    withJapanese: input.entries.filter(({ dossier }) => Boolean(dossier.locales.ja)).length,
    withKorean: input.entries.filter(({ dossier }) => Boolean(dossier.locales.ko)).length,
    target,
    ready: issues.length === 0,
    issues,
  };
}
