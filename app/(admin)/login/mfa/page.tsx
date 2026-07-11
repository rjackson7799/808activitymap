"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

/**
 * TOTP step (ADR-001): first sign-in enrolls an authenticator (QR + secret),
 * every later sign-in verifies a 6-digit code. Client component — enrollment
 * QR display and code entry are interactive; the browser client shares the
 * cookie session with the server. Verification upgrades the session to aal2;
 * the proxy then admits /admin.
 */

type Step =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "challenge"; factorId: string; challengeId: string };

export default function MfaPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  const supabase = useCallback(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  useEffect(() => {
    const client = supabase();
    (async () => {
      const { data: session } = await client.auth.getSession();
      if (!session.session) {
        router.replace("/login");
        return;
      }
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) {
        setStep({ kind: "error", message: error.message });
        return;
      }
      // listFactors(): `totp` holds only VERIFIED totp factors; `all` has everything
      const verified = data.totp[0];
      if (verified) {
        const challenge = await client.auth.mfa.challenge({ factorId: verified.id });
        if (challenge.error) {
          setStep({ kind: "error", message: challenge.error.message });
          return;
        }
        setStep({
          kind: "challenge",
          factorId: verified.id,
          challengeId: challenge.data.id,
        });
        return;
      }
      // first login: enroll (clear an abandoned unverified factor if present)
      const unverified = data.all.find(
        (f) => f.factor_type === "totp" && f.status === "unverified",
      );
      if (unverified) await client.auth.mfa.unenroll({ factorId: unverified.id });
      const enroll = await client.auth.mfa.enroll({ factorType: "totp" });
      if (enroll.error) {
        setStep({ kind: "error", message: enroll.error.message });
        return;
      }
      setStep({
        kind: "enroll",
        factorId: enroll.data.id,
        qr: enroll.data.totp.qr_code,
        secret: enroll.data.totp.secret,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async () => {
    if (step.kind !== "enroll" && step.kind !== "challenge") return;
    setPending(true);
    const client = supabase();
    try {
      let challengeId: string;
      if (step.kind === "enroll") {
        const challenge = await client.auth.mfa.challenge({ factorId: step.factorId });
        if (challenge.error) {
          setStep({ kind: "error", message: challenge.error.message });
          return;
        }
        challengeId = challenge.data.id;
      } else {
        challengeId = step.challengeId;
      }
      const result = await client.auth.mfa.verify({
        factorId: step.factorId,
        challengeId,
        code,
      });
      if (result.error) {
        setStep({ kind: "error", message: "Code not accepted — try the next code." });
        return;
      }
      router.replace("/admin");
    } finally {
      setPending(false);
    }
  };

  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>Two-factor authentication</h1>

      {step.kind === "loading" ? <p>Loading…</p> : null}

      {step.kind === "error" ? (
        <p role="alert" style={{ color: "#b00020" }}>
          {step.message} — <a href="/login">back to sign-in</a>
        </p>
      ) : null}

      {step.kind === "enroll" ? (
        <>
          <p>
            Scan the QR code with your authenticator app (or enter the secret
            manually), then enter the 6-digit code to finish setup.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={step.qr} alt="TOTP enrollment QR code" width={200} height={200} />
          <p>
            Secret: <code>{step.secret}</code>
          </p>
        </>
      ) : null}

      {step.kind === "challenge" ? <p>Enter the 6-digit code from your authenticator app.</p> : null}

      {step.kind === "enroll" || step.kind === "challenge" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <label>
            Code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              style={{ display: "block" }}
            />
          </label>
          <button type="submit" disabled={pending || code.length !== 6} style={{ marginTop: "1rem" }}>
            {pending ? "Verifying…" : "Verify"}
          </button>
        </form>
      ) : null}
    </main>
  );
}
