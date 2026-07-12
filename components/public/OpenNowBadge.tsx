"use client";

import { useEffect, useState } from "react";
import { computeOpenNow, type Weekday } from "@/lib/hours/open-now";
import type { Locale } from "@/lib/locales";
import type { HoursDTO } from "@/lib/public-read/dto";
import { ui } from "@/lib/i18n/ui";
import { cn } from "@/lib/utils";

/**
 * Live "open now" pill (CP4). The ONE client component on the public surface: it computes
 * the current state in the visitor's browser, so it is always accurate rather than frozen
 * at build time. With JS disabled it renders nothing — the server-rendered HoursTable is
 * the JS-free content that carries the schedule.
 *
 * Takes `locale` (not the strings object) because UiStrings contains formatter FUNCTIONS,
 * which cannot cross the server→client props boundary; it resolves ui() itself (the i18n
 * module is client-safe). `hours` is serializable data.
 */
export function OpenNowBadge({ hours, locale }: { hours: HoursDTO; locale: Locale }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // Client-only current time (avoids a server/client hydration mismatch); refresh each minute.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;

  const strings = ui(locale);
  const state = computeOpenNow(hours, now);
  if (state.state === "unknown") return null;

  const dayLabel = (day: "today" | "tomorrow" | Weekday | null): string =>
    day === "today" ? strings.today : day === "tomorrow" ? strings.tomorrow : day ? strings.weekdays[day] : "";

  let text: string;
  let isOpen = false;
  if (state.state === "open") {
    isOpen = true;
    text = state.closesAt ? `${strings.open} · ${strings.closesAt(state.closesAt)}` : strings.open;
  } else if (state.state === "appointment_only") {
    text = strings.appointmentOnly;
  } else {
    text = state.opensAt ? `${strings.closed} · ${strings.opensAt(state.opensAt, dayLabel(state.opensDay))}` : strings.closed;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip px-3 py-1 text-[12.5px] font-semibold",
        isOpen ? "bg-success-bg text-success" : "bg-neutral text-secondary",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", isOpen ? "bg-success" : "bg-disabled")} aria-hidden />
      {text}
    </span>
  );
}
