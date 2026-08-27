import { describe, expect, it } from "vitest";
import { sql, newConnection, withRollback, expectErrorIn } from "./helpers";

/**
 * CP5 ingestion RPCs (migration 19): fixed-window `rate_limit_hit` (atomic,
 * cross-instance-exact) and `record_event` (the sole sanctioned write into
 * `events`, with canonical/eligible listing resolution). Both are
 * service_role-only — never anon (the anon key is public).
 */

const REFERENCE_LISTING = "c0000000-0000-4000-8000-000000000001";
const REFERENCE_SLUG = "aloha-ramen-hale"; // published EN reference fixture

describe("rate_limit_hit — fixed-window counter", () => {
  it("increments and flips allowed=false past the limit", async () => {
    await withRollback(async (tx) => {
      const results = [];
      for (let i = 0; i < 5; i++) {
        const r = await tx`select * from rate_limit_hit('t:ip', 'subject-a', 3, 3600)`;
        results.push(r[0]!);
      }
      expect(results.map((r) => r.hit_count)).toEqual([1, 2, 3, 4, 5]);
      expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
      expect(results[0]!.retry_after).toBe(0);
      expect(results[4]!.retry_after).toBeGreaterThan(0);
    });
  });

  it("rejects a non-positive limit or window", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /must be positive/, (sp) => sp`select rate_limit_hit('t:ip', 's', 0, 60)`);
      await expectErrorIn(tx, /must be positive/, (sp) => sp`select rate_limit_hit('t:ip', 's', 5, 0)`);
    });
  });

  it("counts exactly under concurrent hits from separate connections (no lost updates)", async () => {
    const subject = "concurrency-subject";
    const a = newConnection();
    const b = newConnection();
    try {
      await sql`delete from rate_limits where bucket = 't:conc' and subject = ${subject}`;
      const N = 24;
      const conns = [a, b];
      await Promise.all(
        Array.from({ length: N }, (_, i) =>
          conns[i % 2]!`select * from rate_limit_hit('t:conc', ${subject}, 1000, 3600)`,
        ),
      );
      const final = await sql`select count from rate_limits where bucket = 't:conc' and subject = ${subject}`;
      expect(final[0]!.count).toBe(N); // atomic increment: exact, not <N
    } finally {
      await sql`delete from rate_limits where bucket = 't:conc' and subject = ${subject}`;
      await a.end();
      await b.end();
    }
  });

  it("is not executable by anon or authenticated", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role anon");
      await expectErrorIn(tx, /permission denied/, (sp) => sp`select rate_limit_hit('t:ip', 's', 5, 60)`);
    });
  });
});

describe("record_event — sanctioned events write", () => {
  it("inserts a session_start (non-listing-scoped) event", async () => {
    await withRollback(async (tx) => {
      const r = await tx`
        select record_event('session_start', 'server', '{}'::jsonb, 'sess-1', 'en', null, null, 'direct', 'functional') as id`;
      expect(r[0]!.id).not.toBeNull();
      const row = await tx`select name, source, listing_id, consent_class from events where id = ${r[0]!.id}`;
      expect(row[0]!.name).toBe("session_start");
      expect(row[0]!.listing_id).toBeNull();
      expect(row[0]!.consent_class).toBe("functional");
    });
  });

  it("resolves a canonical, eligible slug to the listing id", async () => {
    await withRollback(async (tx) => {
      const r = await tx`
        select record_event('listing_view', 'server', '{}'::jsonb, 'sess-1', 'en', null, ${REFERENCE_SLUG}, 'organic', 'functional') as id`;
      expect(r[0]!.id).not.toBeNull();
      const row = await tx`select listing_id, referrer_class from events where id = ${r[0]!.id}`;
      expect(row[0]!.listing_id).toBe(REFERENCE_LISTING);
      expect(row[0]!.referrer_class).toBe("organic");
    });
  });

  it("resolves an eligible listing_id (client-supplied)", async () => {
    await withRollback(async (tx) => {
      const r = await tx`
        select record_event('menu_view', 'client', '{}'::jsonb, 'sess-1', 'en', ${REFERENCE_LISTING}::uuid, null, null, 'functional') as id`;
      expect(r[0]!.id).not.toBeNull();
      const row = await tx`select listing_id from events where id = ${r[0]!.id}`;
      expect(row[0]!.listing_id).toBe(REFERENCE_LISTING);
    });
  });

  it("DROPS a hit on an unknown/non-canonical slug (returns null, no row)", async () => {
    await withRollback(async (tx) => {
      const r = await tx`
        select record_event('listing_view', 'server', '{}'::jsonb, 'sess-1', 'en', null, 'no-such-slug', 'organic', 'functional') as id`;
      expect(r[0]!.id).toBeNull();
      const rows = await tx`select count(*)::int as c from events where session_id = 'sess-1'`;
      expect(rows[0]!.c).toBe(0);
    });
  });

  it("DROPS a hit on an ineligible listing_id (returns null)", async () => {
    await withRollback(async (tx) => {
      const r = await tx`
        select record_event('menu_view', 'client', '{}'::jsonb, 'sess-1', 'en', '00000000-0000-4000-8000-000000000099'::uuid, null, null, 'functional') as id`;
      expect(r[0]!.id).toBeNull();
    });
  });

  it("is not executable by anon", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role anon");
      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp`select record_event('session_start', 'server', '{}'::jsonb, 's', 'en', null, null, null, null)`,
      );
    });
  });
});

describe("cron maintenance RPCs (CP5)", () => {
  it("service_role can call ensure_events_partitions; anon cannot", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role service_role");
      const r = await tx`select ensure_events_partitions(3) as n`;
      expect(r[0]!.n).toBe(0); // horizon already exists
    });
    await withRollback(async (tx) => {
      await tx.unsafe("set local role anon");
      await expectErrorIn(tx, /permission denied/, (sp) => sp`select ensure_events_partitions(3)`);
    });
  });

  it("events_default_count is 0 on pristine seed and >0 with a beyond-horizon row", async () => {
    const pristine = await sql`select events_default_count() as c`;
    expect(Number(pristine[0]!.c)).toBe(0);
    await withRollback(async (tx) => {
      await tx`insert into events (name, source, ts) values ('listing_view', 'server', now() + interval '10 years')`;
      const after = await tx`select events_default_count() as c`;
      expect(Number(after[0]!.c)).toBe(1);
    });
  });

  it("prune_rate_limits deletes rows older than the retention horizon, keeps recent ones", async () => {
    await withRollback(async (tx) => {
      await tx`insert into rate_limits (bucket, subject, window_start, count) values
        ('t:p', 'old', now() - interval '120 days', 5),
        ('t:p', 'recent', now() - interval '1 day', 5)`;
      const deleted = await tx`select prune_rate_limits(90) as n`;
      expect(Number(deleted[0]!.n)).toBe(1);
      const remaining = await tx`select subject from rate_limits where bucket = 't:p' order by subject`;
      expect(remaining.map((r) => r.subject)).toEqual(["recent"]);
    });
  });

  it("prune_rate_limits rejects a non-positive horizon", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /must be positive/, (sp) => sp`select prune_rate_limits(0)`);
    });
  });
});
