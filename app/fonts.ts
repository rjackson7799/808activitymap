import { Marcellus, Plus_Jakarta_Sans } from "next/font/google";

/**
 * Type system (design-tokens.md): Marcellus (display/serif, wt 400) for headings,
 * titles, and numerals — the face that keeps the surface from reading as stock SaaS;
 * Plus Jakarta Sans (body/UI) for everything else. Loaded once here and applied as
 * CSS variables so BOTH root layouts (public + admin, CP4 multi-root) share the same
 * self-hosted font instances. Latin-only faces; JA/KO fall back through the stack in
 * globals.css (--font-serif → serif, --font-sans → system-ui).
 */
export const marcellus = Marcellus({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-marcellus",
  display: "swap",
});

export const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

/** Combined variable classes to apply on <html>. */
export const fontVariables = `${marcellus.variable} ${plusJakarta.variable}`;
