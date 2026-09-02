import "server-only";

import { lookup } from "node:dns/promises";
import { createSupabaseServiceClient } from "@/lib/auth/server";
import { isPublicNetworkAddress, validateAffiliateDestination } from "./url";

export interface ResolvedAffiliateLink {
  destinationUrl: string;
  partnerKey: string;
  context: string;
  listingId: string;
}

export async function resolveAffiliateClickout(id: string, locale: string): Promise<ResolvedAffiliateLink | null> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db.rpc("resolve_affiliate_clickout", { p_link_id: id, p_locale: locale });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as {
    destination_url?: string; partner_key?: string; context?: string; listing_id?: string;
  } | null;
  if (!row?.destination_url || !row.partner_key || !row.context || !row.listing_id) return null;
  return { destinationUrl: row.destination_url, partnerKey: row.partner_key, context: row.context, listingId: row.listing_id };
}

async function assertPublicHost(url: URL): Promise<void> {
  const answers = await lookup(url.hostname, { all: true, verbatim: true });
  if (answers.length === 0 || answers.some(({ address }) => !isPublicNetworkAddress(address))) {
    throw new Error("non_public_destination");
  }
}

async function probe(raw: string): Promise<{ healthy: boolean; status: number | null }> {
  let current = raw;
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const parsed = validateAffiliateDestination(current);
      if (!parsed.ok) throw new Error(parsed.error);
      await assertPublicHost(parsed.url);
      let response = await fetch(parsed.url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(7000) });
      if (response.status === 405) {
        response = await fetch(parsed.url, { method: "GET", headers: { Range: "bytes=0-0" }, redirect: "manual", signal: AbortSignal.timeout(7000) });
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) return { healthy: false, status: response.status };
        current = new URL(location, parsed.url).toString();
        continue;
      }
      return { healthy: response.status < 500 && response.status !== 404 && response.status !== 410, status: response.status };
    }
  } catch { /* recorded as an unreachable link; never expose network details */ }
  return { healthy: false, status: null };
}

export async function checkDueAffiliateLinks(limit = 20): Promise<{ checked: number; dead: number }> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db.rpc("list_due_affiliate_links", { p_limit: limit });
  if (error) throw error;
  const links = (data ?? []) as Array<{ id: string; destination_url: string }>;
  let cursor = 0;
  let dead = 0;
  async function worker() {
    while (cursor < links.length) {
      const link = links[cursor++];
      if (!link) return;
      const result = await probe(link.destination_url);
      const { data: status, error: recordError } = await db.rpc("record_affiliate_link_health", {
        p_link_id: link.id, p_http_status: result.status, p_healthy: result.healthy,
      });
      if (recordError) throw recordError;
      if (status === "dead") dead += 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, links.length) }, () => worker()));
  return { checked: links.length, dead };
}
