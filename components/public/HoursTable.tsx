import type { HoursDTO, HoursDay } from "@/lib/public-read/dto";
import type { UiStrings } from "@/lib/i18n/ui";

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

export function HoursTable({ hours, strings }: { hours: HoursDTO; strings: UiStrings }) {
  if (hours.unknown) {
    return <p className="text-[13.5px] text-secondary">{strings.hoursUnknown}</p>;
  }
  return (
    <div>
      <table className="w-full text-[13.5px]">
        <tbody>
          {DAYS.map((day) => (
            <tr key={day} className="border-b border-hairline last:border-0">
              <th scope="row" className="py-1.5 text-left font-medium text-ink">
                {strings.weekdays[day]}
              </th>
              <td className="py-1.5 text-right tabular-nums text-secondary">
                {formatDay(hours.weekly[day], strings)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hours.sellsOutEarly ? (
        <p className="mt-2 text-[12.5px] font-medium text-terracotta-deep">{strings.sellsOutEarly}</p>
      ) : null}
      {hours.appointmentOnly ? (
        <p className="mt-2 text-[12.5px] text-secondary">{strings.appointmentOnly}</p>
      ) : null}
    </div>
  );
}
