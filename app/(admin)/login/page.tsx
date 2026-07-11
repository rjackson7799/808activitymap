"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

/**
 * Staff sign-in (Slice 1 bounded auth, ADR-001): email + password, then the
 * TOTP step at /login/mfa. No public signup, no magic link, no vendor
 * identities — those arrive in Slice 3. Minimal styling; the design system
 * lands in CP4. Brand strings come only from env (D27).
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>Staff sign-in</h1>
      <form action={formAction}>
        <label style={{ display: "block", marginTop: "1rem" }}>
          Email
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <label style={{ display: "block", marginTop: "1rem" }}>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            style={{ display: "block", width: "100%" }}
          />
        </label>
        {state.error ? (
          <p role="alert" style={{ color: "#b00020" }}>
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} style={{ marginTop: "1rem" }}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
