import { createHmac } from "node:crypto";
import { createClient, type Session } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";

/**
 * CP2 live auth smoke (runbook artifact, ADR-001) — proves the security
 * boundary end-to-end against a REAL local stack with real GoTrue tokens:
 *
 *  1. password sign-in → JWT carries app_roles (the access-token hook fired)
 *     and aal1
 *  2. privileged DB mutation at aal1 → rejected at the DB (aal2_required)
 *  3. TOTP enroll + challenge + verify (code computed locally) → aal2 token
 *  4. same mutation at aal2 → passes authorization (fails later, on the
 *     state machine — proving role+aal cleared)
 *  5. optional HTTP checks against a running `next dev` (set
 *     PORTAL_SMOKE_BASE_URL): /admin unauthenticated → /login; aal1 cookies
 *     → /login/mfa; aal2 cookies → 200 (requireRole passed at the handler)
 *
 * Prereq: `npm run provision:super-admin` against the same stack.
 * Run:    npm run smoke:auth   (add PORTAL_SMOKE_BASE_URL for step 5)
 */

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPER_ADMIN_EMAIL: z.string().email(),
  SUPER_ADMIN_PASSWORD: z.string().min(1),
  PORTAL_SMOKE_BASE_URL: z.string().url().optional(),
});
const env = envSchema.parse(process.env);

const REFERENCE_LISTING = "c0000000-0000-4000-8000-000000000001"; // seed: published EN+JA

let failures = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

// ── minimal TOTP (RFC 6238, SHA-1, 30s, 6 digits) — no extra dependency ────
function base32Decode(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  const code =
    (((digest[offset]! & 0x7f) << 24) |
      (digest[offset + 1]! << 16) |
      (digest[offset + 2]! << 8) |
      digest[offset + 3]!) %
    1_000_000;
  return code.toString().padStart(6, "0");
}

const decodeJwtPayload = (jwt: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString());

// ── cookie materialization for the HTTP checks ─────────────────────────────
async function cookieHeaderFor(session: Session): Promise<string> {
  const store = new Map<string, string>();
  const ssr = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...store.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const c of cookies) store.set(c.name, c.value);
      },
    },
  });
  await ssr.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return [...store.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
}

async function fetchStatus(base: string, path: string, cookie?: string) {
  const res = await fetch(new URL(path, base), {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

async function main(): Promise<void> {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1 ── password sign-in: hook claims + aal1
  const signIn = await supabase.auth.signInWithPassword({
    email: env.SUPER_ADMIN_EMAIL,
    password: env.SUPER_ADMIN_PASSWORD,
  });
  if (signIn.error || !signIn.data.session) {
    check("password sign-in", false, signIn.error?.message);
    process.exit(1);
  }
  const aal1Session = signIn.data.session;
  const claims1 = decodeJwtPayload(aal1Session.access_token);
  check(
    "access-token hook injects app_roles",
    Array.isArray(claims1.app_roles) && (claims1.app_roles as string[]).includes("super_admin"),
    `app_roles=${JSON.stringify(claims1.app_roles)}`,
  );
  check("fresh password session is aal1", claims1.aal === "aal1", `aal=${String(claims1.aal)}`);

  // 2 ── privileged mutation at aal1 → DB rejects
  const rpc1 = await supabase.rpc("publish_listing_locale", {
    p_listing_id: REFERENCE_LISTING,
    p_locale: "ja",
  });
  check(
    "aal1 privileged mutation rejected AT THE DB",
    Boolean(rpc1.error?.message.includes("aal2_required")),
    rpc1.error?.message ?? "no error!",
  );

  // 3 ── TOTP enroll + verify → aal2
  const enroll = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (enroll.error) {
    check("TOTP enroll", false, enroll.error.message);
    process.exit(1);
  }
  const challenge = await supabase.auth.mfa.challenge({ factorId: enroll.data.id });
  if (challenge.error) {
    check("TOTP challenge", false, challenge.error.message);
    process.exit(1);
  }
  const verify = await supabase.auth.mfa.verify({
    factorId: enroll.data.id,
    challengeId: challenge.data.id,
    code: totp(enroll.data.totp.secret),
  });
  if (verify.error) {
    check("TOTP verify", false, verify.error.message);
    process.exit(1);
  }
  const { data: aal2Data } = await supabase.auth.getSession();
  const aal2Session = aal2Data.session!;
  const claims2 = decodeJwtPayload(aal2Session.access_token);
  check("post-MFA session is aal2", claims2.aal === "aal2", `aal=${String(claims2.aal)}`);

  // 4 ── same mutation at aal2 → clears role+aal, fails on the STATE MACHINE
  const rpc2 = await supabase.rpc("publish_listing_locale", {
    p_listing_id: REFERENCE_LISTING,
    p_locale: "ja",
  });
  check(
    "aal2 mutation passes authorization (fails on state, not authz)",
    Boolean(rpc2.error?.message.includes("invalid_transition")),
    rpc2.error?.message ?? "no error!",
  );

  // cleanup: unenroll the smoke factor so re-runs enroll fresh
  await supabase.auth.mfa.unenroll({ factorId: enroll.data.id });

  // 5 ── HTTP checks (optional)
  if (env.PORTAL_SMOKE_BASE_URL) {
    const base = env.PORTAL_SMOKE_BASE_URL;
    const anon = await fetchStatus(base, "/admin");
    check(
      "proxy: /admin unauthenticated → /login",
      anon.status >= 300 && anon.status < 400 && anon.location.includes("/login"),
      `${anon.status} → ${anon.location}`,
    );
    const aal1Cookie = await cookieHeaderFor(aal1Session);
    const aal1Res = await fetchStatus(base, "/admin", aal1Cookie);
    check(
      "proxy: /admin at aal1 → /login/mfa",
      aal1Res.status >= 300 && aal1Res.status < 400 && aal1Res.location.includes("/login/mfa"),
      `${aal1Res.status} → ${aal1Res.location}`,
    );
    const aal2Cookie = await cookieHeaderFor(aal2Session);
    const aal2Res = await fetchStatus(base, "/admin", aal2Cookie);
    check(
      "handler: /admin at aal2 renders (requireRole passed)",
      aal2Res.status === 200,
      `${aal2Res.status}`,
    );
  } else {
    console.log("SKIP  HTTP checks (set PORTAL_SMOKE_BASE_URL and run `next dev` to include them)");
  }

  await supabase.auth.signOut();
  if (failures > 0) {
    console.error(`\nsmoke-auth: ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nsmoke-auth: all checks passed");
}

main().catch((e) => {
  console.error(`smoke-auth crashed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
