"use client";

import { useActionState } from "react";
import {
  adminErrorClassName,
  adminInputClassName,
  adminLabelClassName,
  adminSuccessClassName,
} from "@/components/admin/formStyles";
import { Button } from "@/components/ui/button";
import { assignToMe, resolveCorrection, type CorrectionActionState } from "./actions";

export function ReviewControls({ requestId }: { requestId: string }) {
  const [assignState, assignAction, assigning] = useActionState<CorrectionActionState, FormData>(assignToMe, {});
  const [resolveState, resolveAction, resolving] = useActionState<CorrectionActionState, FormData>(resolveCorrection, {});
  const outcomeId = `outcome-${requestId}`;
  const noteId = `resolution-note-${requestId}`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-base font-bold text-ink">Review actions</h4>
          <p className="mt-1 text-sm text-secondary">Assign the request before recording an editorial decision.</p>
        </div>
        <form action={assignAction}>
          <input type="hidden" name="request_id" value={requestId} />
          <Button type="submit" variant="outline" size="sm" disabled={assigning}>
            {assigning ? "Assigning…" : "Assign to me"}
          </Button>
        </form>
      </div>

      {assignState.error ? <p role="alert" className={`${adminErrorClassName} mt-3`}>{assignState.error}</p> : null}

      <form action={resolveAction} className="mt-5 grid gap-4 rounded-card border border-hairline bg-neutral/40 p-4 sm:grid-cols-2 sm:p-5">
        <input type="hidden" name="request_id" value={requestId} />
        <label htmlFor={outcomeId} className={adminLabelClassName}>
          Outcome
          <select id={outcomeId} name="status" required defaultValue="" disabled={resolving} className={adminInputClassName}>
            <option value="" disabled>Select an outcome</option>
            <option value="merged">Accepted and applied</option>
            <option value="rejected">Rejected</option>
            <option value="overridden">Reconciled after listing changed</option>
          </select>
        </label>

        <label htmlFor={noteId} className={`${adminLabelClassName} sm:col-span-2`}>
          Resolution note
          <textarea
            id={noteId}
            name="resolution_note"
            required
            minLength={3}
            maxLength={2000}
            rows={4}
            disabled={resolving}
            className={`${adminInputClassName} resize-y`}
            placeholder="Summarize the decision and any changes made."
          />
          <span className="mt-2 block text-xs font-normal text-muted">Required · 3–2,000 characters</span>
        </label>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={resolving}>
            {resolving ? "Saving…" : "Resolve request"}
          </Button>
          <span className="text-xs text-muted">This closes the request and records the outcome.</span>
        </div>

        {resolveState.error ? <p role="alert" className={`${adminErrorClassName} sm:col-span-2`}>{resolveState.error}</p> : null}
        {resolveState.ok ? <p role="status" className={`${adminSuccessClassName} sm:col-span-2`}>Resolution saved.</p> : null}
      </form>
    </div>
  );
}
