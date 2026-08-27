import { createClient } from "@supabase/supabase-js";
import type postgres from "postgres";
import { e2eEnv } from "./env";
import { totp } from "./totp";

/**
 * E2E staff provisioning. Creates (idempotently) a staff auth user, grants its
 * role over a direct-pg transaction with `app.actor` set (so the audit row is
 * attributed), and enrolls + verifies a TOTP factor so the browser can reach
 * aal2 by challenging it. Returns the secret so the specs compute codes
 * locally (mirrors provision-super-admin.ts + smoke-auth.ts).
 */

export interface ProvisionedStaff {
  email: string;
  password: string;
  role: string;
  userId: string;
  totpSecret: string;
}

export async function provisionStaffUser(
  pg: postgres.Sql,
  user: { email: string; password: string; role: string },
): Promise<ProvisionedStaff> {
  const env = e2eEnv();
  const admin = createClient(env.supabaseUrl, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) create or resolve the auth user
  let userId: string;
  const created = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
  });
  if (!created.error && created.data.user) {
    userId = created.data.user.id;
  } else if (created.error?.code === "email_exists") {
    const rows = await pg<{ id: string }[]>`select id from auth.users where email = ${user.email}`;
    if (rows.length !== 1) throw new Error(`expected one auth user for ${user.email}, found ${rows.length}`);
    userId = rows[0]!.id;
  } else {
    throw new Error(`createUser failed for ${user.email}: ${created.error?.message}`);
  }

  // 2) grant the role (audit-attributed)
  await pg.begin(async (tx) => {
    await tx`select set_config('app.actor', ${userId}, true)`;
    await tx`
      insert into public.user_roles (user_id, role, granted_by)
      values (${userId}, ${user.role}, ${userId})
      on conflict (user_id, role) do nothing`;
  });

  // 3) enroll + verify TOTP → a verified factor the browser can challenge
  const userClient = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await userClient.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signIn.error) throw new Error(`sign-in failed for ${user.email}: ${signIn.error.message}`);

  // Remove any factors left by a prior run via direct pg — unenroll of a
  // VERIFIED factor requires aal2, which a fresh password session lacks, so the
  // API path can't clean up. Deleting cascades challenges; the mfa-audit
  // trigger records it and never raises.
  await pg`delete from auth.mfa_factors where user_id = ${userId}`;

  const enroll = await userClient.auth.mfa.enroll({ factorType: "totp" });
  if (enroll.error) throw new Error(`enroll failed for ${user.email}: ${enroll.error.message}`);
  const challenge = await userClient.auth.mfa.challenge({ factorId: enroll.data.id });
  if (challenge.error) throw new Error(`challenge failed for ${user.email}: ${challenge.error.message}`);
  const verify = await userClient.auth.mfa.verify({
    factorId: enroll.data.id,
    challengeId: challenge.data.id,
    code: totp(enroll.data.totp.secret),
  });
  if (verify.error) throw new Error(`verify failed for ${user.email}: ${verify.error.message}`);

  const totpSecret = enroll.data.totp.secret;
  await userClient.auth.signOut();

  return { email: user.email, password: user.password, role: user.role, userId, totpSecret };
}
