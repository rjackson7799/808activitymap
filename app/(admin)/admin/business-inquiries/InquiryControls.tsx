"use client";

import { useActionState } from "react";
import {
  adminErrorClassName,
  adminInputClassName,
  adminLabelClassName,
  adminSuccessClassName,
} from "@/components/admin/formStyles";
import { Button } from "@/components/ui/button";
import { transitionInquiry, type InquiryActionState } from "./actions";

type InquiryStatus = "open" | "contacted" | "closed";

const STATUS_LABELS: Record<InquiryStatus, string> = {
  open: "Reopen",
  contacted: "Mark contacted",
  closed: "Close inquiry",
};

export function InquiryControls({ inquiryId, currentStatus }: { inquiryId: string; currentStatus: InquiryStatus }) {
  const [state, action, pending] = useActionState<InquiryActionState, FormData>(transitionInquiry, {});
  const statusId = `inquiry-status-${inquiryId}`;
  const noteId = `inquiry-note-${inquiryId}`;
  const choices = (Object.keys(STATUS_LABELS) as InquiryStatus[]).filter((status) => status !== currentStatus);

  return (
    <form action={action} className="grid gap-4 rounded-card border border-hairline bg-neutral/40 p-4 sm:grid-cols-2 sm:p-5">
      <input type="hidden" name="inquiry_id" value={inquiryId} />
      <label htmlFor={statusId} className={adminLabelClassName}>
        New status
        <select id={statusId} name="status" required defaultValue="" disabled={pending} className={adminInputClassName}>
          <option value="" disabled>Select a status</option>
          {choices.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
        </select>
      </label>

      <label htmlFor={noteId} className={`${adminLabelClassName} sm:col-span-2`}>
        Internal note
        <textarea
          id={noteId}
          name="staff_note"
          required
          minLength={3}
          maxLength={2000}
          rows={3}
          disabled={pending}
          className={`${adminInputClassName} resize-y`}
          placeholder="Record the contact attempt or reason for this status change."
        />
        <span className="mt-2 block text-xs font-normal text-muted">Required · staff-only · 3–2,000 characters</span>
      </label>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save status"}</Button>
        <span className="text-xs text-muted">The change and acting staff member are audit-logged.</span>
      </div>

      {state.error ? <p role="alert" className={`${adminErrorClassName} sm:col-span-2`}>{state.error}</p> : null}
      {state.ok ? <p role="status" className={`${adminSuccessClassName} sm:col-span-2`}>Inquiry updated.</p> : null}
    </form>
  );
}
