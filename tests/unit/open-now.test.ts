import { describe, expect, it } from "vitest";
import { computeOpenNow } from "@/lib/hours/open-now";
import type { HoursDTO } from "@/lib/public-read/dto";

/**
 * Open-now engine (PRD P1-4), table-driven. Pacific/Honolulu is UTC-10 with no DST, so
 * each `now` below is the seed venue's local time expressed as a UTC instant (local + 10h).
 * Reference fixture = seed listing A: split lunch/dinner, Fri/Sat overnight, Sun closed,
 * Christmas exception, 30-min last order.
 */

const ramen: HoursDTO = {
  weekly: {
    mon: { spans: [{ open: "11:00", close: "14:30" }, { open: "17:00", close: "22:00" }] },
    tue: { spans: [{ open: "11:00", close: "14:30" }, { open: "17:00", close: "22:00" }] },
    wed: { spans: [{ open: "11:00", close: "14:30" }, { open: "17:00", close: "22:00" }] },
    thu: { spans: [{ open: "11:00", close: "14:30" }, { open: "17:00", close: "22:00" }] },
    fri: { spans: [{ open: "18:00", close: "02:00" }] },
    sat: { spans: [{ open: "18:00", close: "02:00" }] },
    sun: { closed: true },
  },
  exceptions: [{ date: "2026-12-25", closed: true, spans: null, reason: "Christmas Day" }],
  unknown: false,
  sellsOutEarly: true,
  appointmentOnly: false,
  lastOrderOffsetMin: 30,
  timezone: "Pacific/Honolulu",
};

const sushi: HoursDTO = {
  weekly: {
    mon: { spans: [{ open: "17:00", close: "23:00" }] },
    tue: { spans: [{ open: "17:00", close: "23:00" }] },
    wed: { closed: true },
    thu: { spans: [{ open: "17:00", close: "23:00" }] },
    fri: { spans: [{ open: "17:00", close: "23:30" }] },
    sat: { spans: [{ open: "17:00", close: "23:30" }] },
    sun: { spans: [{ open: "17:00", close: "22:00" }] },
  },
  exceptions: [],
  unknown: false,
  sellsOutEarly: false,
  appointmentOnly: false,
  lastOrderOffsetMin: 45,
  timezone: "Pacific/Honolulu",
};

const at = (iso: string) => new Date(iso);

describe("computeOpenNow — reference fixture (listing A)", () => {
  it("open during the lunch span, closing at 14:30 with a 14:00 last order", () => {
    // Mon 12:00 HST
    const s = computeOpenNow(ramen, at("2026-07-13T22:00:00Z"));
    expect(s.state).toBe("open");
    expect(s.closesAt).toBe("14:30");
    expect(s.lastOrderAt).toBe("14:00");
    expect(s.lastOrderPassed).toBe(false);
    expect(s.sellsOutEarly).toBe(true);
  });

  it("still open but past last order in the closing window", () => {
    // Mon 14:10 HST
    const s = computeOpenNow(ramen, at("2026-07-14T00:10:00Z"));
    expect(s.state).toBe("open");
    expect(s.lastOrderPassed).toBe(true);
    expect(s.closesAt).toBe("14:30");
  });

  it("closed between the split spans, opening again at 17:00 today", () => {
    // Mon 15:00 HST
    const s = computeOpenNow(ramen, at("2026-07-14T01:00:00Z"));
    expect(s.state).toBe("closed");
    expect(s.opensAt).toBe("17:00");
    expect(s.opensDay).toBe("today");
  });

  it("closed before opening, opening at 11:00 today", () => {
    // Mon 09:00 HST
    const s = computeOpenNow(ramen, at("2026-07-13T19:00:00Z"));
    expect(s.state).toBe("closed");
    expect(s.opensAt).toBe("11:00");
    expect(s.opensDay).toBe("today");
  });

  it("open late on Friday during an overnight span, closing at 02:00", () => {
    // Fri 23:00 HST
    const s = computeOpenNow(ramen, at("2026-07-18T09:00:00Z"));
    expect(s.state).toBe("open");
    expect(s.closesAt).toBe("02:00");
  });

  it("open early Saturday morning as the FRIDAY overnight span continues", () => {
    // Sat 01:00 HST
    const s = computeOpenNow(ramen, at("2026-07-18T11:00:00Z"));
    expect(s.state).toBe("open");
    expect(s.closesAt).toBe("02:00");
  });

  it("closed on Sunday, next open Monday (tomorrow) at 11:00", () => {
    // Sun 12:00 HST
    const s = computeOpenNow(ramen, at("2026-07-19T22:00:00Z"));
    expect(s.state).toBe("closed");
    expect(s.opensAt).toBe("11:00");
    expect(s.opensDay).toBe("tomorrow");
  });

  it("respects a date exception — closed on Christmas despite Friday hours", () => {
    // Fri 2026-12-25 20:00 HST
    const s = computeOpenNow(ramen, at("2026-12-26T06:00:00Z"));
    expect(s.state).toBe("closed");
    expect(s.opensAt).toBe("18:00"); // next open is Saturday
    expect(s.opensDay).toBe("tomorrow");
  });
});

describe("computeOpenNow — other schedules", () => {
  it("listing B: closed on its dark day (Wed), next open Thu at 17:00", () => {
    // Wed 19:00 HST
    const s = computeOpenNow(sushi, at("2026-07-16T05:00:00Z"));
    expect(s.state).toBe("closed");
    expect(s.opensAt).toBe("17:00");
    expect(s.opensDay).toBe("tomorrow");
  });

  it("unknown hours resolve to the 'unknown' state (pre-launch)", () => {
    const unknown: HoursDTO = { ...sushi, weekly: {}, unknown: true };
    expect(computeOpenNow(unknown, at("2026-07-13T22:00:00Z")).state).toBe("unknown");
  });

  it("appointment-only resolves to its own state", () => {
    const appt: HoursDTO = { ...sushi, appointmentOnly: true };
    expect(computeOpenNow(appt, at("2026-07-13T22:00:00Z")).state).toBe("appointment_only");
  });

  it("a 24-hour day reads as open with no closing time", () => {
    const allDay: HoursDTO = {
      ...sushi,
      weekly: { ...sushi.weekly, mon: { is24h: true } },
    };
    const s = computeOpenNow(allDay, at("2026-07-13T22:00:00Z")); // Mon 12:00 HST
    expect(s.state).toBe("open");
    expect(s.closesAt).toBeNull();
  });
});
