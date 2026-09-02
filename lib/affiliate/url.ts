import { isIP } from "node:net";

export type AffiliateUrlResult = { ok: true; url: URL } | { ok: false; error: string };

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a! >= 224 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

export function isPublicNetworkAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !isPrivateIpv4(address);
  if (version !== 6) return false;
  const value = address.toLowerCase();
  if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value)) return false;
  if (value.startsWith("::ffff:")) return isPublicNetworkAddress(value.slice(7));
  return true;
}

export function validateAffiliateDestination(raw: string): AffiliateUrlResult {
  let url: URL;
  try { url = new URL(raw.trim()); }
  catch { return { ok: false, error: "Enter a valid HTTPS destination." }; }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    return { ok: false, error: "Affiliate destinations must use public HTTPS without credentials or a custom port." };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "Affiliate destinations must use a public internet host." };
  }
  if (isIP(host) && !isPublicNetworkAddress(host)) {
    return { ok: false, error: "Affiliate destinations must not use a private or reserved address." };
  }
  if (url.toString().length > 2000) return { ok: false, error: "Affiliate destinations must be 2,000 characters or fewer." };
  return { ok: true, url };
}
