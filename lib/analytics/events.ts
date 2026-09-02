import { z } from "zod";
import { LOCALES } from "@/lib/locales";

/**
 * Analytics event dictionary (PRD §16). The single typed contract for every
 * event the portal emits: canonical name, allowed capture `source`(s), a Zod
 * schema for the event-specific `props`, and whether it is listing-scoped.
 *
 * `market_id` and `locale` are ALWAYS-present columns on the `events` table
 * (PRD §16 "always market_id, locale"), stamped server-side — they are NOT
 * props and never appear here.
 *
 * `status` gates emission: only `implemented` events may be emitted. The
 * ingestion route + a unit test forbid emitting `planned` events; `planned`
 * entries are the drafted contract for later slices (their prop schemas are
 * provisional and versioned when the event is implemented).
 *
 * CLIENT-SAFE: this module imports only `zod` and the locale allowlist. It
 * MUST NOT import `server-only` or any DB client — the client emitter
 * (`lib/analytics/client.ts`) imports it. The server insert helper lives
 * separately in `lib/analytics/emit.ts`.
 */

export const EVENT_STATUSES = ["planned", "implemented", "deprecated"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_SOURCES = ["client", "server"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export interface EventDef {
  status: EventStatus;
  /** Capture channels permitted to emit this event. */
  source: readonly EventSource[];
  /** Event-specific properties (beyond the standard market_id/locale columns). */
  props: z.ZodType;
  /** True when the event is about a specific listing (populates listing_id). */
  listingScoped: boolean;
}

const localeSchema = z.enum(LOCALES);

// Widened array types (not tuples) so `.includes(source)` accepts any EventSource.
const SERVER: readonly EventSource[] = ["server"];
const CLIENT: readonly EventSource[] = ["client"];
const SERVER_AND_CLIENT: readonly EventSource[] = ["server", "client"];

export const EVENT_REGISTRY = {
  // ── Implemented (Slice 1) ───────────────────────────────────────────────
  // Anonymous first-party session (30-min inactivity), minted server-side.
  session_start: {
    status: "implemented",
    source: SERVER,
    props: z.strictObject({}),
    listingScoped: false,
  },
  // Server render is authoritative (ad-blocker-resistant, PRD §16); the
  // client copy is corroborating enrichment only (source='client').
  listing_view: {
    status: "implemented",
    source: SERVER_AND_CLIENT,
    props: z.strictObject({ slug: z.string().min(1).optional() }),
    listingScoped: true,
  },
  // Menu section scrolled into viewport ≥1s (not page load).
  menu_view: {
    status: "implemented",
    source: CLIENT,
    props: z.strictObject({ section_id: z.uuid().optional() }),
    listingScoped: true,
  },
  // Planned: the Slice-1 menu is rendered inline (name/description/price all
  // visible, JS-free), so there is no expand affordance to tap. Reclassify to
  // implemented when an expandable-menu UI ships (keeps the JS-free
  // price-visibility contract intact — see nojs pass).
  menu_item_expand: {
    status: "planned",
    source: CLIENT,
    props: z.strictObject({ item_id: z.uuid() }),
    listingScoped: true,
  },
  language_switch: {
    status: "implemented",
    source: CLIENT,
    props: z.strictObject({ from: localeSchema, to: localeSchema }),
    listingScoped: false,
  },
  // Replaces save_share_action (D7); no save events (D6).
  share_click: {
    status: "implemented",
    source: CLIENT,
    props: z.strictObject({ method: z.enum(["native", "copy", "line", "x", "facebook"]) }),
    listingScoped: true,
  },
  // Outbound map link tap; carries the map provider + destination listing.
  direction_click: {
    status: "implemented",
    source: CLIENT,
    props: z.strictObject({ provider: z.string().min(1).optional() }),
    listingScoped: true,
  },

  // ── Planned (later slices — drafted contract, NOT emittable) ─────────────
  deal_reveal: {
    status: "implemented", // unique per session per deal; recorded by reveal_active_deal (P0-9)
    source: SERVER,
    props: z.strictObject({ deal_id: z.uuid() }),
    listingScoped: true,
  },
  affiliate_clickout: {
    status: "implemented", // Slice 7 — server-side redirect endpoint
    source: SERVER,
    props: z.strictObject({ partner: z.string().min(1), context: z.string().optional() }),
    listingScoped: true,
  },
  today_note_view: {
    status: "implemented", // /today/ editorial (D5), visible for at least one second
    source: CLIENT,
    props: z.strictObject({ note_id: z.uuid() }),
    listingScoped: false,
  },
  report_change: {
    status: "implemented", // Phase 0 — emitted server-side after a stored correction
    source: SERVER,
    props: z.strictObject({}),
    listingScoped: true,
  },
  vendor_report_open: {
    status: "planned", // Slice 6 — explicit link click, not pixel
    source: CLIENT,
    props: z.strictObject({}),
    listingScoped: false,
  },
} satisfies Record<string, EventDef>;

export type EventName = keyof typeof EVENT_REGISTRY;

export const EVENT_NAMES = Object.keys(EVENT_REGISTRY) as EventName[];

export function isEventName(name: string): name is EventName {
  return Object.prototype.hasOwnProperty.call(EVENT_REGISTRY, name);
}

export function isImplemented(name: EventName): boolean {
  return EVENT_REGISTRY[name].status === "implemented";
}

export const IMPLEMENTED_EVENTS: EventName[] = EVENT_NAMES.filter(isImplemented);

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventValidationError";
  }
}

export interface ValidatedEvent {
  name: EventName;
  source: EventSource;
  props: Record<string, unknown>;
  listingScoped: boolean;
}

const envelopeSchema = z.object({
  name: z.string(),
  props: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Validate an incoming event against the dictionary for a given capture
 * source. Throws {@link EventValidationError} on: a malformed envelope, an
 * unknown name, a non-`implemented` event, a source the event does not permit
 * (source forgery — a client body can never yield a server-only event), or
 * props that fail the event's schema.
 */
export function parseEventInput(input: unknown, ctx: { source: EventSource }): ValidatedEvent {
  const envelope = envelopeSchema.safeParse(input);
  if (!envelope.success) {
    throw new EventValidationError("malformed event envelope");
  }
  const { name, props } = envelope.data;
  if (!isEventName(name)) {
    throw new EventValidationError(`unknown event: ${name}`);
  }
  const entry = EVENT_REGISTRY[name];
  if (entry.status !== "implemented") {
    throw new EventValidationError(`event not implemented: ${name}`);
  }
  if (!entry.source.includes(ctx.source)) {
    throw new EventValidationError(`event ${name} may not be emitted from source '${ctx.source}'`);
  }
  const parsedProps = entry.props.safeParse(props ?? {});
  if (!parsedProps.success) {
    throw new EventValidationError(`invalid props for ${name}`);
  }
  return {
    name,
    source: ctx.source,
    props: parsedProps.data as Record<string, unknown>,
    listingScoped: entry.listingScoped,
  };
}
