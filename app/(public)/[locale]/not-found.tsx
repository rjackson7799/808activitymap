"use client";

import { ArrowLeft } from "lucide-react";
import { useParams } from "next/navigation";
import { isLocale, type Locale } from "@/lib/locales";
import { ui } from "@/lib/i18n/ui";
import { homePath } from "@/lib/public-read/paths";

export default function PublicNotFound() {
  const params = useParams<{ locale?: string | string[] }>();
  const rawLocale = Array.isArray(params.locale) ? params.locale[0] : params.locale;
  const locale: Locale = rawLocale && isLocale(rawLocale) ? rawLocale : "en";
  const strings = ui(locale);

  return (
    <main id="main-content" className="public-page grid min-h-dvh place-items-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-xl rounded-card border border-hairline-strong bg-surface p-7 text-center shadow-card sm:p-10">
        <p className="font-serif text-6xl leading-none text-terracotta" aria-hidden>404</p>
        <h1 className="mt-5 font-serif text-[2rem] leading-tight text-ink sm:text-[2.5rem]">{strings.notFoundTitle}</h1>
        <p className="mx-auto mt-4 max-w-md text-[14px] leading-[1.75] text-body">{strings.notFoundBody}</p>
        <p className="mt-7">
          <a
            href={homePath(locale)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-cta bg-ink px-5 text-[13px] font-bold text-white transition hover:bg-ink-soft sm:w-auto"
          >
            <ArrowLeft size={16} aria-hidden />
            {strings.browse}
          </a>
        </p>
      </div>
    </main>
  );
}
