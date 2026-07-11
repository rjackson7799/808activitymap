import { readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildModel } from "./model";
import { renderMigration } from "./render";
import { OUTPUT_MIGRATION } from "./config";

/**
 * CLI entry (tsx): validate the model, render the policy migration, write it
 * to supabase/migrations/OUTPUT_MIGRATION. Deterministic byte-for-byte —
 * the CI drift gate regenerates and fails on any staged difference.
 */

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations");

const model = buildModel();

// The generated file must sort LAST: a schema migration stamped after it
// would not exist yet at this file's position in replay order. Fix when this
// fires: bump OUTPUT_MIGRATION in db/rls/config.ts (pre-ship: rename; post-
// ship: new file) and regenerate.
const later = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql") && f !== OUTPUT_MIGRATION)
  .filter((f) => f >= OUTPUT_MIGRATION);
if (later.length > 0) {
  console.error(
    `rls:generate: OUTPUT_MIGRATION ${OUTPUT_MIGRATION} does not sort last in supabase/migrations/ — ` +
      `bump it in db/rls/config.ts past: ${later.join(", ")}`,
  );
  process.exit(1);
}

const sql = renderMigration(model);
writeFileSync(join(migrationsDir, OUTPUT_MIGRATION), sql, { encoding: "utf8" });

console.log(
  `rls:generate: wrote ${OUTPUT_MIGRATION} — ${model.policies.length} policies across ` +
    `${model.grants.length} tables (${model.fnOwned.length} fn-owned paths emit no policy)`,
);
