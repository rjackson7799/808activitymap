"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { emit } from "@/lib/analytics/client";

/**
 * Client analytics listeners (CP5). The ONE analytics client island on the
 * public surface. Every listener is ADDITIVE on already-server-rendered DOM,
 * keyed off `data-analytics` attributes — nothing here gates content or
 * navigation, so the JS-free pass is unaffected. Emits the client (enrichment)
 * events: listing_view, menu_view (viewport ≥1s), language_switch,
 * share_click, direction_click.
 */
export function AnalyticsListeners() {
  // Re-run on client-side navigation so a new page's DOM (listing id, menu
  // sections) is picked up and its listing_view fires (server capture skips
  // RSC navigations by design — ADR-005 — so the client enriches those).
  const pathname = usePathname();
  const previousPathname = useRef<string | null>(null);
  useEffect(() => {
    const ctx = document.querySelector<HTMLElement>("[data-analytics-listing]");
    const listingId = ctx?.dataset.analyticsListing ?? null;
    const locale = document.documentElement.lang || null;

    // A full document load is already counted by the authoritative proxy
    // capture. Emit only when the pathname actually changed in this mounted
    // app, which identifies a normal client-side navigation. This avoids a
    // hydration duplicate while still counting SPA visits to a listing.
    const isClientNavigation = previousPathname.current !== null && previousPathname.current !== pathname;
    previousPathname.current = pathname;
    if (listingId && isClientNavigation) emit("listing_view", { listingId, locale });

    const onClick = (event: MouseEvent) => {
      const el = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-analytics]");
      if (!el) return;
      switch (el.dataset.analytics) {
        case "directions":
          emit("direction_click", { listingId, locale, props: { provider: el.dataset.provider ?? "google" } });
          break;
        case "language-switch": {
          const from = el.dataset.from;
          const to = el.dataset.to;
          if (from && to) emit("language_switch", { locale, props: { from, to } });
          break;
        }
      }
    };
    document.addEventListener("click", onClick, { capture: true });

    // menu_view: a menu section continuously in view for ≥1s (not page load).
    const timers = new Map<Element, number>();
    const fired = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target;
          if (entry.isIntersecting && !fired.has(el)) {
            timers.set(
              el,
              window.setTimeout(() => {
                fired.add(el);
                const sectionId = (el as HTMLElement).dataset.sectionId;
                emit("menu_view", { listingId, locale, props: sectionId ? { section_id: sectionId } : {} });
              }, 1000),
            );
          } else if (!entry.isIntersecting) {
            const t = timers.get(el);
            if (t !== undefined) {
              clearTimeout(t);
              timers.delete(el);
            }
          }
        }
      },
      { threshold: 0.5 },
    );
    document.querySelectorAll("[data-analytics='menu-section']").forEach((el) => observer.observe(el));

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      for (const t of timers.values()) clearTimeout(t);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
