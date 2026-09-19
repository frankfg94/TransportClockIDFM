import { describe, expect, it } from "vitest";
import { freshnessFromDate } from "../server/services/datasets/datasetManager";

describe("dataset freshness", () => {
  const now = Date.parse("2026-09-10T00:00:00.000Z");

  it("classifies fresh, aging, stale and invalid dates with explicit thresholds", () => {
    expect(freshnessFromDate("2026-09-09T00:00:00.000Z", 3, 10, now)).toMatchObject({
      status: "fresh",
      ageDays: 1,
      warnAfterDays: 3,
      staleAfterDays: 10,
    });
    expect(freshnessFromDate("2026-09-06T00:00:00.000Z", 3, 10, now).status).toBe("aging");
    expect(freshnessFromDate("2026-08-30T00:00:00.000Z", 3, 10, now).status).toBe("stale");
    expect(freshnessFromDate("not-a-date", 3, 10, now).status).toBe("unknown");
  });
});
