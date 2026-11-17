import { describe, expect, it } from "vitest";
import { buildNeighborhoodScore } from "../src/features/nearby-stations/neighborhood";
import type { NeighborhoodScoreDetailGroup, NeighborhoodScoreInput } from "../src/features/nearby-stations/neighborhood/contracts";
import { personalJourneyScoreDetails } from "../src/features/nearby-stations/neighborhood/personalJourneys";
import type { PublicNeighborhoodVerdict } from "../src/features/nearby-stations/neighborhoodVerdictApi";

function expectGroupReconciles(group: NeighborhoodScoreDetailGroup) {
  if (group.score === undefined) return;
  expect(group.rows.reduce((sum, row) => sum + (row.points ?? 0), 0)).toBeCloseTo(group.score, 8);
}

describe("neighborhood score calculation details", () => {
  it("uses the same measured counts and points as the local calculations", () => {
    const places: NeighborhoodScoreInput["places"] = [
      { id: "super", name: "Supermarket", lon: 2.35, lat: 48.85, category: "shop", kind: "supermarket", distanceMeters: 100 },
      { id: "school", name: "School", lon: 2.35, lat: 48.85, category: "service", kind: "school", distanceMeters: 100 },
      { id: "pharmacy", name: "Pharmacy", lon: 2.35, lat: 48.85, category: "service", kind: "pharmacy", distanceMeters: 100 },
    ];
    const result = buildNeighborhoodScore({ places, placesLoaded: true, stations: [], stationsLoaded: true, generatedAt: 1 });
    for (const category of result.categories) for (const group of category.scoreDetails ?? []) expectGroupReconciles(group);
    const daily = result.categories.find(category => category.id === "daily-life")!;
    const supermarket = daily.scoreDetails![0]!.rows.find(row => row.labelKey.endsWith(".supermarkets"))!;
    expect(supermarket.measurement).toBe(1);
    expect(supermarket.points).toBe(1.5);
    expect(result.categories.find(category => category.id === "health")?.score).toBe(6);
    expect(result.categories.find(category => category.id === "education")?.score).toBe(6);
  });

  it("shows the correction when a shopping-centre bonus exceeds the category ceiling", () => {
    const places = Array.from({ length: 11 }, (_, index) => ({ id: `p${index}`, name: `p${index}`, lon: 2.35, lat: 48.85,
      category: index < 6 ? "shop" as const : "food" as const,
      kind: index < 2 ? "supermarket" : index < 6 ? "shop" : "restaurant", distanceMeters: 100 }));
    const result = buildNeighborhoodScore({ places, placesLoaded: true, stations: [], stationsLoaded: false,
      shoppingCentresLoaded: true, shoppingCentres: [{ id: "mall", name: "Mall", lon: 2.35, lat: 48.85,
        distanceMeters: 200, areaM2: 10000, walking: { durationSeconds: 300, distanceMeters: 400 } }], generatedAt: 1 });
    const daily = result.categories.find(category => category.id === "daily-life")!;
    expect(daily.score).toBe(10);
    const group = daily.scoreDetails![0]!;
    expect(group.rows.find(row => row.labelKey.endsWith(".shoppingCentre"))?.points).toBe(0.6);
    expect(group.rows.find(row => row.labelKey.endsWith(".cap"))?.points).toBeCloseTo(-0.6);
    expectGroupReconciles(group);
  });

  it("reconciles dynamic server security indicators, a measured penalty, rounding and a trend correction", () => {
    const verdict: PublicNeighborhoodVerdict = { schemaVersion: "1.3", generatedAt: "2026-01-01", sources: [], warnings: [],
      categories: [{ id: "security", status: "available", score: 4, positiveFacts: [], negativeFacts: [], limitations: [] }],
      security: { commune: { localScore: 3.5, availableWeight: 1, indicators: [
        { id: "a", label: "A", weight: 0.25, percentile: 0.2 }, { id: "b", label: "B", weight: 0.75, percentile: 0.8 },
      ] }, trend: { deltaPercent: -10, adjustment: 0.5 } },
    };
    const result = buildNeighborhoodScore({ places: [], placesLoaded: false, stations: [], stationsLoaded: false, backendVerdict: verdict, generatedAt: 1 });
    const security = result.categories.find(category => category.id === "security")!;
    expect(security.score).toBe(4);
    expect(security.scoreDetails).toHaveLength(3);
    for (const group of security.scoreDetails!) expectGroupReconciles(group);
    const rows = security.scoreDetails![0]!.rows;
    expect(rows[0]).toMatchObject({ label: "A", weight: 0.25, points: 2 });
    expect(rows[1]!.points).toBeCloseTo(1.5);
    expect(security.scoreDetails![1]!.rows[1]!.points).toBe(0.5);
  });

  it("exposes the server green-space distance and air/noise observations when supplied", () => {
    const fact = (id: string, category: "living-environment" | "nature-leisure", family: string, value: number) => ({
      id, category, family, value, polarity: "neutral" as const, priority: 1, label: id, explanation: "", rule: "", proof: "derived" as const,
      observedAt: "2026-01-01", sourceIds: [],
    });
    const verdict: PublicNeighborhoodVerdict = { schemaVersion: "1.3", generatedAt: "2026-01-01", sources: [], warnings: [], categories: [
      { id: "nature-leisure", status: "available", score: 8, positiveFacts: [], negativeFacts: [], neutralFacts: [fact("green", "nature-leisure", "managed-green-space-reference", 400)], limitations: [] },
      { id: "living-environment", status: "available", score: 7.5, positiveFacts: [fact("air", "living-environment", "air", 10)], negativeFacts: [], neutralFacts: [fact("noise", "living-environment", "noise", 5)], limitations: [] },
    ] };
    const result = buildNeighborhoodScore({ places: [], placesLoaded: false, stations: [], stationsLoaded: false, backendVerdict: verdict, generatedAt: 1 });
    const nature = result.categories.find(category => category.id === "nature-leisure")!;
    const living = result.categories.find(category => category.id === "living-environment")!;
    expect(nature.scoreDetails![0]!.rows[0]).toMatchObject({ measurement: 400, value: 8, points: 8 });
    expect(living.scoreDetails![0]!.rows.map(row => row.points)).toEqual([5, 2.5]);
    for (const category of [nature, living]) for (const group of category.scoreDetails!) expectGroupReconciles(group);
  });

  it("exposes each personal result and excludes a failed journey from the average", () => {
    const rows = [
      { id: "fast", destinationId: "fast", commute: false, status: "ready" as const, positiveBelowMinutes: 30, neutralThroughMinutes: 45, journey: { id: "fast", durationSeconds: 20 * 60, transferCount: 0, sections: [] } },
      { id: "neutral", destinationId: "neutral", commute: false, status: "ready" as const, positiveBelowMinutes: 30, neutralThroughMinutes: 45, journey: { id: "neutral", durationSeconds: 40 * 60, transferCount: 0, sections: [] } },
      { id: "slow", destinationId: "slow", commute: false, status: "ready" as const, positiveBelowMinutes: 30, neutralThroughMinutes: 45, journey: { id: "slow", durationSeconds: 60 * 60, transferCount: 0, sections: [] } },
      { id: "failed", destinationId: "failed", commute: false, status: "error" as const, positiveBelowMinutes: 30, neutralThroughMinutes: 45 },
    ];
    const detail = personalJourneyScoreDetails(5, rows);
    expect(detail.score).toBe(5);
    expect(detail.group?.rows.map(row => row.value)).toEqual([5, 10, 5, 0, undefined]);
    expect(detail.group?.rows.map(row => row.weight)).toEqual([0.25, 0.25, 0.25, 0.25, undefined]);
    expectGroupReconciles(detail.group!);
  });

  it("retains unmeasured transport components without inventing zeros", () => {
    const result = buildNeighborhoodScore({ places: [], placesLoaded: false, stations: [], stationsLoaded: true, generatedAt: 1 });
    const transport = result.categories.find(category => category.id === "transport")!;
    expect(transport.score).toBe(1.5);
    expect(transport.scoreDetails![0]!.rows.find(row => row.labelKey.endsWith(".transportFrequency"))?.value).toBeUndefined();
    expectGroupReconciles(transport.scoreDetails![0]!);
  });
});
