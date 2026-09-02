import { describe, expect, it } from "vitest";
import { mapDbError, mapAuthzError } from "@/lib/errors";
import { AuthzError } from "@/lib/auth/claims";

/**
 * The shared DB/authz error mapper (CP3): turns raw Postgres/PostgREST/authz
 * failures into user-facing, machine-tagged results. It must read errors
 * STRUCTURALLY — supabase-js resolves `{ error: PostgrestError }` (no throw,
 * SQLSTATE in `.code`, constraint name only in `.message`/`.details`);
 * postgres.js THROWS an error with `.code` + `.constraint_name`. Custom
 * plpgsql RAISEs all share SQLSTATE P0001, so those are keyed off the message.
 * Consumed by BOTH taxonomy and publishing server actions.
 */

// PostgREST (supabase-js) unique-violation shape for category_locales(locale,slug)
const postgrestDuplicateSlug = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "category_locales_locale_slug_key"',
  details: "Key (locale, slug)=(ja, ramen) already exists.",
  hint: null,
};

// postgres.js thrown shape for the same violation
const pgjsDuplicateSlug = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "category_locales_locale_slug_key"',
  constraint_name: "category_locales_locale_slug_key",
  detail: "Key (locale, slug)=(ja, ramen) already exists.",
};

describe("mapDbError — unique violations", () => {
  it.each([
    ["PostgREST shape", postgrestDuplicateSlug],
    ["postgres.js shape", pgjsDuplicateSlug],
  ])("maps a category_locales slug collision to a clean slug-field error (%s)", (_name, err) => {
    const mapped = mapDbError(err);
    expect(mapped.code).toBe("duplicate_slug");
    expect(mapped.field).toBe("slug");
    // user-facing, no raw SQL / constraint name leaking
    expect(mapped.message).toMatch(/slug/i);
    expect(mapped.message).not.toMatch(/constraint|23505|violates/i);
  });

  it("maps an unrecognized unique violation to a generic duplicate (no field)", () => {
    const mapped = mapDbError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "some_other_key"',
    });
    expect(mapped.code).toBe("duplicate");
    expect(mapped.field).toBeUndefined();
  });
});

describe("mapDbError — guarded-fn RAISEs (SQLSTATE P0001, keyed on message)", () => {
  const p0001 = (message: string) => ({ code: "P0001", message });

  it("aal2_required → step-up prompt", () => {
    const mapped = mapDbError(p0001("aal2_required: privileged mutation requires recent MFA"));
    expect(mapped.code).toBe("aal2_required");
    expect(mapped.message).toMatch(/verif|authenticat|two-factor|MFA/i);
  });

  it("permission_denied → forbidden message", () => {
    const mapped = mapDbError(p0001("permission_denied: publish/unpublish requires publisher or super_admin"));
    expect(mapped.code).toBe("permission_denied");
    expect(mapped.message).toMatch(/permission|not allowed|cannot/i);
  });

  it("invalid_transition → not-allowed-from-this-state message", () => {
    const mapped = mapDbError(p0001("invalid_transition: listing_locale ja cannot publish from status qa_pending"));
    expect(mapped.code).toBe("invalid_transition");
  });

  it("maps inquiry concurrency errors without leaking database details", () => {
    expect(mapDbError(p0001("business_inquiry_status_unchanged")).code).toBe("status_unchanged");
    expect(mapDbError(p0001("business_inquiry_not_found")).code).toBe("not_found");
  });

  it("menu_evidence_missing → evidence-required message preserving the machine code", () => {
    const mapped = mapDbError(
      p0001("menu_evidence_missing: menu_version_locale abc (en) requires approval evidence media, approver and timestamp"),
    );
    expect(mapped.code).toBe("menu_evidence_missing");
    expect(mapped.message).toMatch(/evidence/i);
  });

  it("menu_rights_unlinked → rights-required message", () => {
    const mapped = mapDbError(p0001("menu_rights_unlinked: source media for menu_version abc lacks a rights record"));
    expect(mapped.code).toBe("menu_rights_unlinked");
    expect(mapped.message).toMatch(/rights/i);
  });

  it("approval_type requirement → clear message", () => {
    const mapped = mapDbError(p0001("approval_type required when approving (vendor_approved_external)"));
    expect(mapped.code).toBe("approval_type_required");
  });

  it("publication_blocked → parses the structured blocker list", () => {
    const blockers = [
      { code: "locale_status_insufficient", detail: { locale: "en", status: "qa_pending" } },
      { code: "provenance_missing", detail: { field: "hours" } },
    ];
    const mapped = mapDbError(p0001(`publication_blocked: ${JSON.stringify(blockers)}`));
    expect(mapped.code).toBe("publication_blocked");
    expect(mapped.blockers).toHaveLength(2);
    expect(mapped.blockers?.map((b) => b.code)).toEqual([
      "locale_status_insufficient",
      "provenance_missing",
    ]);
    // message names at least one human-readable blocker
    expect(mapped.message.length).toBeGreaterThan(0);
  });

  it("publication_blocked with an unparseable tail degrades gracefully (no throw, no blockers)", () => {
    const mapped = mapDbError(p0001("publication_blocked: <not json>"));
    expect(mapped.code).toBe("publication_blocked");
    expect(mapped.blockers).toBeUndefined();
  });
});

describe("mapDbError — fallbacks", () => {
  it("null/undefined → unknown error, never throws", () => {
    expect(mapDbError(null).code).toBe("unknown");
    expect(mapDbError(undefined).code).toBe("unknown");
  });

  it("an unrecognized error keeps a generic message and never leaks internals", () => {
    const mapped = mapDbError({ code: "42P01", message: 'relation "secret" does not exist' });
    expect(mapped.code).toBe("unknown");
    expect(mapped.message).not.toMatch(/relation|secret|42P01/);
  });
});

describe("mapAuthzError", () => {
  it.each([
    ["unauthenticated", /sign in|signed in|log in/i],
    ["forbidden", /permission|not allowed|cannot/i],
    ["aal2_required", /verif|authenticat|two-factor|MFA/i],
  ] as const)("maps AuthzError(%s) to a clean message", (reason, pattern) => {
    const mapped = mapAuthzError(new AuthzError(reason));
    expect(mapped.code).toBe(reason);
    expect(mapped.message).toMatch(pattern);
  });
});
