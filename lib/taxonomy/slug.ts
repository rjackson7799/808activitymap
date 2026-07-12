/**
 * Category-slug normalization + validation (CP3).
 *
 * Slugs are stored NFC-normalized and decoded (native-script JA/KO allowed),
 * mirroring migration 13's posture for slug_aliases where a DB trigger
 * normalizes. Normalizing on input keeps the unique(locale, slug) comparison
 * canonical, so NFD and NFC spellings of the same word collide as intended.
 * Pure — no I/O — so it is unit-tested and reused by the taxonomy actions.
 */

export function normalizeCategorySlug(input: string): string {
  return input.trim().normalize("NFC");
}

export type SlugValidation = { ok: true; value: string } | { ok: false; reason: string };

// Route-unsafe characters: whitespace and path separators. Native scripts are
// allowed (stored decoded); percent-encoding happens at render time.
const UNSAFE = /[\s/\\?#]/u;

// Reserved route segments (CP4): a category slug must not shadow the public URL scheme
// — `/spot/` (listings), `/c`, the locale prefixes, and the admin/api surfaces.
const RESERVED = new Set(["spot", "c", "en", "ja", "ko", "admin", "login", "api", "_next"]);

export function validateCategorySlug(input: string): SlugValidation {
  const value = normalizeCategorySlug(input);
  if (value === "") return { ok: false, reason: "A slug is required." };
  if (UNSAFE.test(value)) {
    return { ok: false, reason: "A slug can't contain spaces or slashes." };
  }
  if (RESERVED.has(value.toLowerCase())) {
    return { ok: false, reason: "That slug is reserved — choose another." };
  }
  return { ok: true, value };
}
