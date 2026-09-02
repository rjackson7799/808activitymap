"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  adminErrorClassName,
  adminInputClassName,
  adminLabelClassName,
  adminSuccessClassName,
} from "@/components/admin/formStyles";
import { recordMenuApproval, type ActionState } from "../listings/actions";

export function ApprovalControls({
  listingId,
  menuLocaleId,
  locale,
  evidence,
}: {
  listingId: string;
  menuLocaleId: string;
  locale: string;
  evidence: Array<{ id: string; path: string }>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordMenuApproval, {});
  const inputId = `approval-evidence-${menuLocaleId}`;

  return (
    <form action={action} aria-label={`Record external approval for ${locale} menu`} className="space-y-4">
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="mvl_id" value={menuLocaleId} />
      <div>
        <label htmlFor={inputId} className={adminLabelClassName}>Signed approval evidence</label>
        <select id={inputId} name="evidence_media_id" defaultValue="" className={adminInputClassName} disabled={pending} required>
          <option value="" disabled>Select an approved evidence document</option>
          {evidence.map((item) => <option key={item.id} value={item.id}>{item.path}</option>)}
        </select>
      </div>
      {evidence.length === 0 ? (
        <p role="note" className="text-sm leading-6 text-secondary">
          No approved evidence documents are available. Ingest the signed form through the permissioned seeding workflow first.
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="md" disabled={pending || evidence.length === 0}>
        {pending ? "Recording…" : "Record external approval"}
      </Button>
      {state.error ? <p role="alert" data-error-code={state.code ?? "error"} className={adminErrorClassName}>{state.error}</p> : null}
      {state.ok ? <p role="status" className={adminSuccessClassName}>External approval recorded.</p> : null}
    </form>
  );
}
