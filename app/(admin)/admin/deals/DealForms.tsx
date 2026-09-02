"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { adminErrorClassName, adminInputClassName, adminLabelClassName, adminSuccessClassName } from "@/components/admin/formStyles";
import { activateDeal, createDeal, killDeal, reviewDealLocale, saveDealLocale, type DealActionState } from "./actions";

function Feedback({ state }: { state: DealActionState }) {
  if (state.error) return <p role="alert" className={adminErrorClassName}>{state.error}</p>;
  if (state.ok) return <p role="status" className={adminSuccessClassName}>Saved.</p>;
  return null;
}

export function CreateDealForm({ listings }: { listings: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(createDeal, {});
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <label className={`${adminLabelClassName} sm:col-span-2`}>Listing<select name="listing_id" required defaultValue="" className={adminInputClassName}><option value="" disabled>Select a listing</option>{listings.map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    <label className={`${adminLabelClassName} sm:col-span-2`}>Reveal code<input name="reveal_code" required maxLength={120} className={adminInputClassName} /></label>
    <label className={adminLabelClassName}>Starts (Hawaii time)<input type="datetime-local" name="starts_at" required className={adminInputClassName} /></label>
    <label className={adminLabelClassName}>Expires (Hawaii time)<input type="datetime-local" name="expires_at" required className={adminInputClassName} /></label>
    <label className="flex items-center gap-3 text-sm font-semibold text-ink sm:col-span-2"><input type="checkbox" name="sponsor_label" className="h-4 w-4 accent-terracotta"/>Label this as sponsored content</label>
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button disabled={pending}>{pending ? "Creating…" : "Create offer draft"}</Button><Feedback state={state} /></div>
  </form>;
}

export function LocaleForm({ dealId, locale, value }: { dealId: string; locale: string; value?: { title: string; terms: string } }) {
  const [state, action, pending] = useActionState(saveDealLocale, {});
  return <form action={action} aria-label={`Edit ${locale.toUpperCase()} offer copy`} className="space-y-3 rounded-field border border-hairline bg-neutral/35 p-4">
    <input type="hidden" name="deal_id" value={dealId}/><input type="hidden" name="locale" value={locale}/>
    <p className="text-xs font-bold uppercase tracking-wider text-secondary">{locale}</p>
    <label className={adminLabelClassName}>Title<input name="title" defaultValue={value?.title} required minLength={2} maxLength={120} className={adminInputClassName}/></label>
    <label className={adminLabelClassName}>Terms<textarea name="terms" defaultValue={value?.terms} required minLength={3} maxLength={1000} rows={3} className={`${adminInputClassName} resize-y`}/></label>
    <Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Saving…" : `Save ${locale.toUpperCase()} copy`}</Button><Feedback state={state}/>
  </form>;
}

export function ReviewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(reviewDealLocale, {});
  return <form action={action} aria-label="Review localized offer" className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={id}/><Button name="approved" value="true" size="sm" disabled={pending}>Approve wording</Button><Button name="approved" value="false" variant="outline" size="sm" disabled={pending}>Reject</Button><Feedback state={state}/></form>;
}

export function ActivateForm({ dealId, evidence }: { dealId: string; evidence: Array<{ id: string; path: string }> }) {
  const [state, action, pending] = useActionState(activateDeal, {});
  return <form action={action} aria-label="Approve and schedule offer" className="space-y-3"><input type="hidden" name="deal_id" value={dealId}/><label className={adminLabelClassName}>Vendor permission evidence<select name="evidence_media_id" defaultValue="" required className={adminInputClassName}><option value="" disabled>Select approved evidence</option>{evidence.map((e)=><option key={e.id} value={e.id}>{e.path}</option>)}</select></label><Button disabled={pending || evidence.length===0}>{pending ? "Activating…" : "Approve and schedule"}</Button><Feedback state={state}/></form>;
}

export function KillForm({ dealId }: { dealId: string }) {
  const [state, action, pending] = useActionState(killDeal, {});
  return <form action={action} className="flex flex-wrap items-center gap-3"><input type="hidden" name="deal_id" value={dealId}/><Button variant="outline" size="sm" disabled={pending}>{pending ? "Removing…" : "Remove offer now"}</Button><Feedback state={state}/></form>;
}
