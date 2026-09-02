import postgres from "postgres";
import { e2eEnv, E2E_USERS } from "./support/env";
import { provisionStaffUser } from "./support/staff";
import { buildPublishFixture } from "./support/fixture";
import { writeState } from "./support/state";

/**
 * Provision the three staff accounts (super_admin + editor + JA reviewer) with verified TOTP,
 * build the publish fixture (fail-fast gate assertion inside), and persist the
 * accounts+secrets for the specs. Runs once before the suite.
 */
export default async function globalSetup() {
  const env = e2eEnv();
  const pg = postgres(env.databaseUrl, { max: 2, onnotice: () => {} });
  try {
    const publisher = await provisionStaffUser(pg, E2E_USERS.publisher);
    const editor = await provisionStaffUser(pg, E2E_USERS.editor);
    const reviewerJa = await provisionStaffUser(pg, E2E_USERS.reviewerJa);
    await buildPublishFixture(pg);
    writeState({ publisher, editor, reviewerJa });
  } finally {
    await pg.end();
  }
}
