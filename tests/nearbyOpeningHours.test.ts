import { describe, expect, it } from "vitest";
import { nearbyOpeningHours } from "../src/features/nearby-stations/nearbyOpeningHours";

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
