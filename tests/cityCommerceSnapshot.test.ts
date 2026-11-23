import { describe, expect, it } from "vitest";
import type { CompiledPlacesCityFile, CompiledPlacesManifest } from "../src/services/places/compiledPlaces";
import { isNearbyPlaceCommerce, nearbyPlaceMarkerIconId } from "../src/features/nearby-stations/nearbyPlacePresentation";
import { loadCityCommerceSnapshot, useCityCommerceSnapshot } from "../src/features/nearby-stations/cityCommerceSnapshot";

function manifest() {
  return {
    schemaVersion: 1, datasetId: "osm-places-by-commune", generatedAt: "2026-11-20T00:00:00Z", scope: "idf",
    attribution: "© OpenStreetMap contributors", license: "ODbL", normalizationVersion: "v1",
    cities: [
      { code: "75056", name: "Paris", departmentCode: "75", bbox: [2, 48, 3, 49], centroid: [2.5, 48.5], asset: "75056.json", bytes: 1, checksumSha256: "x", placeCount: 0, categoryCounts: {}, neighborhoodCommerceCount: 0 },
      { code: "92020", name: "Montrouge", departmentCode: "92", bbox: [2, 48, 3, 49], centroid: [2.3, 48.8], asset: "92020.json", bytes: 1, checksumSha256: "x", placeCount: 0, categoryCounts: {}, neighborhoodCommerceCount: 0 },
      { code: "92021", name: "Nanterre", departmentCode: "92", bbox: [2, 48, 3, 49], centroid: [2.4, 48.9], asset: "92021.json", bytes: 1, checksumSha256: "x", placeCount: 0, categoryCounts: {}, neighborhoodCommerceCount: 0 },
    ],
  } as unknown as CompiledPlacesManifest;
}

function cityFile(code: string, places: CompiledPlacesCityFile["places"]): CompiledPlacesCityFile {
  return { schemaVersion: 1, datasetId: "osm-places-by-commune", generatedAt: "2026-11-20T00:00:00Z", scope: "idf",
    city: { code, name: code, departmentCode: code.slice(0, 2), bbox: [2, 48, 3, 49], centroid: [2.3, 48.8] }, places, categoryCounts: {} } as unknown as CompiledPlacesCityFile;
}

function record(id: string, category: "shop" | "food" | "culture", kind: string, lon = 2.3, lat = 48.8) {
  return { id, name: id, lon, lat, category, kind, rankingCategory: category === "shop" || category === "food" ? "commerce" : "culture", tags: {} } as CompiledPlacesCityFile["places"][number];
}

describe("shared municipal commerce snapshot", () => {
  it("preserves interactive-map point tuples, counts and category totals for the export", async () => {
    const records = [record("one", "shop", "bakery"), record("two", "food", "restaurant"), record("two", "food", "restaurant"), record("not-commerce", "culture", "museum"), record("no-coordinate", "shop", "bakery", 2.3, 91)];
    const access = {
      loadPlacesManifest: async () => manifest(),
      loadPlacesCity: async () => cityFile("75056", records),
    };
    const snapshot = await loadCityCommerceSnapshot({ lat: 48.8, lon: 2.3, code: "75101" }, access);
    const interactiveTuples = snapshot.places.filter(isNearbyPlaceCommerce)
      .map(place => [place.id, place.lon, place.lat, place.category, nearbyPlaceMarkerIconId(place)]).sort();
    const exportTuples = snapshot.commerces
      .map(point => [point.id, point.lon, point.lat, point.category, point.iconId]).sort();
    expect(snapshot.commune.code).toBe("75056");
    expect(exportTuples).toEqual(interactiveTuples);
    expect(snapshot.recordedTotal).toBe(3);
    expect(snapshot.mappedTotal).toBe(2);
    expect(snapshot.unmappedTotal).toBe(1);
    expect(snapshot.categories.reduce((sum, category) => sum + category.count, 0)).toBe(snapshot.mappedTotal);
    expect(snapshot.categories).toHaveLength(2);
    expect(snapshot.categories.map(category => category.count)).toEqual([1, 1]);
    expect(snapshot.categories.every(category => category.id.includes(":"))).toBe(true);
  });

  it("returns a covered empty inventory as zero and ignores a late response for the old commune", async () => {
    const pendingOld: { resolve?: (value: CompiledPlacesCityFile) => void } = {};
    let currentCode = "92020";
    const access = {
      loadPlacesManifest: async () => manifest(),
      loadPlacesCity: ({ code }: { code: string }) => code === "92020"
        ? new Promise<CompiledPlacesCityFile>(resolve => { pendingOld.resolve = resolve; })
        : Promise.resolve(cityFile(code, [])),
    };
    const { ref, nextTick } = await import("vue");
    const origin = ref({ lat: 48.8, lon: 2.3, code: "92020" });
    const state = useCityCommerceSnapshot(origin, true, access);
    await nextTick();
    origin.value = { lat: 48.9, lon: 2.4, code: "92021" };
    currentCode = "92021";
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();
    expect(state.snapshot.value?.commune.code).toBe(currentCode);
    expect(state.snapshot.value?.recordedTotal).toBe(0);
    pendingOld.resolve?.(cityFile("92020", [record("late", "shop", "bakery")]));
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();
    expect(state.snapshot.value?.commune.code).toBe("92021");
  });
});
