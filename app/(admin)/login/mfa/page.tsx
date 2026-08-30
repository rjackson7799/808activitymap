"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell, authInputClassName } from "@/components/admin/AuthShell";
import { Button } from "@/components/ui/button";
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
    <AuthShell
      eyebrow="Secure access"
      title="Two-factor authentication"
      description="Confirm your identity with the six-digit code from your authenticator app."
      wide={step.kind === "enroll"}
    >
      {step.kind === "loading" ? (
        <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm text-secondary">
          <span className="h-5 w-5 animate-pulse rounded-full bg-teal/25" aria-hidden="true" />
          Preparing secure sign-in…
        </div>
      ) : null}

      {step.kind === "error" ? (
        <div role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">
          <p>{step.message}</p>
          <Link href="/login" className="mt-3 inline-block font-semibold underline underline-offset-4">
            Back to sign-in
          </Link>
        </div>
      ) : null}

      {step.kind === "enroll" ? (
        <div className="mb-6 rounded-card border border-hairline bg-white p-4 sm:p-5">
          <p className="text-sm leading-6 text-secondary">
            Scan this QR code with your authenticator app, or enter the setup key manually.
          </p>
          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="shrink-0 rounded-field border border-hairline-strong bg-white p-2 shadow-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.qr} alt="TOTP enrollment QR code" width={200} height={200} />
            </div>
            <div className="min-w-0 flex-1 rounded-field bg-field p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Setup key</p>
              <code className="mt-2 block break-all text-sm font-semibold leading-6 text-ink">
                {step.secret}
              </code>
            </div>
          </div>
        </div>
      ) : null}

      {step.kind === "enroll" || step.kind === "challenge" ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <div>
            <label htmlFor="mfa-code" className="block text-sm font-semibold text-ink">
              Six-digit code
            </label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              disabled={pending}
              aria-describedby="mfa-code-help"
              className={`${authInputClassName} text-center font-mono text-xl font-semibold tracking-[0.35em]`}
            />
            <p id="mfa-code-help" className="mt-2 text-xs leading-5 text-muted">
              Enter the current code shown in your authenticator app.
            </p>
          </div>
          <Button
            type="submit"
            variant="cta"
            size="lg"
            disabled={pending || code.length !== 6}
            className="w-full"
          >
            {pending ? "Verifying…" : "Verify"}
          </Button>
        </form>
      ) : null}
    </AuthShell>
  );
}
