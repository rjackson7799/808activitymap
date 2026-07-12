import postgres from "postgres";
import { e2eEnv } from "./support/env";
import { teardownPublishFixture } from "./support/fixture";

/**
 * Remove the publish fixture so re-runs start clean (the provisioned staff
 * accounts are left in place — provisioning is idempotent and re-enrolls TOTP
 * each run). The polymorphic provenance rows are deleted explicitly inside
 * teardownPublishFixture (no FK, so a cascade misses them).
 */
export default async function globalTeardown() {
  const env = e2eEnv();
  const pg = postgres(env.databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await teardownPublishFixture(pg);
  } finally {
    await pg.end();
  }
}
