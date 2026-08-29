import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { authenticatedClient } from "./auth";
import { deterministicUuid, normalizeHours, readDossier } from "./dossier";

async function main(): Promise<void> {
const [command, dossierPath, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run") || process.env.npm_config_dry_run === "true";
if (!command || !dossierPath || !["load", "check"].includes(command)) {
  throw new Error("Usage: npm run seed:listings -- <load|check> <dossier.yaml> [--dry-run]");
}

const { dossier, directory } = readDossier(dossierPath);
const ids = {
  organization: deterministicUuid(dossier.external_ref, "organization"),
  location: deterministicUuid(dossier.external_ref, "location"),
  hours: deterministicUuid(dossier.external_ref, "hours"),
  listing: deterministicUuid(dossier.external_ref, "listing"),
};

function localPath(path: string) { return resolve(directory, path); }
function mime(path: string): string {
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".pdf": "application/pdf" } as Record<string, string>)[extname(path).toLowerCase()] ?? "";
}
function asset(path: string, prefix: string) {
  const full = localPath(path);
  if (!existsSync(full)) throw new Error(`Missing dossier asset: ${full}`);
  const data = readFileSync(full);
  const contentType = mime(full);
  if (!contentType) throw new Error(`Unsupported asset type: ${full}`);
  const hash = createHash("sha256").update(data).digest("hex");
  return { data, contentType, path: `${prefix}/${dossier.external_ref}/${hash}${extname(full).toLowerCase()}` };
}

const photos = dossier.photos.map((photo, index) => ({ ...photo, ...asset(photo.file, "seed"), id: deterministicUuid(dossier.external_ref, `photo:${index}`) }));
const permission = dossier.verification.confirmed ? { ...asset(dossier.verification.permission_form, "permission"), id: deterministicUuid(dossier.external_ref, "permission") } : null;

if (dryRun) {
  console.log(JSON.stringify({ external_ref: dossier.external_ref, ids, photos: photos.map(({ id, path, contentType }) => ({ id, path, contentType })), permission: permission && { id: permission.id, path: permission.path, contentType: permission.contentType }, writes: false }, null, 2));
  process.exit(0);
}

const client = await authenticatedClient();

if (command === "check") {
  const result = await client.rpc("can_publish_listing_locale", { p_listing_id: ids.listing, p_locale: "en" });
  if (result.error) {
    if (result.error.message.includes("not found")) console.log("BLOCKED  not_loaded");
    else throw result.error;
  } else if (result.data.length === 0) console.log("READY  publication contract has no blockers");
  else for (const blocker of result.data) console.log(`BLOCKED  ${blocker.blocker_code} — ${JSON.stringify(blocker.detail)}`);
  process.exit(result.data?.length ? 2 : 0);
}

async function upload(bucket: string, item: { path: string; data: Buffer; contentType: string }) {
  const result = await client.storage.from(bucket).upload(item.path, item.data, { contentType: item.contentType, upsert: false });
  if (result.error && !/already exists|Duplicate/i.test(result.error.message)) throw result.error;
}
for (const photo of photos) await upload("public-photos", photo);
if (permission) await upload("evidence", permission);

const categorySlugs = [dossier.category.primary, ...dossier.category.secondary];
const categories = await client.from("category_locales").select("category_id,slug").eq("locale", "en").in("slug", categorySlugs);
if (categories.error) throw categories.error;
const categoryBySlug = new Map(categories.data.map((row) => [row.slug, row.category_id]));
for (const slug of categorySlugs) if (!categoryBySlug.has(slug)) throw new Error(`Unknown EN category slug: ${slug}`);

const payload = {
  ids, external_ref: dossier.external_ref, organization: dossier.organization,
  location: { ...dossier.location, geo_lat: dossier.location.geo[0], geo_lng: dossier.location.geo[1] },
  hours: normalizeHours(dossier.hours),
  category: { primary_id: categoryBySlug.get(dossier.category.primary), secondary_ids: dossier.category.secondary.map((slug) => categoryBySlug.get(slug)) },
  locale: { ...dossier.locales.en, slug: dossier.locales.en.slug ?? dossier.external_ref },
  source: dossier.source,
  verification: { ...dossier.verification, evidence_media_id: permission?.id, evidence_path: permission?.path },
  photos: photos.map((photo) => ({ id: photo.id, path: photo.path, license: photo.license, granted_by: photo.granted_by, alt: photo.alt })),
};
const loaded = await client.rpc("load_permissioned_dossier", { p_payload: payload });
if (loaded.error) throw loaded.error;
console.log(`LOADED  ${dossier.external_ref} — listing ${loaded.data}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
