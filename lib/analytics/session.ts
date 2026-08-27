/**
 * First-party analytics session (CP5). The `sid` cookie is httpOnly — browser
 * JS never reads it; the server stamps `session_id` for both client and server
 * events (no client/server drift, no client-supplied session identity).
 * Classified `functional` pending the D19 consent decision (consent-gate doc);
 * PostHog forwarding stays OFF. Constants only — client-safe.
 */

export const SESSION_COOKIE = "sid";

/** 30-min inactivity window (PRD §16). Refreshed server-side on each capture. */
export const SESSION_MAX_AGE_SECONDS = 30 * 60;

/** Header the proxy uses to forward the trusted server-origin session id. */
export const SESSION_FORWARD_HEADER = "x-events-session";

/** Session ids are server-minted UUIDs. Reject arbitrary cookie/header values. */
export function isValidSessionId(value: string | null | undefined): value is string {
  return value !== null && value !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** consent_class stamped on every Slice-1 event. */
export const CONSENT_CLASS = "functional";
