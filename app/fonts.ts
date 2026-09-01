import { Marcellus, Plus_Jakarta_Sans } from "next/font/google";

/**
 * Type system (design-tokens.md): Marcellus (display/serif, wt 400) for headings,
 * titles, and numerals — the face that keeps the surface from reading as stock SaaS;
 * Plus Jakarta Sans (body/UI) for everything else. Japanese uses the local
 * Noto Sans JP/system Japanese stack so its large unicode-range stylesheet is
 * not render-blocking on every English page. Korean remains unserved until Slice 2.
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
  // The homepage LCP is body copy. Let constrained first visits use the
  // adjusted system fallback instead of competing with critical CSS for a
  // font that is already optional; normal/cached visits still use Jakarta.
  display: "optional",
  preload: false,
});

/** Combined variable classes to apply on <html>. */
export const fontVariables = `${marcellus.variable} ${plusJakarta.variable}`;
