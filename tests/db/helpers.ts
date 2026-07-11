import postgres from "postgres";

/**
 * DB-suite helpers (ADR-003 harness): plain SQL against the local Supabase
 * Postgres, with Supabase JWT claims simulated via GUCs so SQL helpers
 * (`jwt_roles()`, `jwt_aal()`) and RLS policies see exactly what they would
 * see behind PostgREST/Auth.
 */

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54332/postgres";

/** Superuser connection — setup, teardown, direct assertions (bypasses RLS). */
export const sql = postgres(DATABASE_URL, {
  max: 4,
  onnotice: () => {}, // silence NOTICEs in test output
});

export type Sql = typeof sql;
export type TxSql = postgres.TransactionSql;

export interface JwtClaims {
  sub?: string;
  role?: "authenticated" | "anon";
  aal?: "aal1" | "aal2";
  app_roles?: string[];
  [key: string]: unknown;
}

/**
 * Run `fn` inside a transaction with simulated Supabase JWT claims, then
 * ROLL BACK — DB state is untouched regardless of what the test does.
 * `SET LOCAL ROLE` mirrors PostgREST's role switch, so RLS applies.
 */
export async function withClaims<T>(
  claims: JwtClaims,
  fn: (tx: TxSql) => Promise<T>,
): Promise<T> {
  const { role = "authenticated", ...rest } = claims;
  const payload = JSON.stringify({ role, ...rest });
  let result!: T;
  await sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${payload}, true)`;
      await tx.unsafe(`set local role ${role}`);
      result = await fn(tx as TxSql);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
  return result;
}

/**
 * Same, but keeps superuser privileges (no role switch): for exercising
 * SECURITY DEFINER transition functions' own role/aal checks without RLS
 * interfering (RLS enforcement itself is covered in the CP2 matrix suites).
 */
export async function withClaimsSuper<T>(
  claims: JwtClaims,
  fn: (tx: TxSql) => Promise<T>,
): Promise<T> {
  const payload = JSON.stringify({ role: "authenticated", ...claims });
  let result!: T;
  await sql
    .begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${payload}, true)`;
      result = await fn(tx as TxSql);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
  return result;
}

/** Transaction that always rolls back — mutation tests leave no residue. */
export async function withRollback<T>(
  fn: (tx: TxSql) => Promise<T>,
): Promise<T> {
  let result!: T;
  await sql
    .begin(async (tx) => {
      result = await fn(tx as TxSql);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
  return result;
}

class Rollback extends Error {
  constructor() {
    super("__rollback__");
  }
}

/** Expect `promise` to reject with a Postgres error whose message matches. */
export async function expectPgError(
  promise: Promise<unknown>,
  messagePattern: RegExp | string,
): Promise<void> {
  let error: unknown;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  if (error === undefined) {
    throw new Error(
      `Expected a Postgres error matching ${messagePattern}, but the statement succeeded`,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  const matches =
    typeof messagePattern === "string"
      ? message.includes(messagePattern)
      : messagePattern.test(message);
  if (!matches) {
    throw new Error(
      `Expected error matching ${messagePattern}, got: ${message}`,
    );
  }
}
