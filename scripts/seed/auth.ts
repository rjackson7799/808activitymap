import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const authEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(), NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SEED_OPERATOR_EMAIL: z.email(), SEED_OPERATOR_PASSWORD: z.string().min(1),
  SEED_OPERATOR_TOTP_CODE: z.string().regex(/^\d{6}$/).optional(),
});

export async function authenticatedClient(): Promise<SupabaseClient> {
  const cfg = authEnv.parse(process.env);
  const client = createClient(cfg.NEXT_PUBLIC_SUPABASE_URL, cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword({ email: cfg.SEED_OPERATOR_EMAIL, password: cfg.SEED_OPERATOR_PASSWORD });
  if (login.error) throw login.error;
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) throw factors.error;
  const factor = factors.data.totp.find((item) => item.status === "verified");
  if (!factor) throw new Error("Seed operator has no verified TOTP factor");
  let code = cfg.SEED_OPERATOR_TOTP_CODE;
  if (!code) {
    const prompt = createInterface({ input: stdin, output: stdout });
    code = await prompt.question("MFA code: ");
    prompt.close();
  }
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
  if (verified.error) throw verified.error;
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data.currentLevel !== "aal2") throw new Error("MFA did not produce an AAL2 session");
  return client;
}
