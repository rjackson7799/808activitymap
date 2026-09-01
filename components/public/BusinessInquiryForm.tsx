"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, Send } from "lucide-react";
import type { BusinessStrings } from "@/lib/i18n/business";

export function BusinessInquiryForm({
  locale,
  strings,
}: {
  locale: "en" | "ja";
  strings: BusinessStrings;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error" | "rate">("idle");
  const [reference, setReference] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/business-inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        locale,
        consent: form.get("consent") === "on",
      }),
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
          {strings.success.replace("{reference}", reference)}
        </p>
      </div>
    );
  }

  const inputClass = "mt-2 min-h-12 w-full rounded-field border border-hairline-strong bg-white px-3.5 py-2.5 text-[14px] text-ink shadow-sm placeholder:text-muted focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 disabled:cursor-wait disabled:bg-neutral disabled:text-muted";

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-6" aria-describedby="business-inquiry-privacy" aria-busy={status === "sending"}>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-[13px] font-bold text-ink">
          {strings.businessName} <span aria-hidden="true">*</span>
          <input name="businessName" required maxLength={160} autoComplete="organization" className={inputClass} disabled={status === "sending"} />
        </label>
        <label className="text-[13px] font-bold text-ink">
          {strings.contactName} <span aria-hidden="true">*</span>
          <input name="contactName" required maxLength={100} autoComplete="name" className={inputClass} disabled={status === "sending"} />
        </label>
        <label className="text-[13px] font-bold text-ink">
          {strings.email} <span aria-hidden="true">*</span>
          <input name="email" type="email" required maxLength={320} autoComplete="email" className={inputClass} disabled={status === "sending"} />
        </label>
        <label className="text-[13px] font-bold text-ink">
          {strings.phone}
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" className={inputClass} disabled={status === "sending"} />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-[13px] font-bold text-ink">
          {strings.website}
          <input name="companyWebsite" type="url" maxLength={500} autoComplete="url" placeholder="https://" className={inputClass} disabled={status === "sending"} />
        </label>
        <label className="text-[13px] font-bold text-ink">
          {strings.preferredLanguage} <span aria-hidden="true">*</span>
          <select name="preferredLanguage" required defaultValue={locale} className={inputClass} disabled={status === "sending"}>
            <option value="en">{strings.languageEnglish}</option>
            <option value="ja">{strings.languageJapanese}</option>
          </select>
        </label>
      </div>

      <div>
        <label htmlFor="business-message" className="text-[13px] font-bold text-ink">
          {strings.message} <span aria-hidden="true">*</span>
        </label>
        <p id="business-message-hint" className="mt-1 text-[12px] leading-relaxed text-secondary">{strings.messageHint}</p>
        <textarea id="business-message" name="message" required minLength={20} maxLength={2000} rows={6} aria-describedby="business-message-hint" className={`${inputClass} resize-y`} disabled={status === "sending"} />
      </div>

      <div className="absolute -left-[10000px]" aria-hidden="true">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <label className="flex items-start gap-3 rounded-field border border-hairline-strong bg-neutral/45 p-4 text-[13px] leading-6 text-ink">
        <input name="consent" type="checkbox" required className="mt-1 size-4 shrink-0 accent-[var(--color-teal-dark)]" disabled={status === "sending"} />
        <span>{strings.consent}</span>
      </label>

      <p id="business-inquiry-privacy" className="text-[12px] leading-relaxed text-secondary">{strings.privacy}</p>
      {status === "error" ? <p role="alert" className="rounded-field border border-error/20 bg-error-bg px-4 py-3 text-[13px] font-semibold text-error">{strings.error}</p> : null}
      {status === "rate" ? <p role="alert" className="rounded-field border border-error/20 bg-error-bg px-4 py-3 text-[13px] font-semibold text-error">{strings.rateLimited}</p> : null}
      <button type="submit" disabled={status === "sending"} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-cta bg-ink px-5 text-[13.5px] font-bold text-white shadow-lift transition hover:bg-ink-soft disabled:opacity-60 sm:w-auto">
        <Send size={16} aria-hidden />
        {status === "sending" ? strings.submitting : strings.submit}
      </button>
    </form>
  );
}
