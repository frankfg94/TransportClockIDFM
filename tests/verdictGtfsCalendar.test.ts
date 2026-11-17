import { describe, expect, it } from "vitest";
import { verdictReferenceDate, verdictReferenceDatetime } from "../src/services/travelRoutes/verdictGtfsCalendar";

describe("Verdict GTFS reference dates", () => {
  const coverage = { startDate: "20261114", endDate: "20261216" };
  it("uses the requested date in coverage, and the latest covered matching weekday after expiry", () => {
    expect(verdictReferenceDate("20261110", coverage)).toBe("20261110");
    expect(verdictReferenceDate("20261216", coverage)).toBe("20261216");
    expect(verdictReferenceDate("20261217", coverage)).toBe("20261210");
    expect(verdictReferenceDatetime("20270102T093000", coverage, 115200)).toBe("20261212T093000");
  });
  it("keeps overnight coverage through the exact boundary and preserves the chosen clock time afterwards", () => {
    expect(verdictReferenceDatetime("20261217T080000", coverage, 115200)).toBe("20261217T080000");
    expect(verdictReferenceDatetime("20261217T080001", coverage, 115200)).toBe("20261210T080001");
  });
  it("uses an actual covered date for short feeds and skips a nonexistent local clock time", () => {
    expect(verdictReferenceDate("20261218", { startDate: "20261215", endDate: "20261216" })).toBe("20261216");
    expect(verdictReferenceDatetime("20260405T023000", { startDate: "20260316", endDate: "20260329" }, 86400)).toBe("20260322T023000");
  });
});
