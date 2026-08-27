import { createHmac } from "node:crypto";

/**
 * Analytics IP handling (CP5). We never store or rate-limit on a raw IP: the
 * client IP is coarsened (IPv6 → /64 network) and then HMAC-SHA256'd with a
 * secret pepper, so the stored `subject` is not reversible by enumeration (a
 * plain hash of the 32-bit IPv4 / 64-bit space is trivially reversible). The
 * hash is the 90-day `retention_days.ip_abuse` obligation.
 */

/**
 * The client IP is the LEFTMOST entry of x-forwarded-for (the original client;
 * subsequent hops are proxies). This trusts the platform to prepend the real
 * client IP — documented as the trusted-hop assumption in the consent-gate doc.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * Coarsen an IP for bucketing: IPv4 unchanged; IPv6 reduced to its /64 network
 * (first 4 hextets), expanding a `::` abbreviation first. Best-effort — malformed
 * input returns the trimmed original.
 */
export function normalizeIp(ip: string): string {
  const bare = ip.split("%")[0]!.trim(); // strip any zone id
  if (!bare.includes(":")) return bare; // IPv4

  const [headRaw, tailRaw] = bare.split("::");
  const head = headRaw ? headRaw.split(":").filter(Boolean) : [];
  const tail = tailRaw !== undefined ? (tailRaw ? tailRaw.split(":").filter(Boolean) : []) : null;

  let hextets: string[];
  if (tail === null) {
    hextets = head; // no `::`
  } else {
    const missing = Math.max(0, 8 - head.length - tail.length);
    hextets = [...head, ...Array<string>(missing).fill("0"), ...tail];
  }
  if (hextets.length < 4) return bare; // malformed
  // Canonicalize each hextet (strip leading zeros) so equivalent
  // representations of the same address bucket to the same subject.
  const canon = hextets.slice(0, 4).map((h) => {
    const n = parseInt(h, 16);
    return Number.isNaN(n) ? "0" : n.toString(16);
  });
  return canon.join(":") + "::/64";
}

/** HMAC-SHA256 the normalized IP with the pepper. Deterministic; not reversible. */
export function hashIp(ip: string, pepper: string): string {
  return createHmac("sha256", pepper).update(normalizeIp(ip)).digest("hex");
}
