"use client";

import { useActionState } from "react";
import { assignToMe, resolveCorrection, type CorrectionActionState } from "./actions";

export function ReviewControls({ requestId }: { requestId: string }) {
  const [assignState, assignAction, assigning] = useActionState<CorrectionActionState, FormData>(assignToMe, {});
  const [resolveState, resolveAction, resolving] = useActionState<CorrectionActionState, FormData>(resolveCorrection, {});
  return <div style={{ display: "grid", gap: ".75rem" }}>
    <form action={assignAction}>
      <input type="hidden" name="request_id" value={requestId} />
      <button type="submit" disabled={assigning}>{assigning ? "Assigning…" : "Assign to me"}</button>
      {assignState.error ? <p role="alert" style={{ color: "#b00020" }}>{assignState.error}</p> : null}
    </form>
    <form action={resolveAction} style={{ display: "grid", gap: ".5rem" }}>
      <input type="hidden" name="request_id" value={requestId} />
      <label>Outcome <select name="status" required defaultValue=""><option value="" disabled>Select…</option><option value="merged">Accepted and applied</option><option value="rejected">Rejected</option><option value="overridden">Reconciled after listing changed</option></select></label>
      <label>Resolution note <textarea name="resolution_note" required minLength={3} maxLength={2000} rows={3} /></label>
      <button type="submit" disabled={resolving}>{resolving ? "Saving…" : "Resolve"}</button>
      {resolveState.error ? <p role="alert" style={{ color: "#b00020" }}>{resolveState.error}</p> : null}
      {resolveState.ok ? <p role="status">Saved.</p> : null}
    </form>
  </div>;
}

