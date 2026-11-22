import { describe, expect, it } from "vitest";
import { buildComparisonGeography, buildComparisonGreen, ComparisonLocationError, polygonAreaM2 } from "../server/services/neighborhoodVerdict/comparison";
import type { CompiledNeighborhoodVerdictData, CompiledIrisNeighborhood, VerdictPolygonGeometry } from "../server/services/neighborhoodVerdict/contracts";
import { aggregateComparisonPlaces, aggregateComparisonPlacesAsync, aggregateComparisonTransport, perSquareKilometer, placesCityCode } from "../src/features/nearby-stations/neighborhood-comparison/aggregate";
import type { ComparisonNeighborhood } from "../src/features/nearby-stations/neighborhood-comparison/types";
import type { CompiledPlaceRecord } from "../src/services/places/compiledPlaces";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import { buildVerdictPdfReport, compareVerdictMetric, withVerdictPdfComparison } from "../src/features/nearby-stations/verdictPdfReport";

function box(x: number, y: number, width = 1, height = 1): VerdictPolygonGeometry {
  return { type: "Polygon", coordinates: [[[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]]] };
}
function iris(id: string, communeCode: string, x: number, departmentCode = "92"): CompiledIrisNeighborhood {
  return { id, codeIris: id, communeCode, communeName: "Homonyme", departmentCode, name: id, type: "H", centroid: [x + .5, .5], geometry: box(x, 0) };
}
function fixture(): CompiledNeighborhoodVerdictData {
  return {
    generatedAt: "2026-01-01", iris: { sourceId: "insee-iris", bbox: [0, 0, 3, 1], neighborhoods: [iris("a", "A", 0), iris("b", "A", 1), iris("c", "B", 2)] },
    sources: [{ id: "insee-iris", title: "IRIS", pageUrl: "https://example.com", licence: { label: "x", attribution: "x" } }, { id: "hds-green-spaces", title: "Greens", pageUrl: "https://example.com", licence: { label: "x", attribution: "x" } }],
    greenSpaces: [
      { id: "g1", name: "G1", sourceId: "hds-green-spaces", centroid: [.4, .5], geometry: box(.2, .2, .4, .4) },
      { id: "g2", name: "G2", sourceId: "hds-green-spaces", centroid: [.5, .5], geometry: box(.3, .2, .4, .4) },
    ],
  } as unknown as CompiledNeighborhoodVerdictData;
}
function point(id: string, lon: number, kind: string, category: CompiledPlaceRecord["category"], tags: Record<string, string>): CompiledPlaceRecord {
  return { id, name: id, lon, lat: .5, kind, category, tags };
}

describe("neighborhood comparison", () => {
  it("resolves by stable commune code, preserves homonyms and makes boundary ambiguity explicit", () => {
    const data = fixture();
    expect(buildComparisonGeography(data, { lon: .5, lat: .5 }).neighborhoods.map(item => item.codeIris)).toEqual(["a", "b"]);
    const shared = buildComparisonGeography(data, { lon: 1, lat: .5 });
    expect(shared.matchingCodes.sort()).toEqual(["a", "b"]);
    expect(shared.selectedCode).toBeUndefined();
    expect(() => buildComparisonGeography(data, { lon: 2, lat: .5 })).toThrow(ComparisonLocationError);
    expect(buildComparisonGeography(data, { lon: 2, lat: .5 }, "B").selectedCode).toBe("c");
    expect(() => buildComparisonGeography(data, { lon: .5, lat: .5 }, "B")).toThrowError(expect.objectContaining({ reason: "context" }));
    expect(() => buildComparisonGeography(data, { lon: 10, lat: 10 })).toThrow(ComparisonLocationError);
    const paris = fixture();
    paris.iris.neighborhoods = [iris("paris15", "75115", 0, "75"), iris("paris16", "75116", 1, "75")];
    const allParis = buildComparisonGeography(paris, { lon: .5, lat: .5 }, "75056");
    expect(allParis.commune.code).toBe("75056");
    expect(allParis.neighborhoods.map(item => item.codeIris)).toEqual(["paris15", "paris16"]);
    const parisBoundary = buildComparisonGeography(paris, { lon: 1, lat: .5 });
    expect(parisBoundary.selectedCode).toBeUndefined();
    expect(parisBoundary.matchingCodes.sort()).toEqual(["paris15", "paris16"]);
    expect(buildComparisonGeography(paris, { lon: 1, lat: .5 }, "75116").selectedCode).toBe("paris16");
  });

  it("clips and unions overlapping green footprints, reports partial coverage and calculates area in m²", () => {
    const data = fixture();
    const result = buildComparisonGeography(data, { lon: .5, lat: .5 });
    expect(result.neighborhoods[0]!.green.status).toBe("pending");
    const green = buildComparisonGreen(data, "A");
    expect(green.a?.status).toBe("partial");
    expect(green.a?.sites).toBe(2);
    expect(green.a?.areaM2).toBeCloseTo(polygonAreaM2(box(.2, .2, .5, .4)), -2);
    expect(green.b).toMatchObject({ status: "partial", areaM2: 0 });
    const noCoverage = fixture();
    noCoverage.iris.neighborhoods = [iris("other", "C", 0, "78")];
    expect(buildComparisonGeography(noCoverage, { lon: .5, lat: .5 }).neighborhoods[0]!.green).toEqual({ status: "unavailable" });
    expect(perSquareKilometer(5, 500_000)).toBe(10);
    expect(perSquareKilometer(5, 0)).toBeUndefined();
  });

  it("counts classified places once and reports the sample", () => {
    const neighborhoods = buildComparisonGeography(fixture(), { lon: .5, lat: .5 }).neighborhoods;
    const places = [point("bakery", .25, "bakery", "shop", { shop: "bakery" }), point("restaurant", .5, "restaurant", "food", { amenity: "restaurant" }), point("office", 1.5, "company", "service", { office: "company" }), point("outside", 4, "bakery", "shop", { shop: "bakery" }), point("boundary", 1, "bakery", "shop", { shop: "bakery" })];
    const result = aggregateComparisonPlaces(neighborhoods, places);
    expect(result).toMatchObject({ sample: 5, assigned: 3, outside: 1, ambiguous: 1 });
    expect(result.counts.a).toMatchObject({ commerce: 2, economic: 2, commerceGroups: { "food-shopping": 1, "restaurants-cafes": 1 } });
    expect(result.counts.b).toMatchObject({ commerce: 0, economic: 1, economyGroups: { offices: 1 } });
    expect(placesCityCode("75115")).toBe("75056");
  });

  it("deduplicates transport lines and uses the loaded network without invoking routing", () => {
    const neighborhoods = buildComparisonGeography(fixture(), { lon: .5, lat: .5 }).neighborhoods as ComparisonNeighborhood[];
    const line = { id: "L", mode: "BUS" };
    const network = { stations: [{ lon: .2, lat: .3, lineIds: ["L"] }, { lon: .3, lat: .3, lineIds: ["L"] }], linesById: new Map([["L", line]]) } as unknown as TransportMapNetwork;
    const counts = aggregateComparisonTransport(neighborhoods, network);
    expect(counts.get("a")).toMatchObject({ stationCount: 2, lineCount: 1, lineIds: ["L"] });
    expect(counts.get("b")).toMatchObject({ stationCount: 0, lineCount: 0 });
  });

  it("produces the same result in responsive batches and cancels old work", async () => {
    const neighborhoods = buildComparisonGeography(fixture(), { lon: .5, lat: .5 }).neighborhoods;
    const places = Array.from({ length: 2_100 }, (_, index) => point(String(index), .25, "bakery", "shop", { shop: "bakery" }));
    expect(await aggregateComparisonPlacesAsync(neighborhoods, places, new AbortController().signal)).toEqual(aggregateComparisonPlaces(neighborhoods, places));
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 0);
    await expect(aggregateComparisonPlacesAsync(neighborhoods, places, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Verdict PDF comparison", () => {
  const report = buildVerdictPdfReport({
    locale: "fr", annexes: [], result: {
      categories: [], positiveFacts: [], negativeFacts: [], neutralFacts: [], sources: [], warnings: [],
      totalCategoryCount: 0, availableCategoryCount: 0, coverageRatio: 0, generatedAt: 0,
    },
  });
  const data = fixture();

  it("calculates the peer median and rank with documented values, including true zeroes and ties", () => {
    expect(compareVerdictMetric(8, [8, undefined, 12, 0, 3])).toEqual({ value: 8, median: 5.5, rank: 2, count: 5 });
    expect(compareVerdictMetric(0, [undefined, 0])).toEqual({ value: 0, median: 0, rank: 1, count: 2 });
    expect(compareVerdictMetric(undefined, [0])).toMatchObject({ median: 0, rank: undefined, count: 1 });
  });

  it("uses IRIS area and existing inventories without conflating missing coverage with zero", () => {
    const geography = buildComparisonGeography(data, { lon: .5, lat: .5 });
    const places = aggregateComparisonPlaces(geography.neighborhoods, []);
    const withData = withVerdictPdfComparison(report, { originKey: "test", loading: false, geography, places,
      green: { a: { status: "partial", areaM2: geography.neighborhoods[0]!.areaM2 * .08 } } });
    expect(withData.pages.find(page => page.kind === "city")?.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "areas", value: 2 }),
      expect.objectContaining({ label: "shops", value: 0 }),
      expect.objectContaining({ label: "parks", value: undefined }),
    ]));
    const comparison = withData.pages.find(page => page.kind === "comparison");
    expect(comparison?.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "shops", value: 0, median: 0, rank: 1, count: 2 }),
      expect.objectContaining({ label: "parks", value: 8, median: undefined, rank: undefined, count: 1 }),
    ]));
    expect(comparison?.neighborhood).toBe("a");
  });

  it("keeps the comparison page with the correct explanation for ambiguous and undivided communes", () => {
    for (const [lon, reason] of [[1, "scopeBoundary"], [2.5, "scopeNoRest"]] as const) {
      const geography = buildComparisonGeography(data, { lon, lat: .5 });
      const result = withVerdictPdfComparison(report, { originKey: "test", loading: false, geography });
      expect(result.pages.find(page => page.kind === "comparison")).toMatchObject({
        notice: `nearbyStations.comparison.${reason}`, metrics: [],
      });
    }
  });

  it("uses a common park inventory for all ranked areas", () => {
    const geography = buildComparisonGeography(data, { lon: .5, lat: .5 });
    const result = withVerdictPdfComparison(report, { originKey: "test", loading: false, geography, green: {
      a: { status: "partial", publicParkAreaM2: 500, areaM2: 4000 },
      b: { status: "partial", areaM2: 2000 },
    } });
    expect(result.pages.find(page => page.kind === "comparison")?.metrics).toContainEqual(
      expect.objectContaining({ label: "parks", value: expect.closeTo(100 * 4000 / geography.neighborhoods[0]!.areaM2, 10), count: 2 }),
    );
  });
});
