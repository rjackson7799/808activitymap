import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { authenticatedClient } from "./auth";
import { deterministicUuid } from "./dossier";
import { menuSeedHash, readMenuDossier } from "./menu-dossier";

async function main(): Promise<void> {
  const [command, dossierPath, ...flags] = process.argv.slice(2);
  const commands = ["load", ...(["en", "ja", "ko"] as const).flatMap((locale) => [
    `submit-${locale}`, `approve-qa-${locale}`, `approve-vendor-${locale}`, `check-${locale}`, `publish-${locale}`,
  ])];
  if (!command || !dossierPath || !commands.includes(command)) throw new Error(`Usage: npm run seed:menus -- <${commands.join("|")}> <menu.yaml> [--dry-run]`);
  const dryRun = flags.includes("--dry-run") || process.env.npm_config_dry_run === "true";
  const { dossier, directory } = readMenuDossier(dossierPath);
  const locale = (["en", "ja", "ko"] as const).find((candidate) => command.endsWith(`-${candidate}`));
  if (locale && !dossier.locales[locale]) throw new Error(`Command ${command} requires locales.${locale}`);

  const entity = (kind: string) => deterministicUuid(dossier.listing_external_ref, `menu:${dossier.menu_ref}:${kind}`);
  const versionEntity = (kind: string) => entity(`version:${dossier.version}:${kind}`);
  const asset = (relative: string, bucket: string) => {
    const full = resolve(directory, relative);
    if (!existsSync(full)) throw new Error(`Missing menu asset: ${full}`);
    const data = readFileSync(full); const extension = extname(full).toLowerCase();
    const contentType = ({ ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" } as Record<string, string>)[extension];
    if (!contentType) throw new Error(`Unsupported menu asset type: ${full}`);
    return { data, contentType, path: `${bucket}/${dossier.listing_external_ref}/${createHash("sha256").update(data).digest("hex")}${extension}` };
  };
  const source = asset(dossier.source.file, "menu");
  const evidence = asset(dossier.approval.file, "approval");
  const ids = {
    listing: deterministicUuid(dossier.listing_external_ref, "listing"), document: entity("document"),
    version: entity(`version:${dossier.version}`),
    source: entity(`source:${createHash("sha256").update(source.data).digest("hex")}`),
    evidence: entity(`evidence:${createHash("sha256").update(evidence.data).digest("hex")}`),
    locales: Object.fromEntries(Object.keys(dossier.locales).map((key) => [key, versionEntity(`locale:${key}`)])),
  };
  const sections = dossier.sections.map((section) => ({ ...section, id: versionEntity(`section:${section.ref}`), items: section.items.map((item) => ({ ...item, id: versionEntity(`item:${item.ref}`) })) }));
  const payload = { ...dossier, ids, seed_hash: menuSeedHash(dossier), source: { ...dossier.source, id: ids.source, path: source.path }, approval: { ...dossier.approval, id: ids.evidence, path: evidence.path }, sections };
  if (dryRun) { console.log(JSON.stringify({ listing_external_ref: dossier.listing_external_ref, menu_ref: dossier.menu_ref, version: dossier.version, ids, source: source.path, evidence: evidence.path, writes: false }, null, 2)); return; }

  const client = await authenticatedClient();
  const upload = async (bucket: string, item: typeof source) => {
    const result = await client.storage.from(bucket).upload(item.path, item.data, { contentType: item.contentType, upsert: false });
    if (result.error && !/already exists|Duplicate/i.test(result.error.message)) throw result.error;
  };
  if (command === "load") {
    await upload("menu-sources", source); await upload("evidence", evidence);
    const loaded = await client.rpc("load_permissioned_menu_dossier", { p_payload: payload });
    if (loaded.error) throw loaded.error;
    console.log(`LOADED  ${dossier.listing_external_ref}/${dossier.menu_ref} v${dossier.version} — menu version ${loaded.data}`); return;
  }
  const mvlId = ids.locales[locale!] as string;
  if (command.startsWith("check-") || command.startsWith("publish-")) {
    const checked = await client.rpc("can_publish_menu_locale", { p_id: mvlId });
    if (checked.error) throw checked.error;
    if (checked.data.length) { for (const blocker of checked.data) console.log(`BLOCKED  ${blocker.blocker_code} — ${JSON.stringify(blocker.detail)}`); process.exit(2); }
    console.log("READY  menu locale has no blockers");
    if (command.startsWith("check-")) return;
  }
  const target = command.startsWith("submit-") ? "qa_pending" : command.startsWith("approve-qa-") ? "qa_approved" : command.startsWith("approve-vendor-") ? "approved" : "published";
  const transitioned = await client.rpc("transition_menu_version_locale", {
    p_id: mvlId, p_to_status: target,
    p_approval_type: target === "approved" ? "vendor_approved_external" : undefined,
    p_evidence_media_id: target === "approved" ? ids.evidence : undefined,
  });
  if (transitioned.error) throw transitioned.error;
  console.log(`${target.toUpperCase()}  ${dossier.listing_external_ref}/${dossier.menu_ref} v${dossier.version} — ${locale}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
