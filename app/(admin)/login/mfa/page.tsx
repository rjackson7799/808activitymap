"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { prepareMfa, verifyMfa } from "./actions";

/**
 * TOTP step (ADR-001): first sign-in enrolls an authenticator (QR + secret),
 * every later sign-in verifies a 6-digit code. The interactive UI delegates
 * factor mutations to server actions so each successful lifecycle change can
 * verify/write its best-effort audit without exposing secrets. Verification
 * upgrades the cookie session to aal2; the proxy then admits /admin.
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

  useEffect(() => {
    (async () => {
      const prepared = await prepareMfa();
      if (prepared.kind === "error" && prepared.message.includes("Sign in again")) {
        router.replace("/login");
      } else {
        setStep(prepared);
      }
    })();
  }, [router]);

  const verify = async () => {
    if (step.kind !== "enroll" && step.kind !== "challenge") return;
    setPending(true);
    try {
      const result = await verifyMfa({
        kind: step.kind,
        factorId: step.factorId,
        ...(step.kind === "challenge" ? { challengeId: step.challengeId } : {}),
        code,
      });
      if (!result.ok) {
        setStep({ kind: "error", message: result.message });
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
          {step.message} — <Link href="/login">back to sign-in</Link>
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
