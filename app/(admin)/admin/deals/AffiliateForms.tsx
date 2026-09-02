"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { adminErrorClassName, adminInputClassName, adminLabelClassName, adminSuccessClassName } from "@/components/admin/formStyles";
import { createAffiliateLink, setAffiliateLinkStatus, type DealActionState } from "./actions";

function Feedback({ state }: { state: DealActionState }) {
  if (state.error) return <p role="alert" className={adminErrorClassName}>{state.error}</p>;
  if (state.ok) return <p role="status" className={adminSuccessClassName}>Saved.</p>;
  return null;
}

export function CreateAffiliateLinkForm({ listings }: { listings: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(createAffiliateLink, {});
  return <form action={action} aria-label="Add tracked affiliate link" className="grid gap-4 sm:grid-cols-2">
    <label className={`${adminLabelClassName} sm:col-span-2`}>Listing<select name="listing_id" required defaultValue="" className={adminInputClassName}><option value="" disabled>Select a listing</option>{listings.map((listing)=><option key={listing.id} value={listing.id}>{listing.name}</option>)}</select></label>
    <label className={adminLabelClassName}>Partner key<input name="partner_key" required pattern="[a-z0-9][a-z0-9_-]{1,39}" placeholder="partner-name" className={adminInputClassName}/></label>
    <label className={adminLabelClassName}>Partner display name<input name="partner_name" required minLength={2} maxLength={80} className={adminInputClassName}/></label>
    <label className={`${adminLabelClassName} sm:col-span-2`}>Tracked destination URL<input type="url" name="destination_url" required inputMode="url" placeholder="https://partner.example/path?ref=…" className={adminInputClassName}/></label>
    <label className={adminLabelClassName}>Context<select name="context" defaultValue="nearby_activity" className={adminInputClassName}><option value="nearby_activity">Nearby activity</option><option value="reservation">Reservation</option><option value="transportation">Transportation</option><option value="other">Other</option></select></label>
    <label className={adminLabelClassName}>Sort order<input type="number" name="sort_order" defaultValue="0" min="-1000" max="1000" className={adminInputClassName}/></label>
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button disabled={pending}>{pending ? "Adding…" : "Add tracked link"}</Button><Feedback state={state}/></div>
  </form>;
}

export function AffiliateLinkStatusForm({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(setAffiliateLinkStatus, {});
  const next = status === "active" ? "hidden" : "active";
  return <form action={action} className="flex flex-wrap items-center gap-3"><input type="hidden" name="id" value={id}/><Button name="status" value={next} variant="outline" size="sm" disabled={pending}>{pending ? "Saving…" : next === "hidden" ? "Hide link" : "Restore link"}</Button><Feedback state={state}/></form>;
}
