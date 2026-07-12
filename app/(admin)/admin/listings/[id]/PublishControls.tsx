"use client";

import { useActionState } from "react";
import {
  publishLocale,
  unpublishLocale,
  transitionListingLocale,
  recordMenuApproval,
  publishMenuLocale,
  type ActionState,
} from "../actions";

const errStyle = { color: "#b00020", marginLeft: "0.5rem" } as const;
const okStyle = { color: "#166534", marginLeft: "0.5rem" } as const;

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** A single hidden-field form + submit that surfaces the mapped ActionState. */
function ActionForm({
  action,
  fields,
  label,
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} style={{ display: "inline-block", marginRight: "0.5rem" }}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pending}>{pending ? "Working…" : label}</button>
      {state.error ? (
        <span role="alert" data-testid="action-error" data-error-code={state.code ?? "error"} style={errStyle}>
          {state.error}
        </span>
      ) : null}
      {state.ok ? <span role="status" style={okStyle}>Done.</span> : null}
    </form>
  );
}

const SERVING = new Set(["qa_approved", "vendor_approved", "published"]);

export function LocaleControls({
  listingId,
  locale,
  status,
}: {
  listingId: string;
  locale: string;
  status: string;
}) {
  return (
    <div style={{ marginTop: "0.4rem" }}>
      {(status === "not_started" || status === "machine_draft") && (
        <ActionForm
          action={transitionListingLocale}
          fields={{ listing_id: listingId, locale, to_status: "qa_pending" }}
          label={`Send ${locale} to QA`}
        />
      )}
      {status === "qa_pending" && (
        <ActionForm
          action={transitionListingLocale}
          fields={{ listing_id: listingId, locale, to_status: "qa_approved" }}
          label={`Approve ${locale} QA`}
        />
      )}
      <ActionForm
        action={publishLocale}
        fields={{ listing_id: listingId, locale }}
        label={`Publish ${locale}`}
      />
      {SERVING.has(status) && (
        <ActionForm
          action={unpublishLocale}
          fields={{ listing_id: listingId, locale }}
          label={`Unpublish ${locale}`}
        />
      )}
    </div>
  );
}

export function MenuApprovalControls({
  listingId,
  mvlId,
  locale,
  status,
  evidenceMedia,
}: {
  listingId: string;
  mvlId: string;
  locale: string;
  status: string;
  evidenceMedia: { id: string; path: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordMenuApproval, {});

  return (
    <div style={{ marginTop: "0.4rem" }}>
      {(status === "qa_approved" || status === "vendor_approval_pending") && (
        <form action={formAction} aria-label={`Record vendor approval for the ${locale} menu`}>
          <input type="hidden" name="listing_id" value={listingId} />
          <input type="hidden" name="mvl_id" value={mvlId} />
          <label>
            Approval evidence
            <select name="evidence_media_id" defaultValue="" style={{ marginLeft: "0.4rem" }}>
              <option value="">— none —</option>
              {evidenceMedia.map((m) => (
                <option key={m.id} value={m.id}>{m.path}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending} style={{ marginLeft: "0.5rem" }}>
            {pending ? "Recording…" : "Record vendor approval"}
          </button>
          {state.error ? (
            <span role="alert" data-testid="action-error" data-error-code={state.code ?? "error"} style={errStyle}>
              {state.error}
            </span>
          ) : null}
          {state.ok ? <span role="status" style={okStyle}>Approval recorded.</span> : null}
        </form>
      )}
      {status === "approved" && (
        <ActionForm
          action={publishMenuLocale}
          fields={{ listing_id: listingId, mvl_id: mvlId }}
          label={`Publish ${locale} menu`}
        />
      )}
    </div>
  );
}
