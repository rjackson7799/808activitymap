import { describe, expect, it } from "vitest";
import { expectErrorIn, withRollback } from "./helpers";

const MARKET_ID = "oahu-waikiki";

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
