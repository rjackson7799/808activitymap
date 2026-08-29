import type { Locale } from "@/lib/locales";
import type { HoursDTO } from "@/lib/public-read/dto";
import { ui } from "@/lib/i18n/ui";

/**
 * Live "open now" pill. It serializes only public hours and localized display
 * templates; the dependency-free public enhancement script computes current
 * state in the venue timezone. With JS disabled it remains hidden while the
 * server-rendered HoursTable still carries the complete schedule.
 */
export function OpenNowBadge({ hours, locale }: { hours: HoursDTO; locale: Locale }) {
  const strings = ui(locale);
  const copy = {
    open: strings.open,
    closed: strings.closed,
    appointmentOnly: strings.appointmentOnly,
    closesAt: strings.closesAt("{time}"),
    opensAt: strings.opensAt("{time}", "{day}"),
    today: strings.today,
    tomorrow: strings.tomorrow,
    weekdays: strings.weekdays,
  };

  return (
    <span
      data-open-now
      data-hours={JSON.stringify(hours)}
      data-copy={JSON.stringify(copy)}
      aria-live="polite"
      className="hidden items-center gap-1.5 rounded-chip px-3 py-1 text-[12.5px] font-semibold"
    >
      <span data-open-now-dot className="h-2 w-2 rounded-full" aria-hidden />
      <span data-open-now-text />
    </span>
  );
}
