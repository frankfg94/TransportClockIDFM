import { describe, expect, it } from "vitest";
import { createDefaultAppSettings, normalizeAppSettings } from "../src/features/app-settings/appSettings";
import { buildNeighborhoodScore } from "../src/features/nearby-stations/neighborhood";
import { DEFAULT_PERSONAL_JOURNEY_THRESHOLDS as defaults, normalizePersonalJourneyPreferences, personalJourneyFact, personalJourneyPolarity, resolvedPersonalJourney, scoreWithPersonalJourneys, validPersonalJourneyThresholds, type PersonalJourneyResult } from "../src/features/nearby-stations/neighborhood/personalJourneys";
import { loadAddressBookState } from "../src/features/address-book/addressBook";

const row = (minutes: number, thresholds = defaults): PersonalJourneyResult => ({
  id: "office", destinationId: "office", ...thresholds, commute: false, status: "ready",
  destination: { id: "office", kind: "address", name: "Bureau", lon: 2.3, lat: 48.8, icon: "work" },
  journey: { source: "gtfs", durationSeconds: minutes * 60, sections: [{ type: "public_transport", mode: "METRO", lineCode: "4", durationSeconds: minutes * 60 }] },
});

describe("Verdict personal journey criteria", () => {
  it.each([[39, "positive"], [39.99, "positive"], [40, "neutral"], [60, "neutral"], [60.01, "negative"], [61, "negative"]] as const)("classifies %s minutes with the common defaults", (minutes, expected) => {
    expect(personalJourneyPolarity(minutes, defaults)).toBe(expected);
    expect(personalJourneyFact(row(minutes)).polarity).toBe(expected);
  });
  it("applies each route's thresholds to both fact polarity and the final score", () => {
    const input = { stations: [], stationsLoaded: true, places: [], placesLoaded: false };
    const strict = row(30, { positiveBelowMinutes: 20, neutralThroughMinutes: 29 });
    const tolerant = row(70, { positiveBelowMinutes: 40, neutralThroughMinutes: 75 });
    expect(personalJourneyFact(strict).polarity).toBe("negative");
    expect(personalJourneyFact(tolerant).polarity).toBe("neutral");
    expect(buildNeighborhoodScore({ ...input, personalJourneys: [strict] }).score).toBeLessThan(buildNeighborhoodScore(input).score!);
    expect(buildNeighborhoodScore({ ...input, personalJourneys: [tolerant] }).score).toBeGreaterThan(buildNeighborhoodScore({ ...input, personalJourneys: [row(70)] }).score!);
  });
  it("does not score loading, unavailable or failed journeys and preserves all negative criteria", () => {
    const rows = ["loading", "unavailable", "error"].map(status => ({ ...row(80), journey: undefined, status } as PersonalJourneyResult));
    expect(scoreWithPersonalJourneys(6, rows)).toBe(6);
    const result = buildNeighborhoodScore({ stations: [], stationsLoaded: true, places: [], placesLoaded: false,
      personalJourneys: Array.from({ length: 6 }, (_, index) => ({ ...row(80), id: String(index) })) });
    expect(result.negativeFacts.filter(fact => fact.family.startsWith("personal-journey:"))).toHaveLength(6);
  });
  it("normalizes stored preferences without losing valid per-route thresholds or exclusions", () => {
    expect(createDefaultAppSettings().verdictPersonalJourneys).toEqual([]);
    const preferences = normalizePersonalJourneyPreferences([null, {}, { destinationId: "office", positiveBelowMinutes: 25, neutralThroughMinutes: 75 }, { destinationId: "home", positiveBelowMinutes: -1, neutralThroughMinutes: 0, disabled: true }]);
    expect(preferences).toEqual([{ destinationId: "office", positiveBelowMinutes: 25, neutralThroughMinutes: 75 }, { destinationId: "home", ...defaults, disabled: true }]);
    expect(normalizeAppSettings({ verdictPersonalJourneys: preferences }).verdictPersonalJourneys).toEqual(preferences);
    expect(validPersonalJourneyThresholds({ positiveBelowMinutes: 30, neutralThroughMinutes: 20 })).toBe(false);
  });
  it("exposes malformed or inaccessible address storage rather than accepting it as an empty directory", () => {
    expect(loadAddressBookState({ getItem: () => "{" } as unknown as Storage).error).toBe(true);
    expect(loadAddressBookState({ getItem: () => '{"version":99,"entries":[]}' } as unknown as Storage).error).toBe(true);
    expect(loadAddressBookState({ getItem: () => { throw new Error("blocked"); } } as unknown as Storage).error).toBe(true);
  });
  it("rejects invalid durations instead of inventing a travel time", () => {
    expect(resolvedPersonalJourney([{ ...row(1).journey!, durationSeconds: NaN }])).toBeUndefined();
    expect(resolvedPersonalJourney([])).toBeUndefined();
  });
  it("scores measured personal journeys even when the local station catalogue is unavailable", () => {
    expect(buildNeighborhoodScore({ stations: [], stationsLoaded: false, places: [], placesLoaded: false, personalJourneys: [row(20)] }).score).toBe(10);
  });
  it("marks partial journey evidence as derived", () => {
    const partial = row(20);
    partial.journey!.status = "partial";
    expect(personalJourneyFact(partial).evidence.proof).toBe("derived");
  });
});
