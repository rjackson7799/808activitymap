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

/** consent_class stamped on every Slice-1 event. */
export const CONSENT_CLASS = "functional";
