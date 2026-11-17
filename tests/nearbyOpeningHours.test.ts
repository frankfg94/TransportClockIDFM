import { describe, expect, it } from "vitest";
import { nearbyOpeningHours, nearbyOpeningStatusLookup } from "../src/features/nearby-stations/nearbyOpeningHours";

describe("weekly commerce opening hours", () => {
  it("expands weekday ranges and keeps split Sunday hours on the same day", () => {
    const rows = nearbyOpeningHours("Mo-Sa 08:30-21:00; Su 08:30-12:45,13:00-20:30")!;
    expect(rows).toHaveLength(7);
    expect(rows.slice(0, 6).every(row => row.intervals[0] === "08:30 – 21:00")).toBe(true);
    expect(rows[6]?.intervals).toEqual(["08:30 – 12:45", "13:00 – 20:30"]);
  });
  it("keeps holidays separate and never infers that an unspecified day is closed", () => {
    const rows = nearbyOpeningHours("Mo-Fr 09:00-18:00; Sa off; PH closed")!;
    expect(rows[5]?.state).toBe("closed");
    expect(rows[6]?.state).toBe("unknown");
    expect(rows[7]?.state).toBe("closed");
  });
  it("supports uninterrupted opening and week ranges crossing Sunday", () => {
    expect(nearbyOpeningHours("24/7")?.every(row => row.state === "all-day")).toBe(true);
    const rows = nearbyOpeningHours("Fr-Mo 22:00-02:00")!;
    expect(rows.filter(row => row.state === "hours").map(row => row.day)).toEqual([0, 4, 5, 6]);
  });
  it.each(["Mo-Fr 09:00-18:00; We 10:00-12:00", 'Mo-Fr 09:00-18:00 "by appointment"', "Apr-Oct Mo-Sa 09:00-19:00", "sunrise-sunset", "Mo 09:00-25:00"])("preserves unsupported rules verbatim: %s", (raw) => {
    expect(nearbyOpeningHours(raw)).toBeUndefined();
  });
});

describe("current opening status", () => {
  const statusAt = (date: string, hours?: string) => nearbyOpeningStatusLookup(new Date(date))(hours);

  it("uses Paris time and observes the edges of split opening intervals", () => {
    const hours = "Mo-Fr 09:00-12:00,13:00-18:00";
    expect(statusAt("2026-11-16T07:59:00Z", hours)).toBe("closed");
    expect(statusAt("2026-11-16T08:00:00Z", hours)).toBe("open");
    expect(statusAt("2026-11-16T11:00:00Z", hours)).toBe("closed");
    expect(statusAt("2026-11-16T12:00:00Z", hours)).toBe("open");
    expect(statusAt("2026-11-16T17:00:00Z", hours)).toBe("closed");
    expect(statusAt("2026-07-06T07:00:00Z", hours)).toBe("open");
    expect(statusAt("2026-11-16T12:00:00Z", "12:00-14:30,19:00-22:00")).toBe("open");
    expect(statusAt("2026-11-16T14:00:00Z", "12:00-14:30,19:00-22:00")).toBe("closed");
  });

  it("keeps missing, incomplete and unsupported schedules unknown", () => {
    expect(statusAt("2026-11-15T12:00:00Z", "Mo-Fr 09:00-18:00")).toBeUndefined();
    expect(statusAt("2026-11-16T12:00:00Z")).toBeUndefined();
    expect(statusAt("2026-11-16T12:00:00Z", "Apr-Oct Mo-Fr 09:00-18:00")).toBeUndefined();
    expect(statusAt("2026-11-16T12:00:00Z", "Mo 12:00-12:00")).toBeUndefined();
    expect(statusAt("2026-11-16T12:00:00Z", "24/7")).toBe("open");
  });

  it("handles overnight hours and the priority of a later day rule", () => {
    expect(statusAt("2026-11-16T00:00:00Z", "Su 22:00-02:00")).toBe("open");
    expect(statusAt("2026-11-16T01:00:00Z", "Su 22:00-02:00")).toBeUndefined();
    expect(statusAt("2026-11-16T00:00:00Z", "Su 22:00-02:00; Mo 09:00-18:00")).toBe("closed");
    expect(statusAt("2026-11-16T00:00:00Z", "Mo 09:00-18:00; Su 22:00-02:00")).toBe("open");
  });

  it("applies French public holiday rules in their declared order", () => {
    const schedule = "Mo-Su 09:00-18:00; PH off";
    expect(statusAt("2026-05-14T10:00:00Z", schedule)).toBe("closed"); // Ascension
    expect(statusAt("2026-04-06T10:00:00Z", schedule)).toBe("closed"); // Easter Monday
    expect(statusAt("2026-05-25T10:00:00Z", schedule)).toBe("closed"); // Whit Monday
    expect(statusAt("2026-05-15T10:00:00Z", schedule)).toBe("open");
    expect(statusAt("2026-05-14T10:00:00Z", "PH off; Mo-Su 09:00-18:00")).toBe("open");
  });
});
