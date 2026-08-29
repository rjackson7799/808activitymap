import { randomUUID } from "node:crypto";
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

/**
 * A dedicated single-connection client for tests that need genuine concurrency
 * with controlled commit ordering (e.g. the taxonomy unique-slug race), which
 * the rollback-only `withClaims`/`withRollback` helpers cannot express. Caller
 * MUST `.end()` it in a `finally`.
 */
export function newConnection() {
  return postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
}

export interface JwtClaims {
  sub?: string;
  role?: "authenticated" | "anon";
  aal?: "aal1" | "aal2";
  app_roles?: string[];
  session_id?: string;
  [key: string]: unknown;
}

async function prepareLiveIdentity(
  tx: TxSql,
  claims: JwtClaims,
): Promise<JwtClaims> {
  if (!claims.sub) return claims;

  const sessionId = claims.session_id ?? randomUUID();
  await tx`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      ${claims.sub}::uuid,
      'authenticated',
      'authenticated',
      ${`db-test-${claims.sub}@example.invalid`},
      '',
      now(),
      now(),
      now()
    )
    on conflict (id) do nothing`;

  const databaseRoles = new Set([
    "super_admin",
    "publisher",
    "editor",
    "language_reviewer_ja",
    "language_reviewer_ko",
    "ops_agent",
    "contributor",
  ]);
  for (const appRole of (claims.app_roles ?? []).filter((role) =>
    databaseRoles.has(role),
  )) {
    await tx`
      insert into public.user_roles (user_id, role)
      values (${claims.sub}::uuid, ${appRole})
      on conflict (user_id, role) do nothing`;
  }

  await tx`
    insert into auth.sessions (id, user_id)
    values (${sessionId}::uuid, ${claims.sub}::uuid)
    on conflict (id) do nothing`;

  return { ...claims, session_id: sessionId };
}

/** Set realistic claims, including the corresponding live Auth session/roles. */
export async function setClaims(
  tx: TxSql,
  claims: JwtClaims,
  switchToJwtRole = false,
): Promise<void> {
  await tx.unsafe("reset role");
  const { role = "authenticated", ...rest } = claims;
  const liveClaims = await prepareLiveIdentity(tx, rest);
  const payload = JSON.stringify({ role, ...liveClaims });
  await tx`select set_config('request.jwt.claims', ${payload}, true)`;
  if (switchToJwtRole) await tx.unsafe(`set local role ${role}`);
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
  let result!: T;
  await sql
    .begin(async (tx) => {
      await setClaims(tx as TxSql, { role, ...rest }, true);
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
  let result!: T;
  await sql
    .begin(async (tx) => {
      await setClaims(tx as TxSql, claims);
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

/**
 * Expect a statement to fail INSIDE an open transaction without killing it:
 * runs `fn` in a SAVEPOINT so the transaction stays usable afterwards.
 */
export async function expectErrorIn(
  tx: TxSql,
  messagePattern: RegExp | string,
  fn: (sp: TxSql) => Promise<unknown>,
): Promise<void> {
  let error: unknown;
  try {
    await tx.savepoint((sp) => fn(sp as TxSql));
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
