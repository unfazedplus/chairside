import { describe, expect, it } from "vitest";

import {
  addLocalDays,
  formatLocalDate,
  formatLocalTime,
  generateSlots,
  overlapsAny,
  parseClockToMinutes,
  parseLocalDate,
} from "@/lib/scheduling/slots";
import type { BusyInterval, Service, WeeklyWindow } from "@/lib/scheduling/types";

const NY = "America/New_York";

const haircut: Service = {
  id: "svc-haircut",
  durationMinutes: 30,
  bufferAfterMinutes: 0,
  slotIntervalMinutes: 30,
  minLeadTimeMinutes: 0,
  maxAdvanceDays: 60,
};

const weekdays = (...days: number[]): WeeklyWindow[] =>
  days.map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 17 * 60 }));

/** 2026-03-10T12:00Z, comfortably before the dates under test. */
const REFERENCE_NOW = Date.parse("2026-03-10T12:00:00.000Z");

describe("generateSlots", () => {
  it("returns nothing on a day the business is closed", () => {
    const slots = generateSlots({
      timeZone: NY,
      date: "2026-03-10", // Tuesday
      service: haircut,
      windows: weekdays(1), // Monday only
      busy: [],
      now: REFERENCE_NOW,
    });

    expect(slots).toEqual([]);
  });

  it("emits slots across a 09:00-17:00 window on the half hour", () => {
    const slots = generateSlots({
      timeZone: NY,
      date: "2026-03-10",
      service: haircut,
      windows: weekdays(2),
      busy: [],
      now: REFERENCE_NOW,
    });

    // 16 slots: 09:00 through 16:30 local, each 30 minutes long.
    expect(slots).toHaveLength(16);
    expect(formatLocalTime(slots[0].startIso, NY)).toBe("09:00");
    expect(formatLocalTime(slots.at(-1)!.startIso, NY)).toBe("16:30");
    // 09:00 EDT is 13:00Z, proving the conversion used the local zone.
    expect(slots[0].startIso).toBe("2026-03-10T13:00:00.000Z");
  });

  it("removes slots that collide with an existing appointment", () => {
    const busy: BusyInterval[] = [
      {
        startIso: "2026-03-10T14:00:00.000Z", // 10:00 local
        endIso: "2026-03-10T14:30:00.000Z", // 10:30 local
        kind: "appointment",
      },
    ];

    const slots = generateSlots({
      timeZone: NY,
      date: "2026-03-10",
      service: haircut,
      windows: weekdays(2),
      busy,
      now: REFERENCE_NOW,
    });

    const starts = slots.map((slot) => formatLocalTime(slot.startIso, NY));
    expect(starts).not.toContain("10:00");
    // The 09:30 slot ends exactly at 10:00, so it must survive.
    expect(starts).toContain("09:30");
    expect(starts).toContain("10:30");
  });

  it("honours the turnaround time owed by the existing appointment", () => {
    const slots = generateSlots({
      timeZone: NY,
      date: "2026-03-10",
      service: haircut,
      windows: weekdays(2),
      busy: [
        {
          startIso: "2026-03-10T14:00:00.000Z", // 10:00 local
          endIso: "2026-03-10T14:30:00.000Z", // 10:30 local
          kind: "appointment",
          bufferAfterMinutes: 30, // chair needs cleaning until 11:00 local
        },
      ],
      now: REFERENCE_NOW,
    });

    const starts = slots.map((slot) => formatLocalTime(slot.startIso, NY));
    expect(starts).not.toContain("10:30");
    expect(starts).toContain("11:00");
  });

  it("does not add turnaround time to an all-day closure", () => {
    const slots = generateSlots({
      timeZone: NY,
      date: "2026-03-10",
      service: haircut,
      windows: weekdays(2),
      busy: [
        {
          startIso: "2026-03-10T14:00:00.000Z", // 10:00 local
          endIso: "2026-03-10T14:30:00.000Z", // 10:30 local
          kind: "blocked",
          bufferAfterMinutes: 60, // ignored: closures owe no turnaround
        },
      ],
      now: REFERENCE_NOW,
    });

    const starts = slots.map((slot) => formatLocalTime(slot.startIso, NY));
    expect(starts).toContain("10:30");
  });

  it("honours the minimum lead time relative to now", () => {
    const slots = generateSlots({
      timeZone: NY,
      date: "2026-03-10",
      service: { ...haircut, minLeadTimeMinutes: 120 },
      windows: weekdays(2),
      busy: [],
      // 09:00 local on the day itself, so slots before 11:00 are too soon.
      now: Date.parse("2026-03-10T13:00:00.000Z"),
    });

    const starts = slots.map((slot) => formatLocalTime(slot.startIso, NY));
    expect(starts).not.toContain("10:30");
    expect(starts).toContain("11:00");
  });

  it("refuses dates beyond the booking horizon", () => {
    const slots = generateSlots({
      timeZone: NY,
      date: "2026-06-01",
      service: { ...haircut, maxAdvanceDays: 7 },
      windows: weekdays(2),
      busy: [],
      now: REFERENCE_NOW,
    });

    expect(slots).toEqual([]);
  });

  it("drops the wall-clock hour that does not exist on spring-forward day", () => {
    // 2026-03-08 in New York jumps 02:00 EST -> 03:00 EDT.
    const early: WeeklyWindow[] = [{ weekday: 0, startMinute: 60, endMinute: 5 * 60 }];

    const slots = generateSlots({
      timeZone: NY,
      date: "2026-03-08",
      service: haircut,
      windows: early,
      busy: [],
      now: Date.parse("2026-03-01T00:00:00.000Z"),
    });

    const times = slots.map((slot) => formatLocalTime(slot.startIso, NY));
    expect(times).not.toContain("02:00");
    expect(times).not.toContain("02:30");
    expect(times).toContain("01:30");
    expect(times).toContain("03:00");
  });

  it("keeps slot count stable for the same window across a DST change", () => {
    // A 01:00-05:00 window is one hour shorter in real time on spring-forward
    // day, so fewer slots fit. This documents the intended behaviour.
    const window: WeeklyWindow[] = [{ weekday: 0, startMinute: 60, endMinute: 5 * 60 }];

    const springForward = generateSlots({
      timeZone: NY,
      date: "2026-03-08",
      service: haircut,
      windows: window,
      busy: [],
      now: Date.parse("2026-03-01T00:00:00.000Z"),
    });

    const ordinary = generateSlots({
      timeZone: NY,
      date: "2026-03-15",
      service: haircut,
      windows: window,
      busy: [],
      now: Date.parse("2026-03-01T00:00:00.000Z"),
    });

    expect(ordinary.length - springForward.length).toBe(2); // two 30-min slots lost
  });

  it("treats 01:30 on fall-back day as a single unambiguous instant", () => {
    const slots = generateSlots({
      timeZone: NY,
      date: "2026-11-01",
      service: haircut,
      windows: [{ weekday: 0, startMinute: 60, endMinute: 4 * 60 }],
      busy: [],
      now: Date.parse("2026-10-01T00:00:00.000Z"),
    });

    const thirtyPastOne = slots.filter(
      (slot) => formatLocalTime(slot.startIso, NY) === "01:30",
    );
    expect(thirtyPastOne).toHaveLength(1);
  });
});

describe("overlapsAny", () => {
  const ranges = [{ start: 1_000, end: 2_000 }];

  it("allows back-to-back intervals", () => {
    expect(overlapsAny(2_000, 3_000, ranges)).toBe(false);
    expect(overlapsAny(0, 1_000, ranges)).toBe(false);
  });

  it("detects genuine overlap on either edge", () => {
    expect(overlapsAny(1_500, 2_500, ranges)).toBe(true);
    expect(overlapsAny(500, 1_500, ranges)).toBe(true);
    expect(overlapsAny(1_200, 1_300, ranges)).toBe(true);
  });

  it("accepts ISO-encoded intervals", () => {
    const isoRanges = [
      { startIso: "2026-03-10T14:00:00.000Z", endIso: "2026-03-10T14:30:00.000Z" },
    ];
    expect(
      overlapsAny(
        Date.parse("2026-03-10T14:15:00.000Z"),
        Date.parse("2026-03-10T14:45:00.000Z"),
        isoRanges,
      ),
    ).toBe(true);
  });
});

describe("date helpers", () => {
  it("formats instants in the business timezone, not UTC", () => {
    const instant = Date.parse("2026-03-11T02:30:00.000Z"); // 22:30 EST on the 10th
    expect(formatLocalDate(instant, NY)).toBe("2026-03-10");
    expect(formatLocalTime(instant, NY)).toBe("22:30");
  });

  it("adds days without drifting across a DST boundary", () => {
    expect(addLocalDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addLocalDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("rejects malformed input instead of guessing", () => {
    expect(() => parseLocalDate("03/10/2026")).toThrow(/YYYY-MM-DD/);
    expect(() => parseClockToMinutes("9:00")).toThrow(/HH:mm/);
    expect(() => parseClockToMinutes("24:00")).toThrow(/HH:mm/);
  });

  it("parses clock strings to minutes since midnight", () => {
    expect(parseClockToMinutes("00:00")).toBe(0);
    expect(parseClockToMinutes("09:15")).toBe(555);
    expect(parseClockToMinutes("23:59")).toBe(1439);
  });
});
