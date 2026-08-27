import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { sql, withRollback } from "./helpers";

/**
 * Events partitioning (migration 14): idempotent + advisory-locked creation,
 * rows land in month partitions, default partition stays empty (its
 * non-emptiness is the CP5 alert condition).
 */

describe("ensure_events_partitions", () => {
  it("is idempotent — the migration already created the near horizon", async () => {
    const created = await sql`select ensure_events_partitions(3) as n`;
    expect(created[0]!.n).toBe(0);
  });

  it("extends the horizon and reports how many it created", async () => {
    await withRollback(async (tx) => {
      const first = await tx`select ensure_events_partitions(12) as n`;
      expect(first[0]!.n).toBeGreaterThan(0);
      const second = await tx`select ensure_events_partitions(12) as n`;
      expect(second[0]!.n).toBe(0);
    });
  });

  it("rejects an absurd horizon", async () => {
    await withRollback(async (tx) => {
      await expect(tx`select ensure_events_partitions(100)`).rejects.toThrow(
        /months_ahead/,
      );
    });
  });

  it("concurrent invocations serialize on the advisory lock without error", async () => {
    // separate connections so the lock is actually contended
    const a = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54332/postgres", { max: 1, onnotice: () => {} });
    const b = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54332/postgres", { max: 1, onnotice: () => {} });
    try {
      const [ra, rb] = await Promise.all([
        a`select ensure_events_partitions(3) as n`,
        b`select ensure_events_partitions(3) as n`,
      ]);
      expect(ra[0]!.n + rb[0]!.n).toBe(0); // horizon already exists; both no-ops, no deadlock
    } finally {
      await a.end();
      await b.end();
    }
  });
});

describe("row routing", () => {
  it("a current event lands in the current month partition, not the default", async () => {
    await withRollback(async (tx) => {
      await tx`insert into events (name, source, session_id, locale)
               values ('listing_view', 'server', 'partition-test-session', 'en')`;
      const inDefault = await tx`select count(*)::int as c from events_default`;
      expect(inDefault[0]!.c).toBe(0);
      const routed = await tx`select count(*)::int as c from events where name = 'listing_view'`;
      expect(routed[0]!.c).toBe(1);
    });
  });

  it("an event beyond the partition horizon lands in the default (the alert condition)", async () => {
    await withRollback(async (tx) => {
      await tx`insert into events (name, source, session_id, locale, ts)
               values ('listing_view', 'server', 'partition-test-session', 'en', now() + interval '10 years')`;
      const inDefault = await tx`select count(*)::int as c from events_default`;
      expect(inDefault[0]!.c).toBe(1);
    });
  });

  it("the default partition is empty on a pristine seed", async () => {
    const rows = await sql`select count(*)::int as c from events_default`;
    expect(rows[0]!.c).toBe(0);
  });
});
