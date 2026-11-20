/*
  When a scheduled agent task next runs. Pure, IST-anchored.

  India has no daylight saving, so IST is a fixed UTC+05:30 and the arithmetic
  is exact: build the wall-clock time in IST, subtract 5h30m for UTC.
  Monthly schedules are capped at day 28 (the table's check constraint) so
  "the 31st" never silently skips February.
*/

export type Cadence = "daily" | "weekly" | "monthly";
export type ScheduleSpec = { cadence: Cadence; hourIst: number; weekday?: number; monthday?: number };

const IST_OFFSET_MS = 330 * 60_000;

/** IST wall-clock parts of an instant. */
function istParts(d: Date) {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), dow: t.getUTCDay() };
}

/** The UTC instant for an IST wall-clock time. */
function istToUtc(y: number, m: number, d: number, hour: number): Date {
  return new Date(Date.UTC(y, m, d, hour, 0, 0) - IST_OFFSET_MS);
}

/** The first run strictly after `from`. */
export function nextRunAt(spec: ScheduleSpec, from: Date = new Date()): Date {
  const hour = Math.max(0, Math.min(23, Math.floor(spec.hourIst)));
  const { y, m, d, dow } = istParts(from);
  if (spec.cadence === "daily") {
    let at = istToUtc(y, m, d, hour);
    if (at <= from) at = istToUtc(y, m, d + 1, hour);
    return at;
  }
  if (spec.cadence === "weekly") {
    const want = Math.max(0, Math.min(6, Math.floor(spec.weekday ?? 1)));
    let add = (want - dow + 7) % 7;
    let at = istToUtc(y, m, d + add, hour);
    if (at <= from) { add += 7; at = istToUtc(y, m, d + add, hour); }
    return at;
  }
  const day = Math.max(1, Math.min(28, Math.floor(spec.monthday ?? 1)));
  let at = istToUtc(y, m, day, hour);
  if (at <= from) at = istToUtc(y, m + 1, day, hour);
  return at;
}

export function describeSchedule(spec: ScheduleSpec): string {
  const h = Math.floor(spec.hourIst);
  const time = `${((h + 11) % 12) + 1}:00 ${h < 12 ? "am" : "pm"} IST`;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (spec.cadence === "daily") return `Every day at ${time}`;
  if (spec.cadence === "weekly") return `Every ${days[Math.max(0, Math.min(6, spec.weekday ?? 1))]} at ${time}`;
  const n = spec.monthday ?? 1;
  const suf = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `Monthly on the ${n}${suf} at ${time}`;
}
