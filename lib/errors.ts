import type { AuthzError, AuthzReason } from "./auth/claims";

/**
 * Shared error mapping (CP3): raw Postgres / PostgREST / authz failures →
 * user-facing, machine-tagged results. Consumed by BOTH taxonomy and
 * publishing server actions so the "clean surfaced validation error" and the
 * publish-gate messages are produced in exactly one place.
 *
 * Reads errors STRUCTURALLY, never via `instanceof`, because the two surfaces
 * differ:
 *  - supabase-js resolves `{ error: PostgrestError }` (no throw): SQLSTATE in
 *    `.code`, the constraint name only in `.message` / `.details`.
 *  - postgres.js THROWS an Error carrying `.code` + `.constraint_name`.
 * Custom plpgsql `RAISE EXCEPTION` all share SQLSTATE `P0001`, so those cases
 * are distinguished by a token at the head of the message (the guarded fns
 * raise `code: detail` — e.g. `aal2_required: …`, `publication_blocked: […]`).
 */

export interface MappedError {
  /** Stable machine code for tests, telemetry and UI branching. */
  code: string;
  /** User-facing message — no secrets, no raw SQL, no constraint names. */
  message: string;
  /** Present when the failure maps to a specific form field. */
  field?: string;
  /** Structured blockers when `code === 'publication_blocked'`. */
  blockers?: Array<{ code: string; detail?: unknown }>;
}

interface RawDbError {
  code?: unknown;
  message?: unknown;
  constraint_name?: unknown;
  details?: unknown;
  detail?: unknown;
}

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

/** Constraint name → the form field a duplicate on it should blame. */
const UNIQUE_CONSTRAINT_FIELDS: Record<string, { field: string; message: string }> = {
  category_locales_locale_slug_key: {
    field: "slug",
    message: "That slug is already used for this locale. Choose a different one.",
  },
};

/** A guarded-fn RAISE token → its mapping. Order matters (first match wins). */
function mapRaiseMessage(message: string): MappedError | null {
  if (message.includes("aal2_required")) {
    return {
      code: "aal2_required",
      message: "Re-verify with your authenticator app to continue (two-factor step-up required).",
    };
  }
  if (message.includes("publication_blocked")) {
    return {
      code: "publication_blocked",
      ...describeBlockers(message),
    };
  }
  if (message.includes("menu_evidence_missing")) {
    return {
      code: "menu_evidence_missing",
      message:
        "This menu can't be approved yet — attach the signed approval evidence document, approver and date first.",
    };
  }
  if (message.includes("menu_rights_unlinked")) {
    return {
      code: "menu_rights_unlinked",
      message: "This menu's source document has no recorded usage rights — record them before approving.",
    };
  }
  if (message.includes("approval_type")) {
    return {
      code: "approval_type_required",
      message: "Recording an external vendor approval requires the written-approval evidence.",
    };
  }
  if (message.includes("invalid_transition")) {
    return {
      code: "invalid_transition",
      message: "That change isn't allowed from the current state — refresh and try again.",
    };
  }
  if (message.includes("business_inquiry_status_unchanged")) {
    return {
      code: "status_unchanged",
      message: "That inquiry already has the selected status. Refresh and try again.",
    };
  }
  if (message.includes("business_inquiry_not_found")) {
    return {
      code: "not_found",
      message: "That inquiry is no longer available. Refresh the queue.",
    };
  }
  if (message.includes("permission_denied")) {
    return {
      code: "permission_denied",
      message: "You don't have permission to do that.",
    };
  }
  return null;
}

/** Parse the `publication_blocked: [ … ]` JSON tail; degrade gracefully. */
function describeBlockers(message: string): { message: string; blockers?: MappedError["blockers"] } {
  const start = message.indexOf("[");
  if (start === -1) return { message: "This page can't be published yet — resolve the blockers and retry." };
  try {
    const parsed = JSON.parse(message.slice(start)) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not an array");
    const blockers = parsed
      .filter((b): b is { code: string; detail?: unknown } => typeof (b as { code?: unknown })?.code === "string")
      .map((b) => ({ code: b.code, detail: b.detail }));
    if (blockers.length === 0) throw new Error("no blockers");
    const codes = blockers.map((b) => b.code).join(", ");
    return {
      message: `This page can't be published yet — resolve: ${codes}.`,
      blockers,
    };
  } catch {
    return { message: "This page can't be published yet — resolve the blockers and retry." };
  }
}

export function mapDbError(err: unknown): MappedError {
  if (err === null || err === undefined || typeof err !== "object") {
    return { code: "unknown", message: "Something went wrong. Please try again." };
  }
  const e = err as RawDbError;
  const code = asString(e.code);
  const message = asString(e.message);
  const constraint = asString(e.constraint_name);

  // Unique violations (23505): key off the constraint name (postgres.js) or
  // its appearance in the message (PostgREST).
  if (code === "23505" || message.includes("duplicate key value")) {
    for (const [name, mapping] of Object.entries(UNIQUE_CONSTRAINT_FIELDS)) {
      if (constraint === name || message.includes(name)) {
        return { code: "duplicate_slug", field: mapping.field, message: mapping.message };
      }
    }
    return { code: "duplicate", message: "That value is already in use." };
  }

  // Custom plpgsql RAISEs (all P0001) — distinguish by message token.
  const raised = mapRaiseMessage(message);
  if (raised) return raised;

  return { code: "unknown", message: "Something went wrong. Please try again." };
}

const AUTHZ_MESSAGES: Record<AuthzReason, string> = {
  unauthenticated: "Please sign in to continue.",
  forbidden: "You don't have permission to do that.",
  aal2_required: "Re-verify with your authenticator app to continue (two-factor step-up required).",
};

export function mapAuthzError(err: AuthzError): MappedError {
  return { code: err.reason, message: AUTHZ_MESSAGES[err.reason] };
}
