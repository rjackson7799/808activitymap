/**
 * Browser security baseline shared by public, admin, and API responses.
 *
 * Next.js currently requires inline bootstrap scripts and styles, so the CSP
 * permits those while retaining the high-value navigation, embedding, object,
 * and connection boundaries. Supabase is the only browser-side remote origin
 * used by the current product (admin authentication).
 */
export function createSecurityHeaders(
  appEnv: string | undefined,
): { key: string; value: string }[] {
  const localSources = appEnv === "production" ? "" : " http://127.0.0.1:* http://localhost:*";
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${localSources}`,
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${localSources}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
}
