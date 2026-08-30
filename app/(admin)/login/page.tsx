"use client";

import { useActionState } from "react";
import { AuthShell, authInputClassName } from "@/components/admin/AuthShell";
import { Button } from "@/components/ui/button";
import { signIn, type LoginState } from "./actions";

/**
 * Staff sign-in (Slice 1 bounded auth, ADR-001): email + password, then the
 * TOTP step at /login/mfa. No public signup, no magic link, no vendor
 * identities — those arrive in Slice 3. Brand strings come only from env (D27).
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <AuthShell
      eyebrow="Staff portal"
      title="Staff sign-in"
      description="Use your staff credentials to manage verified listings and community information."
    >
      <form action={formAction} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-ink">
            Email address
          </label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="username"
            required
            disabled={pending}
            className={authInputClassName}
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-semibold text-ink">
            Password
          </label>
          <input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            disabled={pending}
            className={authInputClassName}
          />
        </div>
        {state.error ? (
          <p
            role="alert"
            className="rounded-field border border-error/20 bg-error-bg px-3.5 py-3 text-sm font-medium text-error"
          >
            {state.error}
          </p>
        ) : null}
        <Button type="submit" variant="cta" size="lg" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs leading-5 text-muted">
        Two-factor authentication is required after sign-in.
      </p>
    </AuthShell>
  );
}
