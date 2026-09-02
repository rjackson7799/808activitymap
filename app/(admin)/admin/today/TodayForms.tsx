"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { adminErrorClassName, adminInputClassName, adminLabelClassName, adminSuccessClassName } from "@/components/admin/formStyles";
import { archiveEdition, createEdition, publishEdition, reviewEditionLocale, saveEditionItems, saveEditionLocale, type TodayActionState } from "./actions";

function Feedback({ state }: { state: TodayActionState }) {
  if (state.error) return <p role="alert" className={adminErrorClassName}>{state.error}</p>;
  if (state.ok) return <p role="status" className={adminSuccessClassName}>Saved.</p>;
  return null;
}

export function CreateEditionForm() {
  const [state, action, pending] = useActionState(createEdition, {});
  return <form action={action} className="flex flex-wrap items-end gap-3">
    <label className={`${adminLabelClassName} min-w-56 flex-1`}>Week starts Monday<input type="date" name="week_of" required className={adminInputClassName}/></label>
    <Button disabled={pending}>{pending ? "Creating…" : "Create weekly edition"}</Button><Feedback state={state}/>
  </form>;
}

export function EditionLocaleForm({ editionId, locale, value }: { editionId: string; locale: "en"|"ja"|"ko"; value?: { title: string; dek: string; body: string } }) {
  const [state, action, pending] = useActionState(saveEditionLocale, {});
  return <form action={action} aria-label={`Edit ${locale.toUpperCase()} edition`} className="space-y-3 rounded-field border border-hairline bg-neutral/35 p-4">
    <input type="hidden" name="edition_id" value={editionId}/><input type="hidden" name="locale" value={locale}/>
    <p className="text-xs font-bold uppercase tracking-wider text-secondary">{locale}</p>
    <label className={adminLabelClassName}>Headline<input name="title" lang={locale} defaultValue={value?.title} required minLength={2} maxLength={120} className={adminInputClassName}/></label>
    <label className={adminLabelClassName}>Introduction<textarea name="dek" lang={locale} defaultValue={value?.dek} required minLength={3} maxLength={280} rows={3} className={`${adminInputClassName} resize-y`}/></label>
    <label className={adminLabelClassName}>Editorial note<textarea name="body" lang={locale} defaultValue={value?.body} required minLength={20} maxLength={5000} rows={8} className={`${adminInputClassName} resize-y`}/></label>
    <Button variant="outline" size="sm" disabled={pending}>{pending ? "Saving…" : `Save ${locale.toUpperCase()} copy`}</Button><Feedback state={state}/>
  </form>;
}

export function EditionReviewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(reviewEditionLocale, {});
  return <form action={action} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={id}/><Button name="approved" value="true" size="sm" disabled={pending}>Approve copy</Button><Button name="approved" value="false" variant="outline" size="sm" disabled={pending}>Reject</Button><Feedback state={state}/></form>;
}

export function ShortlistForm({ editionId, listings, selected }: { editionId: string; listings: Array<{id:string;name:string}>; selected: string[] }) {
  const [state, action, pending] = useActionState(saveEditionItems, {});
  return <form action={action} aria-label="Edit weekly shortlist" className="space-y-3"><input type="hidden" name="edition_id" value={editionId}/><fieldset><legend className="text-sm font-bold text-ink">Shortlist (1–6 places)</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{listings.map((listing)=><label key={listing.id} className="flex min-h-11 items-center gap-3 rounded-field border border-hairline bg-white px-3 py-2 text-sm text-ink"><input type="checkbox" name="listing_ids" value={listing.id} defaultChecked={selected.includes(listing.id)} className="h-4 w-4 accent-terracotta"/>{listing.name}</label>)}</div></fieldset><div className="flex flex-wrap items-center gap-3"><Button variant="outline" size="sm" disabled={pending}>{pending ? "Saving…" : "Save shortlist"}</Button><Feedback state={state}/></div></form>;
}

export function PublishEditionForm({ editionId }: { editionId: string }) {
  const [state, action, pending] = useActionState(publishEdition, {});
  return <form action={action} className="flex flex-wrap items-center gap-3"><input type="hidden" name="edition_id" value={editionId}/><Button disabled={pending}>{pending ? "Publishing…" : "Publish this edition"}</Button><Feedback state={state}/></form>;
}

export function ArchiveEditionForm({ editionId }: { editionId: string }) {
  const [state, action, pending] = useActionState(archiveEdition, {});
  return <form action={action} className="flex flex-wrap items-center gap-3"><input type="hidden" name="edition_id" value={editionId}/><Button variant="outline" size="sm" disabled={pending}>{pending ? "Archiving…" : "Archive edition"}</Button><Feedback state={state}/></form>;
}
