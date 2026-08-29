import { Marcellus, Noto_Sans_JP, Noto_Sans_KR, Plus_Jakarta_Sans } from "next/font/google";

/**
 * Type system (design-tokens.md): Marcellus (display/serif, wt 400) for headings,
 * titles, and numerals — the face that keeps the surface from reading as stock SaaS;
 * Plus Jakarta Sans (body/UI) for everything else. Japanese and Korean replace both
 * roles with their matching Noto Sans family, as specified in docs/design.md; this
 * avoids mixed Latin/CJK fallback metrics in headings and controls.
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

export const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-jp",
  display: "swap",
});

export const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-noto-kr",
  display: "swap",
});

/** Combined variable classes to apply on <html>. */
export const fontVariables = `${marcellus.variable} ${plusJakarta.variable} ${notoSansJp.variable} ${notoSansKr.variable}`;
