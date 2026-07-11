import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { z } from "zod";

/**
 * super_admin provisioning (CP2, ADR-001): creates the staff auth user from
 * env-supplied credentials and grants the super_admin role. Idempotent —
 * safe to re-run per environment. Never seeds (seeds never run in prod;
 * staff users are not fixture data).
 *
 * Run: npm run provision:super-admin
 * Env: SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD (script-local — the app
 *      never reads these), NEXT_PUBLIC_SUPABASE_URL,
 *      SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.
 *
 * The user_roles upsert runs over a DIRECT Postgres connection in one
 * transaction with set_config('app.actor', …) so the audit row carries
 * service attribution — a GUC cannot ride the admin API.
 */

const envSchema = z.object({
  SUPER_ADMIN_EMAIL: z.string().email(),
  SUPER_ADMIN_PASSWORD: z.string().min(12, "config.toml enforces minimum_password_length = 12"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("provision-super-admin: missing/invalid env:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}
const env = parsed.data;

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });

async function resolveUserId(): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: env.SUPER_ADMIN_EMAIL,
    password: env.SUPER_ADMIN_PASSWORD,
    email_confirm: true, // password sign-in must work where confirmations are on
  });
  if (!error) {
    console.log(`created auth user ${env.SUPER_ADMIN_EMAIL} (${data.user.id})`);
    return data.user.id;
  }
  if (error.code === "email_exists") {
    // idempotent path — supabase-js has no getUserByEmail; reading
    // auth.users is safe (only writing it is the fragile pattern)
    const rows = await sql`select id from auth.users where email = ${env.SUPER_ADMIN_EMAIL}`;
    if (rows.length !== 1) {
      throw new Error(`expected exactly one auth user for ${env.SUPER_ADMIN_EMAIL}, found ${rows.length}`);
    }
    console.log(`auth user ${env.SUPER_ADMIN_EMAIL} already exists (${rows[0]!.id})`);
    return rows[0]!.id as string;
  }
  throw new Error(`createUser failed: ${error.message}`);
}

async function main(): Promise<void> {
  try {
    const userId = await resolveUserId();

    await sql.begin(async (tx) => {
      // service attribution for the audit trigger on user_roles
      await tx`select set_config('app.actor', ${userId}, true)`;
      const inserted = await tx`
        insert into public.user_roles (user_id, role, granted_by)
        values (${userId}, 'super_admin', ${userId})
        on conflict (user_id, role) do nothing`;
      console.log(
        inserted.count === 1
          ? `granted super_admin to ${env.SUPER_ADMIN_EMAIL} (audit-logged)`
          : `super_admin grant already present for ${env.SUPER_ADMIN_EMAIL}`,
      );
    });
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(`provision-super-admin failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
