import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { e2eEnv } from "./env";
import type { ProvisionedStaff } from "./staff";

/**
 * Shared state written by global-setup and read by the specs: the provisioned
 * staff accounts (with TOTP secrets) so specs drive real sign-in + MFA. Kept
 * out of git (.auth/ is gitignored) — secrets are E2E-local throwaways.
 */

export interface E2eState {
  publisher: ProvisionedStaff;
  editor: ProvisionedStaff;
  reviewerJa: ProvisionedStaff;
}

const STATE_PATH = path.join(process.cwd(), "tests", "e2e", ".auth", "state.json");

export function writeState(state: E2eState): void {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export function readState(): E2eState {
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as E2eState;
}

/** A short-lived superuser pg connection for spec-side assertions. */
export function newPg(): postgres.Sql {
  return postgres(e2eEnv().databaseUrl, { max: 1, onnotice: () => {} });
}
