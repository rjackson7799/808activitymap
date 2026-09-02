import { describe, expect, it } from "vitest";
import { expectErrorIn, setClaims, withRollback } from "./helpers";

const MARKET_ID = "oahu-waikiki";
const EDITOR_ID = "99000000-0000-4000-8000-000000000003";
const OPS_ID = "99000000-0000-4000-8000-000000000006";
const PUBLISHER_ID = "99000000-0000-4000-8000-000000000002";

async function seedInquiry(tx: Parameters<Parameters<typeof withRollback>[0]>[0]) {
  const [row] = await tx<{ id: string }[]>`
    insert into public.business_inquiries
      (market_id, source_locale, business_name, contact_name, email, phone, website, message, preferred_language)
    values
      (${MARKET_ID}, 'en', 'Admin Queue Test', 'Kai Example', 'kai@example.com', '+1 808 555 0100',
       'https://example.com', 'Please contact me about an accurate business profile.', 'en')
    returning id
  `;
  return row!.id;
}

describe("Phase 0 business inquiries", () => {
  it("stores a consented interest record without creating a claim or membership", async () => {
    await withRollback(async (tx) => {
      const [row] = await tx<{
        id: string;
        status: string;
        consent_version: string;
        source_locale: string;
      }[]>`
        insert into public.business_inquiries
          (market_id, source_locale, business_name, contact_name, email, message, preferred_language)
        values
          (${MARKET_ID}, 'en', 'Island Noodle House', 'Kai Example', 'kai@example.com',
           'Please contact me about an accurate business profile.', 'en')
        returning id, status, consent_version, source_locale
      `;

      expect(row).toMatchObject({
        status: "open",
        consent_version: "business-inquiry-v1",
        source_locale: "en",
      });

      const claims = await tx`select * from information_schema.tables where table_schema = 'public' and table_name = 'claims'`;
      const memberships = await tx`select * from information_schema.tables where table_schema = 'public' and table_name = 'organization_memberships'`;
      expect(claims).toEqual([]);
      expect(memberships).toEqual([]);
    });
  });

  it("denies anonymous and authenticated access to inquiry contact details", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role anon");
      await expectErrorIn(tx, /permission denied/, (sp) => sp`select email from public.business_inquiries`);
    });
    await withRollback(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await expectErrorIn(tx, /permission denied/, (sp) => sp`select email from public.business_inquiries`);
    });
  });

  it("exposes readback only through an MFA-gated operations function", async () => {
    await withRollback(async (tx) => {
      const id = await seedInquiry(tx);

      await setClaims(tx, { role: "anon" }, true);
      await expectErrorIn(tx, /permission denied/, (sp) => sp`select * from public.list_business_inquiries()`);

      await setClaims(tx, { sub: EDITOR_ID, aal: "aal1", app_roles: ["editor"] }, true);
      await expectErrorIn(tx, /aal2_required/, (sp) => sp`select * from public.list_business_inquiries()`);

      await setClaims(tx, { sub: PUBLISHER_ID, aal: "aal2", app_roles: ["publisher"] }, true);
      await expectErrorIn(tx, /permission_denied/, (sp) => sp`select * from public.list_business_inquiries()`);

      await setClaims(tx, { sub: OPS_ID, aal: "aal2", app_roles: ["ops_agent"] }, true);
      const rows = await tx<{ id: string; email: string }[]>`select id, email from public.list_business_inquiries()`;
      expect(rows).toContainEqual({ id, email: "kai@example.com" });
      await expectErrorIn(tx, /permission denied/, (sp) => sp`select email from public.business_inquiries where id = ${id}`);
    });
  });

  it("audits MFA staff transitions without duplicating inquiry PII", async () => {
    await withRollback(async (tx) => {
      const id = await seedInquiry(tx);
      await setClaims(tx, { sub: EDITOR_ID, aal: "aal2", app_roles: ["editor"] }, true);
      await tx`select public.transition_business_inquiry(${id}::uuid, 'contacted', 'Sent an introductory email.')`;

      await tx.unsafe("reset role");
      const [row] = await tx<{ status: string; handled_by: string; staff_note: string }[]>`
        select status, handled_by, staff_note from public.business_inquiries where id = ${id}`;
      expect(row).toEqual({ status: "contacted", handled_by: EDITOR_ID, staff_note: "Sent an introductory email." });

      const [audit] = await tx<{ actor: string; after: Record<string, unknown> }[]>`
        select actor, after from public.audit_log
        where target_table = 'business_inquiries' and target_id = ${id}
        order by id desc limit 1`;
      expect(audit!.actor).toBe(EDITOR_ID);
      expect(audit!.after).toMatchObject({ status: "contacted", staff_note: "Sent an introductory email." });
      for (const field of ["business_name", "contact_name", "email", "phone", "website", "message"]) {
        expect(audit!.after).not.toHaveProperty(field);
      }
    });
  });

  it("rejects unauthorized, stale-assurance, invalid, and unchanged transitions", async () => {
    await withRollback(async (tx) => {
      const id = await seedInquiry(tx);
      await setClaims(tx, { sub: OPS_ID, aal: "aal1", app_roles: ["ops_agent"] }, true);
      await expectErrorIn(tx, /aal2_required/, (sp) => sp`select public.transition_business_inquiry(${id}::uuid, 'contacted', 'Called the business.')`);

      await setClaims(tx, { sub: OPS_ID, aal: "aal2", app_roles: ["ops_agent"] }, true);
      await expectErrorIn(tx, /invalid_business_inquiry_status/, (sp) => sp`select public.transition_business_inquiry(${id}::uuid, 'claimed', 'Invalid future state.')`);
      await expectErrorIn(tx, /invalid_business_inquiry_staff_note/, (sp) => sp`select public.transition_business_inquiry(${id}::uuid, 'closed', 'x')`);
      await expectErrorIn(tx, /business_inquiry_status_unchanged/, (sp) => sp`select public.transition_business_inquiry(${id}::uuid, 'open', 'No status change.')`);
    });
  });

  it("constrains locale, status, and bounded message content", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /business_inquiries_locale_check/, (sp) => sp`
        insert into public.business_inquiries
          (market_id, source_locale, business_name, contact_name, email, message, preferred_language)
        values
          (${MARKET_ID}, 'fr', 'Example', 'Contact', 'contact@example.com',
           'This message is long enough for validation.', 'en')
      `);
    });
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /business_inquiries_message_length/, (sp) => sp`
        insert into public.business_inquiries
          (market_id, source_locale, business_name, contact_name, email, message, preferred_language)
        values
          (${MARKET_ID}, 'en', 'Example', 'Contact', 'contact@example.com', 'Too short', 'en')
      `);
    });
  });
});
