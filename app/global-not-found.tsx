import type { Metadata } from "next";
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
      <body className="bg-sand text-body">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="font-serif text-3xl text-ink">Page not found</h1>
          <p className="text-secondary">The page you’re looking for doesn’t exist or has moved.</p>
        </main>
      </body>
    </html>
  );
}
