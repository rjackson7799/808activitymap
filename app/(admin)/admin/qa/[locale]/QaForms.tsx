"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import type { ListingTranslation, MenuQaItem, QaLocale, QaTargetType } from "@/lib/language-qa/admin";
import {
  claimQaItem, decideQaItem, pauseQaWork, saveListingTranslation, saveMenuItem, saveMenuSection, startQaWork,
  type QaActionState,
} from "../actions";

const initial: QaActionState = {};
const field = "mt-1.5 min-h-11 w-full rounded-field border border-hairline-strong bg-field px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20";
const label = "text-xs font-bold uppercase tracking-[0.08em] text-muted";

function Result({ state }: { state: QaActionState }) {
  if (state.error) return <p role="alert" className="mt-3 text-sm font-medium text-error">{state.error}</p>;
  if (state.ok) return <p role="status" className="mt-3 text-sm font-medium text-success">Saved.</p>;
  return null;
}

function TargetFields({ locale, type, id }: { locale: QaLocale; type: QaTargetType; id: string }) {
  return <><input type="hidden" name="locale" value={locale} /><input type="hidden" name="target_type" value={type} /><input type="hidden" name="target_id" value={id} /></>;
}

export function WorkControls({ locale, type, id, listingId, assignedTo, activeActor, currentUser, canReview }: {
  locale: QaLocale; type: QaTargetType; id: string; listingId: string; assignedTo: string | null;
  activeActor: string | null; currentUser: string; canReview: boolean;
}) {
  const [claimState, claimAction, claimPending] = useActionState(claimQaItem, initial);
  const [startState, startAction, startPending] = useActionState(startQaWork, initial);
  const [pauseState, pauseAction, pausePending] = useActionState(pauseQaWork, initial);
  const [decisionState, decisionAction, decisionPending] = useActionState(decideQaItem, initial);
  if (!canReview) return <p className="rounded-field bg-neutral p-4 text-sm text-secondary">Your role can monitor this queue but cannot review {locale.toUpperCase()} content.</p>;
  const mine = assignedTo === currentUser;
  const activeMine = activeActor === currentUser;
  return <div className="space-y-3">
    {!assignedTo ? <form action={claimAction}><TargetFields locale={locale} type={type} id={id} /><Button disabled={claimPending} type="submit" variant="outline" size="sm">{claimPending ? "Claiming…" : "Claim item"}</Button><Result state={claimState} /></form> : null}
    {mine && !activeMine ? <form action={startAction}><TargetFields locale={locale} type={type} id={id} /><Button disabled={startPending} type="submit" variant="outline" size="sm">{startPending ? "Starting…" : "Start work timer"}</Button><Result state={startState} /></form> : null}
    {activeMine ? <form action={pauseAction}><TargetFields locale={locale} type={type} id={id} /><Button disabled={pausePending} type="submit" variant="outline" size="sm">{pausePending ? "Pausing…" : "Pause timer"}</Button><Result state={pauseState} /></form> : null}
    {mine ? <div className="flex flex-wrap gap-2">
      <form action={decisionAction}><TargetFields locale={locale} type={type} id={id} /><input type="hidden" name="listing_id" value={listingId} /><input type="hidden" name="outcome" value="approved" /><Button disabled={decisionPending} type="submit" size="sm">Approve QA</Button></form>
      <form action={decisionAction}><TargetFields locale={locale} type={type} id={id} /><input type="hidden" name="listing_id" value={listingId} /><input type="hidden" name="outcome" value="rework" /><Button disabled={decisionPending} type="submit" variant="outline" size="sm">Return for rework</Button></form>
    </div> : null}
    {assignedTo && !mine ? <p className="text-sm text-secondary">Assigned to another reviewer.</p> : null}
    <Result state={decisionState} />
  </div>;
}

export function ListingTranslationForm({ locale, id, value }: { locale: QaLocale; id: string; value: ListingTranslation }) {
  const [state, action, pending] = useActionState(saveListingTranslation, initial);
  return <form action={action} aria-label="Edit listing translation" className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="target_id" value={id} />
    <Text name="name" title="Localized name" defaultValue={value.name} required /><Text name="slug" title="Localized slug" defaultValue={value.slug} />
    <Text name="seo_title" title="SEO title" defaultValue={value.seoTitle} wide /><Area name="seo_desc" title="SEO description" defaultValue={value.seoDescription} />
    <Area name="editorial_note" title="Editorial note" defaultValue={value.editorialNote} />
    <div className="sm:col-span-2"><Button disabled={pending} type="submit" size="sm">{pending ? "Saving…" : "Save listing translation"}</Button><Result state={state} /></div>
  </form>;
}

export function MenuSectionForm({ locale, sectionId, name }: { locale: QaLocale; sectionId: string; name: string | null }) {
  const [state, action, pending] = useActionState(saveMenuSection, initial);
  return <form action={action} className="flex flex-wrap items-end gap-3" aria-label="Edit menu section translation">
    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="section_id" value={sectionId} />
    <div className="min-w-52 flex-1"><label className={label} htmlFor={`section-${sectionId}`}>Localized section name</label><input className={field} id={`section-${sectionId}`} name="name" defaultValue={name ?? ""} required /></div>
    <Button disabled={pending} type="submit" size="sm">{pending ? "Saving…" : "Save section"}</Button><Result state={state} />
  </form>;
}

export function MenuItemForm({ locale, item }: { locale: QaLocale; item: MenuQaItem }) {
  const [state, action, pending] = useActionState(saveMenuItem, initial);
  return <form action={action} className="grid gap-3 sm:grid-cols-2" aria-label={`Edit menu item ${item.sourceName ?? item.id}`}>
    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="item_id" value={item.id} />
    <Text name="name" title="Localized item name" defaultValue={item.name} required /><Text name="transliteration" title="Transliteration" defaultValue={item.transliteration} />
    <Text name="original_name" title="Original name" defaultValue={item.originalName} /><Area name="description" title="Description" defaultValue={item.description} />
    <label className="flex min-h-11 items-center gap-3 rounded-field border border-hairline-strong bg-field px-3 text-sm font-semibold text-ink sm:col-span-2"><input type="checkbox" name="human_confirmed" defaultChecked={item.humanConfirmed} className="h-5 w-5 accent-teal" />Human-confirmed translation and money terms</label>
    <div className="sm:col-span-2"><Button disabled={pending} type="submit" size="sm">{pending ? "Saving…" : "Save menu item"}</Button><Result state={state} /></div>
  </form>;
}

function Text({ name, title, defaultValue, required=false, wide=false }: { name: string; title: string; defaultValue: string | null; required?: boolean; wide?: boolean }) {
  const id = useId();
  return <div className={wide ? "sm:col-span-2" : undefined}><label className={label} htmlFor={id}>{title}</label><input id={id} className={field} name={name} defaultValue={defaultValue ?? ""} required={required} /></div>;
}
function Area({ name, title, defaultValue }: { name: string; title: string; defaultValue: string | null }) {
  const id = useId();
  return <div><label className={label} htmlFor={id}>{title}</label><textarea id={id} className={`${field} min-h-24 resize-y`} name={name} defaultValue={defaultValue ?? ""} /></div>;
}
