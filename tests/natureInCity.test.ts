import { describe, expect, it } from "vitest";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { clipCanopy, classifyParkWalks, disk, groupRegionalParks, natureDatasetSource, planarArea, verifiedGreenSpaceWalkingTime, woodlandComponents } from "../server/services/neighborhoodVerdict/natureInCity";
import { majorRoadsFromFeatures } from "../server/services/neighborhoodVerdict/greenSpaceRoads";
import { fromLambert93, toLambert93 } from "../server/services/neighborhoodVerdict/lambert93";
import { canopyBonus, type CanopyMeasure } from "../shared/natureInCity";
import { addCityGreenDensity } from "../src/features/nearby-stations/neighborhood/criteria/cityGreenDensity";
import { addAddressGreenery } from "../src/features/nearby-stations/neighborhood/criteria/natureInCity";
import { category, getNeighborhoodFactMarker } from "../src/features/nearby-stations/neighborhood/facts";
import { aggregateNeighborhoodScore } from "../src/features/nearby-stations/neighborhood/score";
import { comparisonScope } from "../src/features/nearby-stations/neighborhood-comparison/aggregate";
import type { ComparisonNeighborhood } from "../src/features/nearby-stations/neighborhood-comparison/types";

const rectangle = (x0: number, x1: number, y0 = -501, y1 = 501): Polygon =>
  [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const measure = (percentage: number): CanopyMeasure => ({
  source: "ign-nature-en-ville", percentage, canopyM2: 100 * percentage, areaM2: 10_000, period: "2021–2023",
  map: { scope: "commune", code: "92019", version: "123456789012345678901234" },
});

describe("IGN canopy", () => {
  it.each([[29.999, 0], [30, 1], [39.999, 1], [40, 2], [49.999, 2], [50, 3]])("scores %s percent as %s", (percent, points) => {
    expect(canopyBonus(percent)).toBe(points);
  });

  it("round trips Lambert-93 coordinates", () => {
    const [x, y] = toLambert93([3, 46.5]);
    expect(x).toBeCloseTo(700000, 4);
    expect(y).toBeCloseTo(6600000, 3);
    const [lon, lat] = fromLambert93(toLambert93([2.3522, 48.8566]));
    expect(lon).toBeCloseTo(2.3522, 7);
    expect(lat).toBeCloseTo(48.8566, 7);
  });

  it("measures across partitions and rejects a missing part of the perimeter", () => {
    const perimeter = disk([0, 0], 500);
    const tiles = [
      { coverage: [rectangle(-501, 0)], canopy: [rectangle(-501, 0)] },
      { coverage: [rectangle(0, 501)], canopy: [] as MultiPolygon },
    ];
    const result = clipCanopy(perimeter, tiles)!;
    expect(result.canopyM2 / result.areaM2).toBeCloseTo(0.5, 8);
    expect(clipCanopy(perimeter, tiles.slice(0, 1))).toBeUndefined();
  });

  it("uses the municipal badge independently and applies the local adjustment once", () => {
    const city = addCityGreenDensity({ ...category("nature-leisure"), available: true, score: 6 }, measure(50));
    expect(city.score).toBe(6);
    expect(getNeighborhoodFactMarker(city.positiveFacts[0]!)).toBe("+++");
    const nature = { ...category("nature-leisure"), available: true, score: 6 };
    expect(addAddressGreenery(nature, { address: measure(50), parkAccess: "beyond" }).score).toBe(8);
    expect(addAddressGreenery(nature, { parkAccess: "unknown" }).negativeFacts).toHaveLength(0);
    const result = aggregateNeighborhoodScore([nature, { ...category("living-environment"), available: false }], {
      places: [], placesLoaded: false, stations: [], stationsLoaded: false,
      backendVerdict: { schemaVersion: "1.3", generatedAt: "", categories: [], sources: [], warnings: [],
        greenery: { address: measure(30), commune: measure(50) } },
    });
    expect(result.categories[0]?.positiveFacts.map(fact => fact.kind)).toEqual(["cityGreenDensity", "addressCanopy"]);
    expect(result.categories[0]?.score).toBe(7);
    expect(result.categories[1]?.positiveFacts).toEqual([]);
  });

  it("uses the existing verdict R2 directory unless an override is configured", () => {
    const env = { IDFM_NEIGHBORHOOD_VERDICT_CACHE_REMOTE: "r2://bucket/neighborhood-verdict/compiled.json" };
    expect(natureDatasetSource(env)).toBe("r2://bucket/ign-nature-en-ville");
    expect(natureDatasetSource({ ...env, IDFM_NATURE_IN_CITY_LOCAL: "./override/" })).toBe("./override");
  });
});

describe("access and comparison scopes", () => {
  it("ignores ordinary parcel gaps and départementales, but detects a national road in the same gap", () => {
    const parcels = [rectangle(-160, -120, -10, 10), rectangle(0, 500), rectangle(500, 700)];
    const roads = (classification: string, level = 0) => majorRoadsFromFeatures([{
      properties: { cpx_classement_administratif: classification, position_par_rapport_au_sol: level },
      geometry: { type: "LineString", coordinates: [[-70, -1000], [-70, 1000]] },
    }]);
    expect(woodlandComponents(parcels, roads("Départementale")).fragmented).toBe(false);
    expect(woodlandComponents(parcels, roads("Autoroute", -1)).fragmented).toBe(false);
    const woodland = woodlandComponents(parcels, roads("Nationale/Route nommée"));
    expect(woodland.fragmented).toBe(true);
    expect(planarArea(woodland.main!)).toBe(700 * 1002);
    expect(woodlandComponents(parcels).main).toBeUndefined();
  });

  it("groups a domain and its labelled parcels without merging distant parks with the same name", () => {
    const park = (id: string, name: string, lon: number) => ({ id, name,
      geometry: { type: "MultiPolygon" as const, coordinates: [rectangle(lon, lon + .001, 48.76, 48.761)] } });
    const groups = groupRegionalParks([
      park("1", "Domaine de la Vallée aux Loups / Le Parc boisé", 2.26),
      park("2", "Domaine Départemental de la Vallée-aux-Loups", 2.264),
      park("3", "Parc Boisé du Parc de la Vallée-aux-Loups", 2.266),
      park("4", "Domaine de la Vallée aux Loups", 2.5),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.ids).toEqual(expect.arrayContaining(["1", "2", "3"]));
    expect(groups[0]?.name).toBe("Domaine Départemental de la Vallée-aux-Loups");
    expect(groups[0]?.geometry.coordinates).toHaveLength(3);
  });

  it("does not count a route that only ends across the road before the requested target", () => {
    const target = { lon: 2.26, lat: 48.76 };
    const across = { lon: 2.26, lat: 48.771 };
    const boundary = { type: "Polygon" as const, coordinates: [rectangle(2.25, 2.27, 48.75, 48.77)[0]!] };
    const route = { provider: "ign-bdtopo" as const, durationSeconds: 900, distanceMeters: 1100,
      coordinates: [across, across, target] };
    expect(verifiedGreenSpaceWalkingTime(route, boundary)).toBeUndefined();
    expect(verifiedGreenSpaceWalkingTime({ ...route, coordinates: [across, target, target] }, boundary)).toBe(900);
  });
  it("treats 30 minutes as exclusive and cannot infer absence from incomplete routing", () => {
    expect(classifyParkWalks([undefined, 1799], false)).toBe("within");
    expect(classifyParkWalks([1800, 2000], true)).toBe("beyond");
    expect(classifyParkWalks([1800, undefined], true)).toBe("unknown");
    expect(classifyParkWalks([1800], false)).toBe("unknown");
  });

  it("excludes the selected IRIS and leaves a single-IRIS commune without a comparison", () => {
    const selected = { codeIris: "1" } as ComparisonNeighborhood;
    const other = { codeIris: "2" } as ComparisonNeighborhood;
    expect(comparisonScope([selected, other], "1", "rest")).toEqual([other]);
    expect(comparisonScope([selected], "1", "rest")).toHaveLength(0);
    expect(comparisonScope([selected, other], undefined, "rest")).toHaveLength(0);
  });
});
