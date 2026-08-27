import type { HoursDTO } from "@/lib/public-read/dto";

/**
 * Open-now engine (CP4, PRD P1-4). Pure and injected-`now` so it is table-driven and
 * deterministic. Resolves overnight spans (close < open), split spans, per-date
 * exceptions, unknown/appointment states, and last-order math against the venue's
 * timezone (Pacific/Honolulu has no DST, but we resolve via Intl for correctness).
 *
 * The trick that makes overnight/split trivial: expand each day's spans into ABSOLUTE
 * minute intervals across a window (yesterday → +7 days), where an overnight span ends
 * at close + 1440. "Open now" is then just point-in-interval; "next open" is the nearest
 * future interval start. No special cases at the comparison site.
 */

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export interface OpenNow {
  state: "open" | "closed" | "unknown" | "appointment_only";
  /** HH:MM the venue closes (null when open 24h). */
  closesAt: string | null;
  /** HH:MM of last order, when a last-order offset is configured. */
  lastOrderAt: string | null;
  lastOrderPassed: boolean;
  /** HH:MM the venue next opens (when closed). */
  opensAt: string | null;
  opensDay: "today" | "tomorrow" | Weekday | null;
  sellsOutEarly: boolean;
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

function toHHMM(absMinutes: number): string {
  const minutesOfDay = ((absMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(minutesOfDay / 60);
  const m = minutesOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface LocalNow {
  weekdayIndex: number; // mon=0
  minutes: number; // since local midnight
  y: number;
  m: number; // 1-12
  d: number;
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

function localNow(now: Date, timeZone: string): LocalNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some engines render midnight as 24
  return {
    weekdayIndex: WEEKDAY_TO_INDEX[get("weekday")] ?? 0,
    minutes: hour * 60 + Number(get("minute")),
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
  };
}

/** Calendar-day arithmetic via UTC (dates only, no time), returning weekday mon=0. */
function addDays(base: { y: number; m: number; d: number }, n: number) {
  const dt = new Date(Date.UTC(base.y, base.m - 1, base.d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
    weekdayIndex: (dt.getUTCDay() + 6) % 7, // JS Sun=0 → mon=0 scheme
    iso: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`,
  };
}

interface DaySchedule {
  spans: { open: string; close: string }[];
  is24h: boolean;
  closed: boolean;
}

function resolveDay(iso: string, weekdayIndex: number, hours: HoursDTO): DaySchedule {
  const exception = hours.exceptions.find((e) => e.date === iso);
  if (exception) {
    if (exception.closed) return { spans: [], is24h: false, closed: true };
    return { spans: exception.spans ?? [], is24h: false, closed: false };
  }
  const day = hours.weekly[WEEKDAYS[weekdayIndex] as Weekday];
  if (!day) return { spans: [], is24h: false, closed: true };
  if ("closed" in day && day.closed) return { spans: [], is24h: false, closed: true };
  if ("is24h" in day && day.is24h) return { spans: [], is24h: true, closed: false };
  if ("spans" in day) return { spans: day.spans, is24h: false, closed: false };
  return { spans: [], is24h: false, closed: true };
}

interface Interval {
  start: number; // absolute minutes, today midnight = 0
  end: number;
  is24h: boolean;
}

export function computeOpenNow(hours: HoursDTO, now: Date): OpenNow {
  const base: OpenNow = {
    state: "closed",
    closesAt: null,
    lastOrderAt: null,
    lastOrderPassed: false,
    opensAt: null,
    opensDay: null,
    sellsOutEarly: hours.sellsOutEarly,
  };

  if (hours.unknown) return { ...base, state: "unknown" };
  if (hours.appointmentOnly) return { ...base, state: "appointment_only" };

  const local = localNow(now, hours.timezone || "Pacific/Honolulu");
  const nowMin = local.minutes;

  const intervals: Interval[] = [];
  for (let offset = -1; offset <= 7; offset++) {
    const day = addDays(local, offset);
    const schedule = resolveDay(day.iso, day.weekdayIndex, hours);
    const dayBase = offset * 1440;
    if (schedule.is24h) {
      intervals.push({ start: dayBase, end: dayBase + 1440, is24h: true });
      continue;
    }
    for (const span of schedule.spans) {
      const open = parseMinutes(span.open);
      const close = parseMinutes(span.close);
      const start = dayBase + open;
      const end = close <= open ? dayBase + close + 1440 : dayBase + close; // overnight
      intervals.push({ start, end, is24h: false });
    }
  }

  const active = intervals.find((i) => i.start <= nowMin && nowMin < i.end);
  if (active) {
    const closesAt = active.is24h ? null : toHHMM(active.end);
    let lastOrderAt: string | null = null;
    let lastOrderPassed = false;
    if (!active.is24h && hours.lastOrderOffsetMin != null) {
      const lastOrderMin = active.end - hours.lastOrderOffsetMin;
      lastOrderAt = toHHMM(lastOrderMin);
      lastOrderPassed = nowMin > lastOrderMin;
    }
    return { ...base, state: "open", closesAt, lastOrderAt, lastOrderPassed };
  }

  const next = intervals
    .filter((i) => i.start > nowMin)
    .sort((a, b) => a.start - b.start)[0];
  if (!next) return base; // no upcoming opening within the window
  const nextOffset = Math.floor(next.start / 1440);
  const opensDay: OpenNow["opensDay"] =
    nextOffset === 0 ? "today" : nextOffset === 1 ? "tomorrow" : (WEEKDAYS[addDays(local, nextOffset).weekdayIndex] as Weekday);
  return { ...base, state: "closed", opensAt: toHHMM(next.start), opensDay };
}
