"use client";

import { useState, type FormEvent } from "react";
import { correctionFields } from "@/lib/corrections/schema";
import type { Locale } from "@/lib/locales";
import type { TrustStrings } from "@/lib/i18n/trust";

type FormStrings = Pick<TrustStrings,
  "fieldLabel" | "detailsLabel" | "detailsHint" | "nameLabel" | "emailLabel" |
  "contactHint" | "submit" | "submitting" | "successMessage" | "error" | "rateLimited" | "fields"
>;

export function CorrectionForm({ listingId, locale, strings }: { listingId: string; locale: Locale; strings: FormStrings }) {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error" | "rate">("idle");
  const [reference, setReference] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/change-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, listingId, locale }),
    }).catch(() => null);
    if (!response) return setStatus("error");
    const payload = await response.json().catch(() => ({})) as { reference?: string };
    if (response.ok) {
      setReference(payload.reference ?? "");
      setStatus("success");
      event.currentTarget.reset();
    } else {
      setStatus(response.status === 429 ? "rate" : "error");
    }
  }

  if (status === "success") {
    return <p role="status" tabIndex={-1} className="rounded-card border border-teal/30 bg-info-bg p-5 text-[14px] leading-relaxed text-ink">{strings.successMessage.replace("{reference}", reference)}</p>;
  }

  const inputClass = "mt-2 min-h-11 w-full rounded-field border border-hairline bg-white px-3 py-2 text-[14px] text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20";
  return (
    <form onSubmit={submit} className="space-y-5" aria-describedby="correction-contact-hint">
      <div>
        <label htmlFor="field" className="text-[13px] font-bold text-ink">{strings.fieldLabel}</label>
        <select id="field" name="field" required className={inputClass}>
          {correctionFields.map((field) => <option key={field} value={field}>{strings.fields[field]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="details" className="text-[13px] font-bold text-ink">{strings.detailsLabel}</label>
        <p id="details-hint" className="mt-1 text-[12px] leading-relaxed text-secondary">{strings.detailsHint}</p>
        <textarea id="details" name="details" required minLength={10} maxLength={2000} rows={7} aria-describedby="details-hint" className={inputClass} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-[13px] font-bold text-ink">{strings.nameLabel}<input name="name" maxLength={100} autoComplete="name" className={inputClass} /></label>
        <label className="text-[13px] font-bold text-ink">{strings.emailLabel}<input name="email" type="email" maxLength={320} autoComplete="email" className={inputClass} /></label>
      </div>
      <div className="absolute -left-[10000px]" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p id="correction-contact-hint" className="text-[12px] leading-relaxed text-secondary">{strings.contactHint}</p>
      {status === "error" ? <p role="alert" className="text-[13px] font-semibold text-red-700">{strings.error}</p> : null}
      {status === "rate" ? <p role="alert" className="text-[13px] font-semibold text-red-700">{strings.rateLimited}</p> : null}
      <button type="submit" disabled={status === "sending"} className="inline-flex min-h-11 items-center justify-center rounded-cta bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-60">
        {status === "sending" ? strings.submitting : strings.submit}
      </button>
    </form>
  );
}
