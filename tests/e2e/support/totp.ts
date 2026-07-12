import { createHmac } from "node:crypto";

/**
 * RFC-6238 TOTP (SHA-1, 30s, 6 digits) — the same pure helper `smoke-auth.ts`
 * uses, so E2E can drive MFA with no authenticator app: enroll a factor via
 * the API in global-setup, save the secret, and compute codes locally.
 */

function base32Decode(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totp(secret: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  const code =
    (((digest[offset]! & 0x7f) << 24) |
      (digest[offset + 1]! << 16) |
      (digest[offset + 2]! << 8) |
      digest[offset + 3]!) %
    1_000_000;
  return code.toString().padStart(6, "0");
}

/** Seconds remaining in the current 30s TOTP step. */
export function secondsLeftInStep(at: number = Date.now()): number {
  return 30 - (Math.floor(at / 1000) % 30);
}
