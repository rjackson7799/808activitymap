"use strict";

const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const minutes = (value) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};
const hhmm = (absolute) => {
  const value = ((absolute % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};
const addDays = (base, offset) => {
  const date = new Date(Date.UTC(base.year, base.month - 1, base.day + offset));
  return {
    weekday: (date.getUTCDay() + 6) % 7,
    iso: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
  };
};

function computeOpenNow(hours) {
  if (hours.unknown) return { state: "unknown" };
  if (hours.appointmentOnly) return { state: "appointment_only" };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: hours.timezone || "Pacific/Honolulu",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  const hour = Number(part("hour")) % 24;
  const local = {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
    currentMinutes: hour * 60 + Number(part("minute")),
  };
  const intervals = [];
  for (let offset = -1; offset <= 7; offset += 1) {
    const date = addDays(local, offset);
    const exception = hours.exceptions.find((item) => item.date === date.iso);
    const schedule = exception
      ? exception.closed
        ? { closed: true }
        : { spans: exception.spans || [] }
      : hours.weekly[weekdays[date.weekday]] || { closed: true };
    if (schedule.is24h) {
      intervals.push({ start: offset * 1440, end: (offset + 1) * 1440, is24h: true });
    } else if (schedule.spans) {
      for (const span of schedule.spans) {
        const startMinute = minutes(span.open);
        const closeMinute = minutes(span.close);
        intervals.push({
          start: offset * 1440 + startMinute,
          end: closeMinute <= startMinute ? offset * 1440 + closeMinute + 1440 : offset * 1440 + closeMinute,
        });
      }
    }
  }
  const active = intervals.find((item) => item.start <= local.currentMinutes && local.currentMinutes < item.end);
  if (active) return { state: "open", closesAt: active.is24h ? null : hhmm(active.end) };
  const next = intervals.filter((item) => item.start > local.currentMinutes).sort((a, b) => a.start - b.start)[0];
  if (!next) return { state: "closed", opensAt: null, opensDay: null };
  const offset = Math.floor(next.start / 1440);
  return {
    state: "closed",
    opensAt: hhmm(next.start),
    opensDay: offset === 0 ? "today" : offset === 1 ? "tomorrow" : weekdays[addDays(local, offset).weekday],
  };
}

self.addEventListener("message", (event) => {
  self.postMessage({ index: event.data.index, state: computeOpenNow(event.data.hours) });
});
