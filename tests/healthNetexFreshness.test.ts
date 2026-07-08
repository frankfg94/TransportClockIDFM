import { describe, expect, it } from "vitest";
import { getNetexDatasetFreshness } from "../server/api/health.get";

const now = new Date("2026-06-18T12:00:00.000Z");

describe("getNetexDatasetFreshness", () => {
  it("keeps fresh NeTEx datasets quiet", () => {
    expect(
      getNetexDatasetFreshness("2026-01-18T12:00:00.000Z", now),
    ).toBeUndefined();
  });

  it("recommends an update after six months", () => {
    expect(
      getNetexDatasetFreshness("2025-12-17T12:00:00.000Z", now),
    ).toEqual({
      status: "warning",
      message: "update recommended",
      detail: "NeTEx dataset is over six months old; updating it is recommended.",
    });
  });

  it("marks datasets older than one year as outdated", () => {
    expect(
      getNetexDatasetFreshness("2025-06-17T12:00:00.000Z", now),
    ).toEqual({
      status: "error",
      message: "dataset outdated",
      detail: "NeTEx dataset is over one year old and must be regenerated.",
    });
  });

  it("ignores invalid generation dates", () => {
    expect(getNetexDatasetFreshness("not-a-date", now)).toBeUndefined();
  });
});
