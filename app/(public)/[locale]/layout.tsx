import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import "@/app/globals.css";
import { fontVariables } from "@/app/fonts";
import { isLocale } from "@/lib/locales";
import { getServedLocales } from "@/lib/public-read/server";

/**
 * Root layout for the public (public)/[locale] tree (CP4 multi-root). Renders
 * <html lang={locale}> — the reason multi-root exists: a single shared root can't set a
 * correct per-locale lang. The locale is gated against the runtime-served set
 * (locale_availability), NOT isLocale, so KO can't be reached at the route layer until
 * Slice 2 flips it on.
 *
 * dynamicParams=true (ISR): served locales are prerendered; the served-locale guard below
 * runs before any child renders, so an unserved locale (KO) still 404s with no shell. true
 * (not false) is required so the child listing/category segments can render NEW eligible
 * pages on-demand between builds — a false parent disables the child fallback.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  const locales = await getServedLocales();
  return locales.map((locale) => ({ locale }));
}

export default async function PublicRootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const served = await getServedLocales();
  if (!isLocale(locale) || !served.includes(locale)) notFound();

  return (
    <html lang={locale} className={fontVariables}>
      <body className="min-h-dvh bg-sand text-body antialiased">{children}</body>
    </html>
  );
}
