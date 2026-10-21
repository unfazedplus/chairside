import { TZDate } from "@date-fns/tz";

import type { BusyInterval, Interval, Service, WeeklyWindow } from "@/lib/scheduling/types";

export const MINUTES_PER_DAY = 24 * 60;
const MILLIS_PER_MINUTE = 60_000;

export interface GenerateSlotsInput {
  /** Business timezone, e.g. "America/New_York". Never the visitor's zone. */
  timeZone: string;
  /** Local calendar date to generate availability for, "YYYY-MM-DD". */
  date: string;
  service: Service;
  windows: WeeklyWindow[];
  /** Existing appointments and closures. */
  busy: BusyInterval[];
  /** Reference instant for lead-time maths; injectable for deterministic tests. */
  now: Date | number;
}

/**
 * Builds bookable slots for one local day.
 *
 * Design notes worth defending in an interview:
 * - Opening hours are wall-clock, bookings are instants. Converting lazily
 *   here (rather than storing local times) keeps DST handling in one place.
 * - Wall-clock times that do not exist (spring-forward gap) are skipped by
 *   round-tripping the candidate and comparing field-for-field.
 * - Overlap checks use half-open intervals [start, end) so a booking ending at
 *   10:00 does not collide with one starting at 10:00.
 */
export function generateSlots(input: GenerateSlotsInput): Interval[] {
  const { timeZone, date, service, windows, busy, now } = input;

  const { year, monthIndex, day } = parseLocalDate(date);
  const weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();

  const dayWindows = windows
    .filter((window) => window.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute);

  if (dayWindows.length === 0) return [];

  const nowMs = typeof now === "number" ? now : now.getTime();
  const leadTimeCutoffMs =
    nowMs + Math.max(service.minLeadTimeMinutes, 0) * MILLIS_PER_MINUTE;

  const localToday = formatLocalDate(nowMs, timeZone);
  const lastBookableDate = addLocalDays(localToday, service.maxAdvanceDays);
  if (date > lastBookableDate) return [];

  const duration = Math.max(service.durationMinutes, 1);
  const buffer = Math.max(service.bufferAfterMinutes, 0);
  const step = service.slotIntervalMinutes > 0 ? service.slotIntervalMinutes : duration;
  const totalBlock = duration + buffer;

  // A busy interval occupies its own duration PLUS the turnaround time it owes.
  // Closures and breaks owe nothing, so their buffer is ignored.
  const busyRanges = busy.map((interval) => {
    const owesBuffer = (interval.kind ?? "appointment") === "appointment";
    const extraMinutes = owesBuffer ? Math.max(interval.bufferAfterMinutes ?? 0, 0) : 0;

    return {
      start: Date.parse(interval.startIso),
      end: Date.parse(interval.endIso) + extraMinutes * MILLIS_PER_MINUTE,
    };
  });

  const slots: Interval[] = [];
  const seen = new Set<number>();

  for (const window of dayWindows) {
    const windowEnd = Math.min(window.endMinute, MINUTES_PER_DAY);

    for (
      let minute = window.startMinute;
      minute + duration <= windowEnd;
      minute += step
    ) {
      const startLocal = new TZDate(
        year,
        monthIndex,
        day,
        0,
        minute,
        0,
        0,
        timeZone,
      );

      // Spring-forward gap: the requested wall-clock time does not exist and
      // TZDate rolled it forward, so the local fields no longer match.
      if (!isLocalWallClockIntact(startLocal, timeZone, date, minute)) {
        continue;
      }

      const startMs = startLocal.getTime();
      if (startMs < leadTimeCutoffMs) continue;
      if (seen.has(startMs)) continue;

      const endMs = startMs + totalBlock * MILLIS_PER_MINUTE;
      if (overlapsAny(startMs, endMs, busyRanges)) continue;

      seen.add(startMs);
      slots.push({
        startIso: new Date(startMs).toISOString(),
        endIso: new Date(endMs).toISOString(),
      });
    }
  }

  return slots.sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso));
}

interface NumericRange {
  start: number;
  end: number;
}

function isNumericRange(range: Interval | NumericRange): range is NumericRange {
  return "start" in range;
}

/**
 * Does [candidateStart, candidateEnd) intersect any busy interval?
 * Adjacent bookings (one ends exactly when the next begins) are allowed.
 */
export function overlapsAny(
  candidateStart: number,
  candidateEnd: number,
  ranges: readonly (Interval | NumericRange)[],
): boolean {
  return ranges.some((range) => {
    const start = isNumericRange(range) ? range.start : Date.parse(range.startIso);
    const end = isNumericRange(range) ? range.end : Date.parse(range.endIso);
    return candidateStart < end && candidateEnd > start;
  });
}

/** Renders an instant as a local "YYYY-MM-DD" in the given timezone. */
export function formatLocalDate(
  instant: Date | number | string,
  timeZone: string,
): string {
  const zoned = new TZDate(toEpochMs(instant), timeZone);
  return [
    String(zoned.getFullYear()).padStart(4, "0"),
    String(zoned.getMonth() + 1).padStart(2, "0"),
    String(zoned.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Renders an instant as "HH:mm" local wall-clock time. */
export function formatLocalTime(
  instant: Date | number | string,
  timeZone: string,
): string {
  const zoned = new TZDate(toEpochMs(instant), timeZone);
  return [
    String(zoned.getHours()).padStart(2, "0"),
    String(zoned.getMinutes()).padStart(2, "0"),
  ].join(":");
}

/** Accepts the three shapes callers actually hold and normalises to epoch ms. */
export function toEpochMs(instant: Date | number | string): number {
  if (typeof instant === "number") return instant;
  if (instant instanceof Date) return instant.getTime();

  const parsed = Date.parse(instant);
  if (Number.isNaN(parsed)) {
    throw new Error(`Unparseable instant: "${instant}".`);
  }
  return parsed;
}

/** Parses "YYYY-MM-DD" without going through Date string parsing rules. */
export function parseLocalDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Expected date in YYYY-MM-DD form, received "${date}".`);
  }

  const [, y, m, d] = match;
  return { year: Number(y), monthIndex: Number(m) - 1, day: Number(d) };
}

/** Parses "HH:mm" into minutes since local midnight. */
export function parseClockToMinutes(clock: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  if (!match) {
    throw new Error(`Expected 24-hour time in HH:mm form, received "${clock}".`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Adds whole days to a "YYYY-MM-DD" string using UTC arithmetic (no DST). */
export function addLocalDays(date: string, days: number): string {
  const { year, monthIndex, day } = parseLocalDate(date);
  const shifted = new Date(Date.UTC(year, monthIndex, day + days));
  return [
    String(shifted.getUTCFullYear()).padStart(4, "0"),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** Monday-first weekday labels for the roster grid. */
export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function isLocalWallClockIntact(
  candidate: TZDate,
  timeZone: string,
  date: string,
  minute: number,
): boolean {
  // A constructor result that round-trips to the same local fields is real.
  const expectedHour = Math.floor(minute / 60);
  const expectedMinute = minute % 60;

  if (
    candidate.getHours() !== expectedHour ||
    candidate.getMinutes() !== expectedMinute
  ) {
    return false;
  }

  // A time can also legitimately be absent when its own local date differs,
  // which happens when a whole day is skipped.
  return formatLocalDate(candidate.getTime(), timeZone) === date;
}
