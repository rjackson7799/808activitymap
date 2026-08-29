import type { HoursDTO, HoursDay } from "@/lib/public-read/dto";
import type { UiStrings } from "@/lib/i18n/ui";
import { cn } from "@/lib/utils";

/**
 * Weekly hours table (CP4). Server-rendered — this is JS-free CONTENT (a visitor can read
 * the schedule with JS disabled). The live "open now" state is the separate OpenNowBadge
 * enhancement. Structured data + translated chrome; never free-text.
 */

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function formatDay(day: HoursDay | undefined, strings: UiStrings): string {
  if (!day || "closed" in day) return strings.closed;
  if ("is24h" in day) return "24h";
  return day.spans.map((s) => `${s.open}–${s.close}`).join(", ");
}

export function HoursTable({ hours, strings, inverse = false }: { hours: HoursDTO; strings: UiStrings; inverse?: boolean }) {
  if (hours.unknown) {
    return <p className={cn("text-[13.5px]", inverse ? "text-white/80" : "text-secondary")}>{strings.hoursUnknown}</p>;
  }
  return (
    <div>
      <table className="w-full text-[13.5px]">
        <tbody>
          {DAYS.map((day) => (
            <tr key={day} className={cn("border-b last:border-0", inverse ? "border-white/15" : "border-hairline")}>
              <th scope="row" className={cn("py-1.5 text-left font-medium", inverse ? "text-white" : "text-ink")}>
                {strings.weekdays[day]}
              </th>
              <td className={cn("py-1.5 text-right tabular-nums", inverse ? "text-white/80" : "text-secondary")}>
                {formatDay(hours.weekly[day], strings)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hours.sellsOutEarly ? (
        <p className={cn("mt-2 text-[12.5px] font-medium", inverse ? "text-white" : "text-terracotta-deep")}>{strings.sellsOutEarly}</p>
      ) : null}
      {hours.appointmentOnly ? (
        <p className={cn("mt-2 text-[12.5px]", inverse ? "text-white/85" : "text-secondary")}>{strings.appointmentOnly}</p>
      ) : null}
    </div>
  );
}
