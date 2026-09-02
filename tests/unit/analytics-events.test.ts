import { describe, expect, it } from "vitest";
import {
  EVENT_NAMES,
  EVENT_REGISTRY,
  EventValidationError,
  IMPLEMENTED_EVENTS,
  isImplemented,
  parseEventInput,
  type EventName,
} from "@/lib/analytics/events";

/**
 * The dictionary is the emission contract (PRD §16). These assertions pin the
 * two rules the ingestion + client layers depend on: only `implemented`
 * events are emittable, and a source cannot be forged.
 */

describe("event dictionary — status gate", () => {
  it("declares the implemented public foundation set", () => {
    expect(new Set(IMPLEMENTED_EVENTS)).toEqual(
      new Set<EventName>([
        "session_start",
        "listing_view",
        "menu_view",
        "language_switch",
        "share_click",
        "direction_click",
        "deal_reveal",
        "affiliate_clickout",
        "today_note_view",
        "report_change",
      ]),
    );
  });

  it("every registry entry has a valid status and at least one source", () => {
    for (const name of EVENT_NAMES) {
      const def = EVENT_REGISTRY[name];
      expect(["planned", "implemented", "deprecated"]).toContain(def.status);
      expect(def.source.length).toBeGreaterThan(0);
    }
  });

  it("keeps deferred events as `planned` (not emittable)", () => {
    for (const name of ["menu_item_expand"] as EventName[]) {
      expect(isImplemented(name)).toBe(false);
    }
  });

  it("accepts the one-second weekly editorial view contract", () => {
    const noteId = "85000000-0000-4000-8000-000000000001";
    expect(parseEventInput({ name: "today_note_view", props: { note_id: noteId } }, { source: "client" }))
      .toMatchObject({ name: "today_note_view", source: "client", listingScoped: false });
    expect(() => parseEventInput({ name: "today_note_view", props: { note_id: "not-a-uuid" } }, { source: "client" }))
      .toThrow(/invalid props/);
  });
});

describe("parseEventInput", () => {
  it("accepts a well-formed implemented client event", () => {
    const v = parseEventInput(
      { name: "share_click", props: { method: "line" } },
      { source: "client" },
    );
    expect(v.name).toBe("share_click");
    expect(v.source).toBe("client");
    expect(v.props).toEqual({ method: "line" });
    expect(v.listingScoped).toBe(true);
  });

  it("accepts the server listing_view (authoritative source)", () => {
    const v = parseEventInput(
      { name: "listing_view", props: { slug: "aloha-ramen-hale" } },
      { source: "server" },
    );
    expect(v.source).toBe("server");
    expect(v.props).toEqual({ slug: "aloha-ramen-hale" });
  });

  it("rejects an unknown event", () => {
    expect(() => parseEventInput({ name: "not_a_real_event" }, { source: "client" })).toThrow(
      EventValidationError,
    );
  });

  it("accepts the implemented server-only deal reveal contract", () => {
    const value = parseEventInput(
      { name: "deal_reveal", props: { deal_id: "00000000-0000-4000-8000-000000000001" } },
      { source: "server" },
    );
    expect(value).toMatchObject({ name: "deal_reveal", source: "server", listingScoped: true });
    expect(() => parseEventInput(
      { name: "deal_reveal", props: { deal_id: "00000000-0000-4000-8000-000000000001" } },
      { source: "client" },
    )).toThrow(/may not be emitted/);
  });

  it("accepts the server-only affiliate clickout contract", () => {
    const value = parseEventInput(
      { name: "affiliate_clickout", props: { partner: "demo-partner", context: "nearby_activity" } },
      { source: "server" },
    );
    expect(value).toMatchObject({ name: "affiliate_clickout", source: "server", listingScoped: true });
    expect(() => parseEventInput(
      { name: "affiliate_clickout", props: { partner: "demo-partner", context: "nearby_activity" } },
      { source: "client" },
    )).toThrow(/may not be emitted/);
  });

  it("rejects source forgery — a client body cannot yield a server-only event", () => {
    expect(() => parseEventInput({ name: "session_start" }, { source: "client" })).toThrow(
      /may not be emitted from source 'client'/,
    );
  });

  it("rejects a client attempt to post listing_view as server (no server-only via client channel)", () => {
    // listing_view allows both, but menu_view is client-only — a server caller
    // must not be able to forge an interaction event either.
    expect(() => parseEventInput({ name: "menu_view" }, { source: "server" })).toThrow(
      /may not be emitted from source 'server'/,
    );
  });

  it("rejects props that violate the event schema", () => {
    expect(() =>
      parseEventInput({ name: "share_click", props: { method: "smoke-signal" } }, { source: "client" }),
    ).toThrow(/invalid props/);
  });

  it("rejects unknown props (strict schemas)", () => {
    expect(() =>
      parseEventInput(
        { name: "direction_click", props: { provider: "google", secret: "x" } },
        { source: "client" },
      ),
    ).toThrow(/invalid props/);
  });

  it("rejects a malformed envelope", () => {
    expect(() => parseEventInput("not-an-object", { source: "client" })).toThrow(/malformed/);
  });
});
