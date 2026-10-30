import { describe, expect, it } from "vitest";
import { expectErrorIn, setClaims, withRollback } from "./helpers";

const LISTING_ID = "c0000000-0000-4000-8000-000000000001";
const EDITOR_ID = "99000000-0000-4000-8000-000000000003";
const OPS_ID = "99000000-0000-4000-8000-000000000006";

describe("assisted update evidence", () => {
  it("atomically creates a linked correction and calculates the next-business-day target", async () => {
    await withRollback(async (tx) => {
      await setClaims(tx, { sub: OPS_ID, aal: "aal1", app_roles: ["ops_agent"] }, true);
      const [created] = await tx<{ change_request_id: string }[]>`
        select public.record_assisted_update(
          ${LISTING_ID}::uuid, 'email', 'ja', 'vendor@example.com',
          'Please update our Friday closing time to 9 p.m.', 'hours',
          'Friday closing time should be 9 p.m.',
          '2026-08-28T22:00:00Z'::timestamptz
        ) as change_request_id`;

      const [row] = await tx<{
        channel: string; locale: string; linked_change_request_id: string;
        response_due_at: string; proposer_channel: string; recorded_by: string;
      }[]>`
        select am.channel, am.locale, am.linked_change_request_id, am.response_due_at,
               cr.proposer_channel, am.recorded_by
        from public.assisted_messages am
        join public.change_requests cr on cr.id = am.linked_change_request_id
        where am.linked_change_request_id = ${created!.change_request_id}::uuid`;

      expect(row).toMatchObject({
        channel: "email",
        locale: "ja",
        linked_change_request_id: created!.change_request_id,
        proposer_channel: "assisted_email",
        recorded_by: OPS_ID,
      });
      expect(new Date(row!.response_due_at).toISOString()).toBe("2026-08-31T22:00:00.000Z");
    });
  });

  it("requires authorized staff and MFA for privileged roles", async () => {
    await withRollback(async (tx) => {
      await setClaims(tx, { sub: EDITOR_ID, aal: "aal1", app_roles: ["editor"] }, true);
      await expectErrorIn(tx, /aal2_required/, (sp) => sp`
        select public.record_assisted_update(
          ${LISTING_ID}::uuid, 'sms', 'en', '+18085550142',
          'Please update the business phone number.', 'phone',
          'The new phone number is provided in the message.', now()
        )`);

      await setClaims(tx, { sub: EDITOR_ID, aal: "aal2", app_roles: ["language_reviewer_ja"] }, true);
      await expectErrorIn(tx, /permission_denied/, (sp) => sp`
        select public.record_assisted_update(
          ${LISTING_ID}::uuid, 'sms', 'en', '+18085550142',
          'Please update the business phone number.', 'phone',
          'The new phone number is provided in the message.', now()
        )`);
    });
  });

  it("records one response and blocks direct mutation", async () => {
    await withRollback(async (tx) => {
      await setClaims(tx, { sub: EDITOR_ID, aal: "aal2", app_roles: ["editor"] }, true);
      const [created] = await tx<{ change_request_id: string }[]>`
        select public.record_assisted_update(
          ${LISTING_ID}::uuid, 'sms', 'en', '+18085550142',
          'Please note that our hours changed this week.', 'hours',
          'Temporary hours were supplied for editorial review.', now()
        ) as change_request_id`;
      const [message] = await tx<{ id: string }[]>`
        select id from public.assisted_messages where linked_change_request_id=${created!.change_request_id}::uuid`;

      await expectErrorIn(tx, /permission denied/, (sp) => sp`
        update public.assisted_messages set responded_at=now() where id=${message!.id}::uuid`);
      await tx`select public.record_assisted_response(${message!.id}::uuid, 'Replied by SMS and confirmed editorial review.')`;
      const [updated] = await tx<{ responded_by: string; response_note: string }[]>`
        select responded_by, response_note from public.assisted_messages where id=${message!.id}::uuid`;
      expect(updated).toEqual({ responded_by: EDITOR_ID, response_note: "Replied by SMS and confirmed editorial review." });
      await expectErrorIn(tx, /assisted_message_not_open/, (sp) => sp`
        select public.record_assisted_response(${message!.id}::uuid, 'Duplicate response')`);
    });
  });
});
