import { describe, expect, it } from "vitest";
import { buildNatureCommuneFocusUrl, parseNatureCommuneFocusQuery } from "../src/features/nearby-stations/neighborhood-comparison/greenFocus";

describe("commune green-map focus routing", () => {
  it("builds a refresh-safe canonical commune URL and restores its reference", () => {
    const reference = { scope: "commune", code: "75056", version: "0123456789abcdef01234567" } as const;
    const url = buildNatureCommuneFocusUrl(reference, "Paris", { lat: 48.85, lon: 2.35 });
    const parsedUrl = new URL(url, "https://example.test");
    const focus = parseNatureCommuneFocusQuery(Object.fromEntries(parsedUrl.searchParams.entries()));
    expect(parsedUrl.pathname).toBe("/map");
    expect(focus).toEqual({ reference, communeName: "Paris", origin: { lat: 48.85, lon: 2.35 } });
  });

  it("rejects malformed references and ignores an invalid optional origin", () => {
    expect(parseNatureCommuneFocusQuery({ focus: "nature:commune:75056", version: "bad" })).toBeUndefined();
    expect(parseNatureCommuneFocusQuery({ focus: "nature:commune:75056", version: "0123456789abcdef01234567", originLat: "91", originLon: "2" }))
      .toEqual({ reference: { scope: "commune", code: "75056", version: "0123456789abcdef01234567" }, communeName: "75056", origin: undefined });
  });
});
