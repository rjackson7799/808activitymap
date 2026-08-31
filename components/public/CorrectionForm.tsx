"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, Send } from "lucide-react";
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
  const formRef = useRef<HTMLFormElement>(null);

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
      formRef.current?.reset();
    } else {
      setStatus(response.status === 429 ? "rate" : "error");
    }
  }

  if (status === "success") {
    return (
      <div role="status" tabIndex={-1} className="rounded-card border border-success/20 bg-success-bg p-6 text-center sm:p-8">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-white text-success shadow-card" aria-hidden>
          <Check size={22} strokeWidth={2.5} />
        </span>
        <p className="mx-auto mt-4 max-w-lg text-[14px] font-medium leading-7 text-ink">
          {strings.successMessage.replace("{reference}", reference)}
        </p>
      </div>
    );
  }

  const inputClass = "mt-2 min-h-12 w-full rounded-field border border-hairline-strong bg-white px-3.5 py-2.5 text-[14px] text-ink shadow-sm placeholder:text-muted focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 disabled:cursor-wait disabled:bg-neutral disabled:text-muted";
  return (
    <form ref={formRef} onSubmit={submit} className="space-y-6" aria-describedby="correction-contact-hint" aria-busy={status === "sending"}>
      <div>
        <label htmlFor="field" className="text-[13px] font-bold text-ink">{strings.fieldLabel}</label>
        <select id="field" name="field" required className={inputClass} disabled={status === "sending"}>
          {correctionFields.map((field) => <option key={field} value={field}>{strings.fields[field]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="details" className="text-[13px] font-bold text-ink">{strings.detailsLabel}</label>
        <p id="details-hint" className="mt-1 text-[12px] leading-relaxed text-secondary">{strings.detailsHint}</p>
        <textarea id="details" name="details" required minLength={10} maxLength={2000} rows={7} aria-describedby="details-hint" className={`${inputClass} resize-y`} disabled={status === "sending"} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-[13px] font-bold text-ink">{strings.nameLabel}<input name="name" maxLength={100} autoComplete="name" className={inputClass} disabled={status === "sending"} /></label>
        <label className="text-[13px] font-bold text-ink">{strings.emailLabel}<input name="email" type="email" maxLength={320} autoComplete="email" className={inputClass} disabled={status === "sending"} /></label>
      </div>
      <div className="absolute -left-[10000px]" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="rounded-field border border-hairline bg-neutral/50 px-4 py-3">
        <p id="correction-contact-hint" className="text-[12px] leading-relaxed text-secondary">{strings.contactHint}</p>
      </div>
      {status === "error" ? <p role="alert" className="rounded-field border border-error/20 bg-error-bg px-4 py-3 text-[13px] font-semibold text-error">{strings.error}</p> : null}
      {status === "rate" ? <p role="alert" className="rounded-field border border-error/20 bg-error-bg px-4 py-3 text-[13px] font-semibold text-error">{strings.rateLimited}</p> : null}
      <button type="submit" disabled={status === "sending"} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-cta bg-ink px-5 text-[13.5px] font-bold text-white shadow-lift transition hover:bg-ink-soft disabled:opacity-60 sm:w-auto">
        <Send size={16} aria-hidden />
        {status === "sending" ? strings.submitting : strings.submit}
      </button>
    </form>
  );
}
