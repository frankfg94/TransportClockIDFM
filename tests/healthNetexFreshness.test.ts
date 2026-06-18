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
      message: "mise à jour conseillée",
      detail: "Dataset NeTEx de plus de 6 mois, mieux vaut le mettre à jour.",
    });
  });

  it("marks datasets older than one year as outdated", () => {
    expect(
      getNetexDatasetFreshness("2025-06-17T12:00:00.000Z", now),
    ).toEqual({
      status: "error",
      message: "dataset outdated",
      detail: "Dataset NeTEx de plus d'un an, il doit être régénéré.",
    });
  });

  it("ignores invalid generation dates", () => {
    expect(getNetexDatasetFreshness("not-a-date", now)).toBeUndefined();
  });
});
