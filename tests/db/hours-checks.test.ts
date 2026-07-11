import { describe, it } from "vitest";
import { withRollback, expectErrorIn, type TxSql } from "./helpers";
import { LOC } from "./fixtures";

/**
 * Hours JSON shape CHECKs (migration 9). Only shape lives in SQL — semantic
 * rules (overlaps, open-now, last-order) belong to /lib/hours (CP4) and get
 * their own malformed-input tests there (both-layers rule from the slice).
 */

// weekly must go over the wire as a jsonb VALUE (tx.json), not a stringified
// parameter — '"{...}"'::jsonb is a jsonb string and fails the shape check
// for the wrong reason.
const insertHours = (tx: TxSql, weekly: unknown, unknown_ = false) =>
  tx`insert into hours_sets (location_id, weekly, unknown)
     values (${LOC.coffee}, ${tx.json(weekly as Parameters<TxSql["json"]>[0])}, ${unknown_})`;

const clearHours = (tx: TxSql) =>
  tx`delete from hours_sets where location_id = ${LOC.coffee}`;

const fullWeek = (day: unknown) => ({
  mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day,
});

describe("weekly shape — malformed inputs rejected by CHECK", () => {
  const bad: Array<[string, unknown]> = [
    ["missing day", { mon: { closed: true } }],
    ["stray weekday key", { ...fullWeek({ closed: true }), monday: { closed: true } }],
    ["invalid hour 25:00", fullWeek({ spans: [{ open: "25:00", close: "26:00" }] })],
    ["invalid minute :60", fullWeek({ spans: [{ open: "10:60", close: "12:00" }] })],
    ["missing leading zero", fullWeek({ spans: [{ open: "9:00", close: "12:00" }] })],
    ["24:00 not a valid time (use is_24h)", fullWeek({ spans: [{ open: "00:00", close: "24:00" }] })],
    ["zero-length span", fullWeek({ spans: [{ open: "10:00", close: "10:00" }] })],
    ["empty span array", fullWeek({ spans: [] })],
    ["spans not an array", fullWeek({ spans: { open: "10:00", close: "12:00" } })],
    ["span with extra keys", fullWeek({ spans: [{ open: "10:00", close: "12:00", note: "x" }] })],
    ["span missing close", fullWeek({ spans: [{ open: "10:00" }] })],
    ["contradictory closed+spans", fullWeek({ closed: true, spans: [{ open: "10:00", close: "12:00" }] })],
    ["contradictory is_24h+spans", fullWeek({ is_24h: true, spans: [{ open: "10:00", close: "12:00" }] })],
    ["closed:false is meaningless", fullWeek({ closed: false })],
    ["day not an object", fullWeek("closed")],
    ["weekly not an object", ["mon"]],
  ];

  it.each(bad)("rejects %s", async (_label, weekly) => {
    await withRollback(async (tx) => {
      await clearHours(tx);
      await expectErrorIn(tx, /hours_sets_weekly_shape_check/, (sp) =>
        insertHours(sp, weekly),
      );
    });
  });

  it("rejects unknown=true with non-empty weekly (contradiction)", async () => {
    await withRollback(async (tx) => {
      await clearHours(tx);
      await expectErrorIn(tx, /hours_sets_weekly_shape_check/, (sp) =>
        insertHours(sp, fullWeek({ closed: true }), true),
      );
    });
  });
});

describe("weekly shape — legitimate representations accepted", () => {
  const good: Array<[string, unknown]> = [
    ["overnight span (close < open)", fullWeek({ spans: [{ open: "18:00", close: "02:00" }] })],
    ["split spans", fullWeek({ spans: [{ open: "11:00", close: "14:30" }, { open: "17:00", close: "22:00" }] })],
    ["24h day", fullWeek({ is_24h: true })],
    ["closed day", fullWeek({ closed: true })],
    [
      "mixed week",
      {
        mon: { spans: [{ open: "11:00", close: "14:30" }] },
        tue: { closed: true },
        wed: { is_24h: true },
        thu: { spans: [{ open: "18:00", close: "02:00" }] },
        fri: { spans: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "23:59" }] },
        sat: { is_24h: true },
        sun: { closed: true },
      },
    ],
  ];

  it.each(good)("accepts %s", async (_label, weekly) => {
    await withRollback(async (tx) => {
      await clearHours(tx);
      await insertHours(tx, weekly);
    });
  });

  it("accepts unknown=true with empty weekly (pre-launch flagged state)", async () => {
    await withRollback(async (tx) => {
      await clearHours(tx);
      await insertHours(tx, {}, true);
    });
  });
});

describe("hours_exceptions shape", () => {
  it("closed exception must not carry spans", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /hours_exceptions_spans_check/, (sp) =>
        sp`insert into hours_exceptions (location_id, date, closed, spans)
           values (${LOC.coffee}, '2026-11-26', true, '[{"open":"10:00","close":"12:00"}]'::jsonb)`,
      );
    });
  });

  it("open exception requires a well-formed span array", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /hours_exceptions_spans_check/, (sp) =>
        sp`insert into hours_exceptions (location_id, date, closed, spans)
           values (${LOC.coffee}, '2026-11-26', false, null)`,
      );
      await expectErrorIn(tx, /hours_exceptions_spans_check/, (sp) =>
        sp`insert into hours_exceptions (location_id, date, closed, spans)
           values (${LOC.coffee}, '2026-11-26', false, '[{"open":"10:00","close":"10:00"}]'::jsonb)`,
      );
    });
  });

  it("accepts a valid closed day and a valid special-hours day", async () => {
    await withRollback(async (tx) => {
      await tx`insert into hours_exceptions (location_id, date, closed, reason)
               values (${LOC.coffee}, '2026-11-26', true, 'Thanksgiving')`;
      await tx`insert into hours_exceptions (location_id, date, closed, spans, reason)
               values (${LOC.coffee}, '2026-12-31', false, '[{"open":"10:00","close":"15:00"}]'::jsonb, 'NYE short day')`;
    });
  });

  it("one exception per location per date", async () => {
    await withRollback(async (tx) => {
      await tx`insert into hours_exceptions (location_id, date, closed) values (${LOC.coffee}, '2026-11-26', true)`;
      await expectErrorIn(tx, /duplicate key/, (sp) =>
        sp`insert into hours_exceptions (location_id, date, closed) values (${LOC.coffee}, '2026-11-26', true)`,
      );
    });
  });
});
