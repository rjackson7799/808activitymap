"use client";

import { useParams } from "next/navigation";
import { isLocale, type Locale } from "@/lib/locales";
import { ui } from "@/lib/i18n/ui";

const categoryPlaceholders = Array.from({ length: 6 }, (_, index) => index);

/**
 * Shared transition state for the current public route tree. It deliberately
 * mirrors the browse shell rather than exposing data-shaped placeholders, so
 * it works for home, category, listing, trust, and correction routes without
 * implying content that has not loaded yet.
 */
export default function PublicLoading() {
  const params = useParams<{ locale?: string | string[] }>();
  const rawLocale = Array.isArray(params.locale) ? params.locale[0] : params.locale;
  const locale: Locale = rawLocale && isLocale(rawLocale) ? rawLocale : "en";

  return (
    <div aria-busy="true" className="min-h-dvh bg-shell">
      <p role="status" className="sr-only">
        {ui(locale).loading}
      </p>

      <header aria-hidden="true" className="h-[4.25rem] border-b border-hairline bg-white/95">
        <div className="mx-auto flex h-full max-w-6xl animate-pulse items-center justify-between px-4 sm:px-6">
          <span className="h-5 w-36 rounded-full bg-neutral sm:w-44" />
          <span className="h-10 w-24 rounded-cta bg-field" />
        </div>
      </header>

      <main id="main-content" className="public-page" aria-hidden="true">
        <section className="border-b border-hairline bg-[var(--gradient-backdrop)]">
          <div className="mx-auto max-w-6xl animate-pulse px-4 py-14 sm:px-6 sm:py-20">
            <div className="h-2.5 w-24 rounded-full bg-terracotta/20" />
            <div className="mt-5 h-10 w-full max-w-xl rounded-field bg-neutral sm:h-14" />
            <div className="mt-5 h-3.5 w-full max-w-2xl rounded-full bg-neutral" />
            <div className="mt-2.5 h-3.5 w-3/4 max-w-lg rounded-full bg-neutral" />
          </div>
        </section>

        <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-8 sm:grid-cols-2 sm:px-6 sm:py-10 lg:grid-cols-3">
          {categoryPlaceholders.map((index) => (
            <li
              key={index}
              className="min-h-28 animate-pulse rounded-card border border-hairline bg-white px-5 py-6 shadow-card"
            >
              <div className="h-5 w-2/3 rounded-full bg-neutral" />
              <div className="mt-4 h-3 w-16 rounded-full bg-field" />
            </li>
          ))}
        </ul>
      </main>

      <footer aria-hidden="true" className="border-t border-hairline bg-white">
        <div className="mx-auto max-w-6xl animate-pulse px-4 py-8 sm:px-6">
          <div className="h-4 w-36 rounded-full bg-neutral" />
          <div className="mt-3 h-3 w-56 max-w-full rounded-full bg-field" />
        </div>
      </footer>
    </div>
  );
}
