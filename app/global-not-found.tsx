import type { Metadata } from "next";
import Link from "next/link";
import "@/app/globals.css";
import { fontVariables } from "@/app/fonts";

/**
 * Global 404 (Next 16). REQUIRED once `app/layout.tsx` is removed in favor of
 * per-route-group root layouts (CP4 multi-root) — it renders its own full document for
 * unmatched routes. Kept intentionally minimal and brand-neutral (D27).
 */
export const metadata: Metadata = {
  title: "Page not found",
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={fontVariables}>
      <body className="bg-sand text-body antialiased">
        <main className="grid min-h-dvh place-items-center px-4 py-12 sm:px-6">
          <div className="w-full max-w-xl rounded-card border border-hairline-strong bg-surface p-7 text-center shadow-card sm:p-10">
            <p className="font-serif text-6xl leading-none text-terracotta" aria-hidden>404</p>
            <h1 className="mt-5 font-serif text-[2rem] leading-tight text-ink sm:text-[2.5rem]">Page not found</h1>
            <p className="mx-auto mt-4 max-w-md text-[14px] leading-[1.75] text-body">The page you’re looking for doesn’t exist or has moved.</p>
            <p className="mt-7">
              <Link href="/" className="inline-flex min-h-11 w-full items-center justify-center rounded-cta bg-ink px-5 text-[13px] font-bold text-white transition hover:bg-ink-soft sm:w-auto">
                Browse listings
              </Link>
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
