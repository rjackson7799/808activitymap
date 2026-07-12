import type { Metadata } from "next";
import "@/app/globals.css";
import { fontVariables } from "@/app/fonts";

/**
 * Root layout for the (admin) route group (CP4 multi-root). PURE SHELL ONLY — it renders
 * <html>/<body>, fonts, and globals, nothing more. The aal2 auth guard stays in
 * `app/(admin)/admin/layout.tsx`; moving it here would wrap `/login` and self-lock staff
 * out (see the warning in that file). This mirrors what the old single root layout did
 * for the admin surface, so admin renders exactly as CP3 shipped it.
 */
export const metadata: Metadata = {
  // Brand name is env-driven (D27).
  title: process.env.BRAND_NAME ?? "Portal (dev)",
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
