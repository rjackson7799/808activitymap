import type { EventName } from "./events";

/**
 * Client emitter (CP5). Fire-and-forget via navigator.sendBeacon — survives page
 * unload (language switch, outbound directions) and ignores the response. No-ops
 * where sendBeacon is unavailable, so it is safe to call unconditionally and
 * never affects a JS-free page. The session id rides the httpOnly `sid` cookie
 * (sent automatically, same-origin) and is stamped server-side — never sent from
 * here. Client-safe: imports only the dictionary types.
 */
export function emit(
  name: EventName,
  detail: { props?: Record<string, unknown>; locale?: string | null; listingId?: string | null } = {},
): void {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
  try {
    const body = JSON.stringify({
      name,
      props: detail.props ?? {},
      locale: detail.locale ?? undefined,
      listing_id: detail.listingId ?? undefined,
    });
    navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
  } catch {
    // best-effort: a beacon failure is analytics loss, never surfaced
  }
}
