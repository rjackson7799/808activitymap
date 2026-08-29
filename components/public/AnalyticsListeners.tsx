"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { emit } from "@/lib/analytics/client";

/**
 * The single analytics client island on the public surface. All listeners are
 * additive to server-rendered DOM, so content and navigation still work with
 * JavaScript disabled.
 */
export function AnalyticsListeners() {
  const pathname = usePathname();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    const context = document.querySelector<HTMLElement>("[data-analytics-listing]");
    const listingId = context?.dataset.analyticsListing ?? null;
    const locale = document.documentElement.lang || null;

    const isClientNavigation =
      previousPathname.current !== null && previousPathname.current !== pathname;
    previousPathname.current = pathname;
    if (listingId && isClientNavigation) emit("listing_view", { listingId, locale });

    const onClick = (event: MouseEvent) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-analytics]",
      );
      if (!element) return;
      if (element.dataset.analytics === "directions") {
        emit("direction_click", {
          listingId,
          locale,
          props: { provider: element.dataset.provider ?? "google" },
        });
      } else if (element.dataset.analytics === "language-switch") {
        const from = element.dataset.from;
        const to = element.dataset.to;
        if (from && to) emit("language_switch", { locale, props: { from, to } });
      }
    };
    document.addEventListener("click", onClick, { capture: true });

    const timers = new Map<Element, number>();
    const fired = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const element = entry.target;
          if (entry.isIntersecting && !fired.has(element)) {
            timers.set(
              element,
              window.setTimeout(() => {
                fired.add(element);
                const sectionId = (element as HTMLElement).dataset.sectionId;
                emit("menu_view", {
                  listingId,
                  locale,
                  props: sectionId ? { section_id: sectionId } : {},
                });
              }, 1_000),
            );
          } else if (!entry.isIntersecting) {
            const timer = timers.get(element);
            if (timer !== undefined) {
              window.clearTimeout(timer);
              timers.delete(element);
            }
          }
        }
      },
      { threshold: 0.5 },
    );
    document
      .querySelectorAll("[data-analytics='menu-section']")
      .forEach((element) => observer.observe(element));

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      for (const timer of timers.values()) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
