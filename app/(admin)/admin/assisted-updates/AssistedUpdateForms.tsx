"use client";

import { useActionState } from "react";
import {
  adminErrorClassName,
  adminInputClassName,
  adminLabelClassName,
  adminSuccessClassName,
} from "@/components/admin/formStyles";
import { Button } from "@/components/ui/button";
import {
  recordAssistedResponse,
  recordAssistedUpdate,
  type AssistedUpdateActionState,
} from "./actions";

type ListingChoice = { id: string; name: string };

export function AssistedUpdateIntake({ listings, defaultReceivedAt }: { listings: ListingChoice[]; defaultReceivedAt: string }) {
  const [state, action, pending] = useActionState<AssistedUpdateActionState, FormData>(recordAssistedUpdate, {});

  return (
    <form action={action} aria-label="Record assisted update" className="grid gap-4 rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:grid-cols-2 sm:p-6">
      <label className={`${adminLabelClassName} sm:col-span-2`}>
        Listing
        <select name="listing_id" required defaultValue="" disabled={pending} className={adminInputClassName}>
          <option value="" disabled>Select a listing</option>
          {listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.name}</option>)}
        </select>
      </label>

      <label className={adminLabelClassName}>
        Channel
        <select name="channel" required defaultValue="email" disabled={pending} className={adminInputClassName}>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
      </label>

      <label className={adminLabelClassName}>
        Message language
        <select name="locale" required defaultValue="en" disabled={pending} className={adminInputClassName}>
          <option value="en">English</option>
          <option value="ja">Japanese</option>
        </select>
      </label>

      <label className={adminLabelClassName}>
        Sender email or phone
        <input name="from_address" required minLength={3} maxLength={320} disabled={pending} className={adminInputClassName} autoComplete="off" />
      </label>

      <label className={adminLabelClassName}>
        Received (Hawaii time)
        <input type="datetime-local" name="received_at" required defaultValue={defaultReceivedAt} disabled={pending} className={adminInputClassName} />
      </label>

      <label className={`${adminLabelClassName} sm:col-span-2`}>
        Original message
        <textarea name="body" required minLength={10} maxLength={5000} rows={5} disabled={pending} className={`${adminInputClassName} resize-y`} />
        <span className="mt-2 block text-xs font-normal text-muted">Restricted evidence · 10–5,000 characters</span>
      </label>

      <label className={adminLabelClassName}>
        Requested field
        <select name="field" required defaultValue="" disabled={pending} className={adminInputClassName}>
          <option value="" disabled>Select a field</option>
          <option value="name">Name</option>
          <option value="address">Address</option>
          <option value="phone">Phone</option>
          <option value="hours">Hours</option>
          <option value="menu">Menu</option>
          <option value="closure">Closure</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className={`${adminLabelClassName} sm:col-span-2`}>
        Correction summary
        <textarea name="details" required minLength={10} maxLength={2000} rows={3} disabled={pending} className={`${adminInputClassName} resize-y`} placeholder="Summarize the requested factual change for editorial review." />
      </label>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending || listings.length === 0}>{pending ? "Recording…" : "Record update"}</Button>
        <span className="text-xs text-muted">Creates a linked correction without applying it.</span>
      </div>

      {state.error ? <p role="alert" className={`${adminErrorClassName} sm:col-span-2`}>{state.error}</p> : null}
      {state.ok ? <p role="status" className={`${adminSuccessClassName} sm:col-span-2`}>Update recorded and sent to Corrections.</p> : null}
    </form>
  );
}

export function AssistedResponseForm({ messageId }: { messageId: string }) {
  const [state, action, pending] = useActionState<AssistedUpdateActionState, FormData>(recordAssistedResponse, {});

  return (
    <form action={action} className="grid gap-4 rounded-card border border-hairline bg-neutral/40 p-4 sm:p-5">
      <input type="hidden" name="message_id" value={messageId} />
      <label className={adminLabelClassName}>
        Response record
        <textarea name="response_note" required minLength={3} maxLength={2000} rows={3} disabled={pending} className={`${adminInputClassName} resize-y`} placeholder="Record when and how the response was sent. Do not paste unnecessary personal data." />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Mark responded"}</Button>
        <span className="text-xs text-muted">This records the reply; it does not send one.</span>
      </div>
      {state.error ? <p role="alert" className={adminErrorClassName}>{state.error}</p> : null}
      {state.ok ? <p role="status" className={adminSuccessClassName}>Response recorded.</p> : null}
    </form>
  );
}
