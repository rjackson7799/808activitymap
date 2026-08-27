import { loadTestEnv } from "./env";
loadTestEnv();

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { LISTING } from "./fixtures";
import { getListingDTO } from "@/lib/public-read/queries";
import { breadcrumbJsonLd, restaurantJsonLd } from "@/lib/schema";
import { categoryPath, homePath, listingPath } from "@/lib/public-read/paths";

/**
 * schema.org golden fixtures (CP4). Rendered from the REAL reference listing (seed A) via
 * the read model, so goldens track the actual data. Deterministic: the schema render
 * ignores provenance (the only per-run-varying field), and the env-specific image host is
 * normalized to a stable token. Regenerate with UPDATE_GOLDENS=1; a structural sanity
 * check guards @context/@type/name even when the golden is regenerated.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) throw new Error("schema-golden needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
const client: SupabaseClient = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ORIGIN = "https://example.portal";
const STABLE_IMAGE_HOST = "https://images.example";
const UPDATE = process.env.UPDATE_GOLDENS === "1";

function normalize(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj).split(SUPABASE_URL!).join(STABLE_IMAGE_HOST));
}

function goldenFile(name: string): string {
  return resolve(import.meta.dirname, "__goldens__", `${name}.json`);
}

function checkGolden(name: string, obj: unknown): void {
  const json = `${JSON.stringify(obj, null, 2)}\n`;
  const file = goldenFile(name);
  if (UPDATE) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, json);
    return;
  }
  expect(existsSync(file), `missing golden "${name}" — run UPDATE_GOLDENS=1 to create it`).toBe(true);
  expect(json).toBe(readFileSync(file, "utf8"));
}

function sanity(obj: Record<string, unknown>): void {
  expect(obj["@context"]).toBe("https://schema.org");
  expect(typeof obj["@type"]).toBe("string");
}

describe("schema.org goldens — reference listing A (ramen)", () => {
  it("Restaurant JSON-LD (EN)", async () => {
    const dto = await getListingDTO(client, "en", LISTING.ramen);
    expect(dto).not.toBeNull();
    const node = restaurantJsonLd(dto!, { origin: ORIGIN });
    sanity(node);
    expect(node.name).toBe("Aloha Ramen Hale");
    expect(node["@type"]).toBe("Restaurant");
    checkGolden("restaurant-en", normalize(node));
  });

  it("Restaurant JSON-LD (JA) — native content, no leakage", async () => {
    const dto = await getListingDTO(client, "ja", LISTING.ramen);
    expect(dto).not.toBeNull();
    const node = restaurantJsonLd(dto!, { origin: ORIGIN });
    sanity(node);
    expect(node.name).toBe("アロハ・ラーメン・ハレ");
    const json = JSON.stringify(node);
    expect(json).not.toContain("MACHINE_DRAFT");
    expect(json).not.toContain("aloha-approval"); // no evidence
    checkGolden("restaurant-ja", normalize(node));
  });

  it("BreadcrumbList JSON-LD (EN): Home › Ramen › listing", async () => {
    const dto = await getListingDTO(client, "en", LISTING.ramen);
    const crumbs = [
      { name: "Home", path: homePath("en") },
      { name: dto!.primaryCategory.label, path: categoryPath("en", dto!.primaryCategory.slug) },
      { name: dto!.name, path: listingPath("en", dto!.slug) },
    ];
    const node = breadcrumbJsonLd(crumbs, { origin: ORIGIN });
    sanity(node);
    checkGolden("breadcrumb-en", node);
  });
});
