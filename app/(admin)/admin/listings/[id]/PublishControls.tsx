"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  adminErrorClassName,
  adminInputClassName,
  adminLabelClassName,
  adminSuccessClassName,
} from "@/components/admin/formStyles";
import {
  publishLocale,
  unpublishLocale,
  transitionListingLocale,
  recordMenuApproval,
  publishMenuLocale,
  type ActionState,
} from "../actions";

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
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={label.startsWith("Unpublish") ? "outline" : "primary"} size="md" disabled={pending}>
        {pending ? "Working…" : label}
      </Button>
      {state.error ? (
        <span role="alert" data-testid="action-error" data-error-code={state.code ?? "error"} className={adminErrorClassName}>
          {state.error}
        </span>
      ) : null}
      {state.ok ? <span role="status" className={adminSuccessClassName}>Done.</span> : null}
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
    <div className="mt-5 flex flex-wrap gap-2 border-t border-hairline pt-4">
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
    <div className="mt-5 border-t border-hairline pt-4">
      {(status === "qa_approved" || status === "vendor_approval_pending") && (
        <form action={formAction} aria-label={`Record vendor approval for the ${locale} menu`} className="space-y-4">
          <input type="hidden" name="listing_id" value={listingId} />
          <input type="hidden" name="mvl_id" value={mvlId} />
          <div>
            <label htmlFor={`evidence-${mvlId}`} className={adminLabelClassName}>Approval evidence</label>
            <select id={`evidence-${mvlId}`} name="evidence_media_id" defaultValue="" className={adminInputClassName} disabled={pending}>
              <option value="">— none —</option>
              {evidenceMedia.map((m) => (
                <option key={m.id} value={m.id}>{m.path}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Recording…" : "Record vendor approval"}
          </Button>
          {state.error ? (
            <p role="alert" data-testid="action-error" data-error-code={state.code ?? "error"} className={adminErrorClassName}>
              {state.error}
            </p>
          ) : null}
          {state.ok ? <p role="status" className={adminSuccessClassName}>Approval recorded.</p> : null}
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
