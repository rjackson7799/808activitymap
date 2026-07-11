/** Deterministic seed UUIDs (supabase/seed.sql is the source of truth). */

export const ORG = {
  ramen: "a0000000-0000-4000-8000-000000000001",
  sushi: "a0000000-0000-4000-8000-000000000002",
  coffee: "a0000000-0000-4000-8000-000000000003",
} as const;

export const LOC = {
  ramen: "b0000000-0000-4000-8000-000000000001",
  sushi: "b0000000-0000-4000-8000-000000000002",
  coffee: "b0000000-0000-4000-8000-000000000003",
} as const;

export const LISTING = {
  /** Reference fixture: published EN+JA, menu published EN/JA w/ evidence. */
  ramen: "c0000000-0000-4000-8000-000000000001",
  /** Published EN+JA, no menu ("menu coming soon"). */
  sushi: "c0000000-0000-4000-8000-000000000002",
  /** Draft; JA is machine_draft — must never serve. */
  coffee: "c0000000-0000-4000-8000-000000000003",
} as const;

export const CATEGORY = {
  dining: "e0000000-0000-4000-8000-000000000001",
  activitiesHidden: "e0000000-0000-4000-8000-000000000002",
  ramen: "e0000000-0000-4000-8000-000000000011",
  sushi: "e0000000-0000-4000-8000-000000000012",
  cafe: "e0000000-0000-4000-8000-000000000013",
  izakaya: "e0000000-0000-4000-8000-000000000014",
  surfHidden: "e0000000-0000-4000-8000-000000000021",
} as const;

export const MEDIA = {
  ramenPhoto1: "f0000000-0000-4000-8000-000000000001",
  ramenPhoto2: "f0000000-0000-4000-8000-000000000002",
  ramenMenuSource: "f0000000-0000-4000-8000-000000000003",
  ramenEvidenceEn: "f0000000-0000-4000-8000-000000000004",
  ramenEvidenceJa: "f0000000-0000-4000-8000-000000000005",
  sushiPhoto: "f0000000-0000-4000-8000-000000000006",
  coffeePhotoPending: "f0000000-0000-4000-8000-000000000007",
} as const;

export const MENU = {
  document: "90000000-0000-4000-8000-000000000001",
  version1: "91000000-0000-4000-8000-000000000001",
  mvlEn: "92000000-0000-4000-8000-000000000001",
  mvlJa: "92000000-0000-4000-8000-000000000002",
  mvlKo: "92000000-0000-4000-8000-000000000003",
  sectionRamen: "93000000-0000-4000-8000-000000000001",
  itemTonkotsu: "94000000-0000-4000-8000-000000000001",
  itemPoke: "94000000-0000-4000-8000-000000000004",
} as const;

export const ACTOR = {
  admin: "99000000-0000-4000-8000-000000000001",
  publisher: "99000000-0000-4000-8000-000000000002",
  reviewerJa: "99000000-0000-4000-8000-000000000003",
} as const;

export interface Blocker {
  blocker_code: string;
  detail: Record<string, unknown>;
}

export const blockerCodes = (blockers: Blocker[]) =>
  blockers.map((b) => b.blocker_code);
