import { loadTestEnv } from "./env";
loadTestEnv();

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "./helpers";
import { CATEGORY, LISTING, LOC, MENU } from "./fixtures";
import {
  getCategoryDTO,
  getHomeDTO,
  getListingDTO,
  getServedLocaleSet,
  getSitemapRows,
  getTodayDTO,
  listEligiblePages,
  resolveListingSlug,
} from "@/lib/public-read/queries";

/**
 * Public read-model integration suite (CP4). Exercises the REAL query functions through
 * a service-role client (RLS bypassed — the read layer is the only boundary) against the
 * seed. Half of this suite is the BLOCKING negative leakage checks: canaries fed through
 * every DTO. Read-only except the one money-fallback case, which mutates+restores.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  throw new Error("public-read integration test needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (load .env.local / supabase status)");
}
const client: SupabaseClient = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Forbidden substrings that must never appear in ANY public DTO (seed canaries).
const CANARIES = [
  "MACHINE_DRAFT_TEXT_MUST_NOT_RENDER", // C/ja machine_draft seo_desc
  "機械翻訳ドラフト", // C/ja machine_draft name suffix
  "알로하 라멘 할레", // A/ko name (KO never serves)
  "aloha-ramen-menu.pdf", // menu-source path
  "aloha-approval-en.pdf", // evidence path
  "aloha-approval-ja.pdf",
  "SEED-AGR-001", // rights agreement ref
  "vendor_agreement_v1", // rights license
  "Aloha Ramen Hale LLC", // org legal_name
  "onboarding_form", // provenance source_type
  "hours_confirmation",
  "in_person_visit",
];

function assertNoCanaries(dto: unknown) {
  const json = JSON.stringify(dto);
  for (const canary of CANARIES) {
    expect(json, `DTO leaked forbidden substring: ${canary}`).not.toContain(canary);
  }
}

const LISTING_DTO_KEYS = [
  "id", "locale", "name", "slug", "seo", "editorialNote", "priceBand",
  "primaryCategory", "secondaryCategories", "address", "phone", "geo",
  "operationalStatus", "hours", "photos", "menu", "deals", "affiliateLinks", "provenance",
].sort();

describe("eligibility surface", () => {
  it("serves only EN + JA (KO fenced), and only published listings A + B", async () => {
    const served = await getServedLocaleSet(client);
    expect([...served].sort()).toEqual(["en", "ja"]);

    const pages = await listEligiblePages(client);
    const key = (p: { listingId: string; locale: string }) => `${p.listingId}|${p.locale}`;
    const keys = pages.map(key).sort();
    expect(keys).toEqual(
      [
        `${LISTING.ramen}|en`, `${LISTING.ramen}|ja`,
        `${LISTING.sushi}|en`, `${LISTING.sushi}|ja`,
      ].sort(),
    );
    // draft C and every KO row are absent.
    expect(keys.some((k) => k.startsWith(LISTING.coffee))).toBe(false);
    expect(keys.some((k) => k.endsWith("|ko"))).toBe(false);
  });
});

describe("weekly editorial read model", () => {
  it("serves reviewed EN/JA editions with an allowlisted shortlist and fences KO", async () => {
    const en = await getTodayDTO(client, "en");
    expect(en).toMatchObject({
      id: "85000000-0000-4000-8000-000000000001",
      locale: "en",
      title: "Two counters for an easy Waikīkī evening",
    });
    expect(en?.listings.map((listing) => listing.id)).toEqual([LISTING.ramen, LISTING.sushi]);
    expect(Object.keys(en ?? {}).sort()).toEqual(["body","dek","id","listings","locale","publishedAt","title","weekOf"]);
    assertNoCanaries(en);
    const ja = await getTodayDTO(client, "ja");
    expect(ja?.title).toBe("ワイキキで気軽に楽しむ、二つのカウンター");
    expect(ja?.listings[0]?.name).toBe("アロハ・ラーメン・ハレ");
    assertNoCanaries(ja);
    expect(await getTodayDTO(client, "ko")).toBeNull();
  });
});

describe("getListingDTO — listing A (reference fixture)", () => {
  it("assembles the EN DTO with only allowlisted keys and no leakage", async () => {
    const dto = await getListingDTO(client, "en", LISTING.ramen);
    expect(dto).not.toBeNull();
    expect(Object.keys(dto!).sort()).toEqual(LISTING_DTO_KEYS);
    expect(dto!.name).toBe("Aloha Ramen Hale");
    expect(dto!.slug).toBe("aloha-ramen-hale");
    expect(dto!.editorialNote).toContain("counter shop");
    expect(dto!.priceBand).toBe("$$");
    expect(dto!.primaryCategory).toEqual({ slug: "ramen", label: "Ramen" });
    expect(dto!.secondaryCategories.map((c) => c.slug)).toContain("izakaya");
    expect(dto!.photos.length).toBe(2);
    expect(dto!.menu?.sections.map((s) => s.name)).toEqual(["Ramen", "Sides"]);
    // Prices: fixed amount + market label (no number).
    const items = dto!.menu!.sections.flatMap((s) => s.items);
    expect(items.find((i) => i.name === "Tonkotsu Ramen")?.price).toBe("$16.50");
    expect(items.find((i) => i.name === "Catch of the Day Poke")?.price).toBe("Market price");
    // Provenance freshness: facts present, none stale (seed verified ~now).
    expect(dto!.provenance.facts.map((f) => f.label)).toContain("Hours");
    expect(dto!.provenance.anyStale).toBe(false);
    expect(dto!.provenance.badgeStatus).toBe("verified");
    assertNoCanaries(dto);
  });

  it("assembles the JA DTO with JA content, EN-alt fallback flagged, no EN prose leak", async () => {
    const dto = await getListingDTO(client, "ja", LISTING.ramen);
    expect(dto).not.toBeNull();
    expect(dto!.name).toBe("アロハ・ラーメン・ハレ");
    expect(dto!.slug).toBe("アロハラーメンハレ");
    // JA has no editorial note → omitted (never the EN prose).
    expect(dto!.editorialNote).toBeNull();
    // Menu renders in JA (JA published) with JA item names + localized market label.
    const items = dto!.menu!.sections.flatMap((s) => s.items);
    expect(items.find((i) => i.name === "豚骨ラーメン")?.price).toBe("$16.50");
    expect(items.find((i) => i.name === "本日のポケ")?.price).toBe("時価");
    // Photo 2 (f0…002) has EN alt only → QA'd EN fallback, flagged.
    const fallbackPhoto = dto!.photos.find((p) => p.altIsEnFallback);
    expect(fallbackPhoto?.alt).toBe("Counter seating at Aloha Ramen Hale");
    assertNoCanaries(dto);
  });
});

describe("getListingDTO — B (menu coming soon), C (draft), KO (fenced)", () => {
  it("B serves EN+JA with no menu", async () => {
    const en = await getListingDTO(client, "en", LISTING.sushi);
    expect(en?.menu).toBeNull();
    expect(en?.name).toBe("Waikiki Sushi Ten");
    assertNoCanaries(en);
    const ja = await getListingDTO(client, "ja", LISTING.sushi);
    expect(ja?.menu).toBeNull();
    assertNoCanaries(ja);
  });

  it("draft C never serves in any locale", async () => {
    expect(await getListingDTO(client, "en", LISTING.coffee)).toBeNull();
    expect(await getListingDTO(client, "ja", LISTING.coffee)).toBeNull();
  });

  it("KO never serves even for a published listing", async () => {
    expect(await getListingDTO(client, "ko", LISTING.ramen)).toBeNull();
  });
});

describe("slug + alias resolution", () => {
  it("resolves canonical slugs in both locales", async () => {
    expect(await resolveListingSlug(client, "en", "aloha-ramen-hale")).toEqual({
      kind: "canonical",
      listingId: LISTING.ramen,
    });
    expect(await resolveListingSlug(client, "ja", "アロハラーメンハレ")).toEqual({
      kind: "canonical",
      listingId: LISTING.ramen,
    });
  });

  it("301s a JA romanized alias to the native-script canonical (single hop)", async () => {
    expect(await resolveListingSlug(client, "ja", "aloha-ramen-hale")).toEqual({
      kind: "redirect",
      to: "/ja/spot/アロハラーメンハレ",
    });
  });

  it("does not resolve a canonical slug whose listing is not eligible (draft C)", async () => {
    expect(await resolveListingSlug(client, "en", "kona-coffee-corner")).toEqual({ kind: "not_found" });
  });

  it("returns not_found for an unknown slug", async () => {
    expect(await resolveListingSlug(client, "en", "nope")).toEqual({ kind: "not_found" });
  });
});

describe("category eligibility (primary-only) + hidden taxonomy", () => {
  it("ramen serves listing A", async () => {
    const cat = await getCategoryDTO(client, "en", "ramen");
    expect(cat?.label).toBe("Ramen");
    expect(cat?.listings.map((l) => l.slug)).toEqual(["aloha-ramen-hale"]);
    assertNoCanaries(cat);
  });

  it("cafes-coffee 404s (only draft C attaches)", async () => {
    expect(await getCategoryDTO(client, "en", "cafes-coffee")).toBeNull();
  });

  it("izakaya shows listing A (tagged as a secondary category — any-attachment rule)", async () => {
    const cat = await getCategoryDTO(client, "en", "izakaya");
    expect(cat?.listings.map((l) => l.slug)).toEqual(["aloha-ramen-hale"]);
  });

  it("hidden Activities + Surf Lessons never resolve", async () => {
    expect(await getCategoryDTO(client, "en", "activities")).toBeNull();
    expect(await getCategoryDTO(client, "en", "surf-lessons")).toBeNull();
  });

  it("resolves the JA native-script category slug", async () => {
    const cat = await getCategoryDTO(client, "ja", "ラーメン");
    expect(cat?.listings.map((l) => l.slug)).toEqual(["アロハラーメンハレ"]);
  });
});

describe("home + sitemap", () => {
  it("home lists only categories with ≥1 eligible primary listing", async () => {
    const home = await getHomeDTO(client, "en");
    const slugs = home.categories.map((c) => c.slug);
    expect(slugs).toContain("ramen");
    expect(slugs).toContain("sushi");
    expect(slugs).not.toContain("cafes-coffee"); // only draft C
    expect(slugs).toContain("izakaya"); // A is tagged to izakaya (secondary) — any-attachment rule
    expect(slugs).not.toContain("activities"); // hidden
  });

  it("sitemap contains publishable pages only — native-script canonicals, no KO, no aliases", async () => {
    const rows = await getSitemapRows(client);
    const paths = rows.map((r) => r.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/ja");
    expect(paths).toContain("/ramen");
    expect(paths).toContain("/spot/aloha-ramen-hale");
    expect(paths).toContain("/ja/spot/アロハラーメンハレ");
    // No romanized alias in the sitemap (canonical native slug only).
    expect(paths).not.toContain("/ja/spot/aloha-ramen-hale");
    // No KO paths.
    expect(paths.some((p) => p.startsWith("/ko"))).toBe(false);
  });
});

describe("money never falls back (menu status gate)", () => {
  it("a JA page whose JA menu is unapproved shows NO menu and no EN prices", async () => {
    try {
      await sql`update menu_version_locales set status = 'qa_pending' where id = ${MENU.mvlJa}`;
      const dto = await getListingDTO(client, "ja", LISTING.ramen);
      expect(dto).not.toBeNull();
      // The menu is absent entirely — prices/items come ONLY from the menu, so a null
      // menu is the money-no-fallback guarantee. (豚骨ラーメン legitimately appears in the
      // JA SEO title, so we assert on the menu + prices, not that raw string.)
      expect(dto!.menu).toBeNull();
      const json = JSON.stringify(dto);
      expect(json).not.toContain("$16.50"); // no price fell back from any locale
      expect(json).not.toContain("Tonkotsu Ramen"); // no EN menu item name leaked
    } finally {
      await sql`update menu_version_locales set status = 'published' where id = ${MENU.mvlJa}`;
    }
    // Restoration verified so a shared-DB rerun isn't poisoned.
    const restored = await sql`select status from menu_version_locales where id = ${MENU.mvlJa}`;
    expect(restored[0]?.status).toBe("published");
  });
});

describe("operational_status exclusion (owner decision 2026-07-12)", () => {
  it("a suspended venue disappears from the whole public surface (eligibility, listing, category)", async () => {
    try {
      await sql`update public.locations set operational_status = 'suspended' where id = ${LOC.sushi}`;
      const pages = await listEligiblePages(client);
      expect(pages.some((p) => p.listingId === LISTING.sushi)).toBe(false); // gone from eligibility
      expect(await getListingDTO(client, "en", LISTING.sushi)).toBeNull(); // listing 404
      expect(await getCategoryDTO(client, "en", "sushi")).toBeNull(); // B was the only sushi listing → 404
    } finally {
      await sql`update public.locations set operational_status = 'active' where id = ${LOC.sushi}`;
    }
    const restored = await sql`select operational_status from public.locations where id = ${LOC.sushi}`;
    expect(restored[0]?.operational_status).toBe("active");
  });
});

afterAll(async () => {
  // integration client has no persistent connection to close; sql pool is shared.
  void CATEGORY;
});
