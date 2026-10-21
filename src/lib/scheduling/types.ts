/** A half-open interval on the absolute timeline: [startIso, endIso). */
export interface Interval {
  startIso: string;
  endIso: string;
}

export interface Service {
  id: string;
  durationMinutes: number;
  /** Buffer reserved after the appointment, e.g. clean-up time. */
  bufferAfterMinutes: number;
  /** Granularity the booking UI offers, e.g. every 15 minutes. */
  slotIntervalMinutes: number;
  minLeadTimeMinutes: number;
  maxAdvanceDays: number;
}

/**
 * A recurring weekly availability window, expressed in the business's local
 * wall-clock time (minutes since local midnight, 0..1439).
 *
 * Opening hours are inherently wall-clock concepts: "we open at 9" stays 9
 * across daylight saving transitions, which is why these are not instants.
 */
export interface WeeklyWindow {
  /** 0 = Sunday ... 6 = Saturday, matching JavaScript's getDay(). */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface BusyInterval extends Interval {
  /** Distinguishes real appointments from closures/breaks for debugging. */
  kind?: "appointment" | "blocked" | "break";
  /**
   * Clean-up/turnaround time owed by THIS appointment, not by the one being
   * booked. A 45-minute colour with 15 minutes of clean-up blocks a full hour.
   * Ignored for closures, which need no turnaround.
   */
  bufferAfterMinutes?: number;
}
