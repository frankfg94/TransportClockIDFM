import { strToU8, zipSync } from "fflate";
import type { WalkingIsochroneGeometry, WalkingIsochroneRing } from "../../src/shared/walkingIsochroneGeometry";
import {
  GLOBAL_ISOCHRONE_ATTRIBUTION, GLOBAL_ISOCHRONE_MINUTES, GLOBAL_ISOCHRONE_PARAMETERS,
  globalIsochroneScopeKey, globalIsochroneZoneAsset,
  type GlobalIsochroneIndex, type GlobalIsochroneScope,
} from "../../src/features/transport-map/isochrones/contracts";

export function walkingRing(lon = 2.35, lat = 48.85, radius = 0.002): WalkingIsochroneRing {
  return [[lon - radius, lat - radius], [lon + radius, lat - radius], [lon + radius, lat + radius], [lon - radius, lat + radius], [lon - radius, lat - radius]];
}
export function walkingPolygon(lon = 2.35, lat = 48.85, hole = false): WalkingIsochroneGeometry {
  return { type: "Polygon", coordinates: [walkingRing(lon, lat), ...(hole ? [walkingRing(lon, lat, 0.0005)] : [])] };
}
export function walkingOrsPayload(locations: readonly (readonly [number, number])[], hole = false) {
  return {
    type: "FeatureCollection",
    features: locations.flatMap(([lon, lat], group_index) => GLOBAL_ISOCHRONE_MINUTES.map((minutes) => ({
      type: "Feature", properties: { group_index, value: minutes * 60, center: [lon, lat] }, geometry: walkingPolygon(lon, lat, hole),
    }))).reverse(),
  };
}
export function walkingArchiveFixture(
  scopes: Array<Omit<GlobalIsochroneScope, "zones">> = [{ kind: "mode", id: "METRO", mode: "METRO", stationIds: ["s1", "s2"], coveredStationIds: ["s1"] }],
  geometry = walkingPolygon(2.35, 48.85, true),
) {
  const entries: Record<string, Uint8Array> = {};
  const index: GlobalIsochroneIndex = {
    schemaVersion: 1, mapDataVersion: "test-v1", calculationKey: "0123456789abcdef01234567", generatedAt: "2026-08-30T12:00:00Z",
    parameters: GLOBAL_ISOCHRONE_PARAMETERS, attribution: GLOBAL_ISOCHRONE_ATTRIBUTION, scopes: {},
  };
  for (const scope of scopes) {
    const key = globalIsochroneScopeKey(scope.kind, scope.id);
    const complete: GlobalIsochroneScope = { ...scope, zones: {} };
    for (const minutes of scope.coveredStationIds.length ? GLOBAL_ISOCHRONE_MINUTES : []) {
      const asset = globalIsochroneZoneAsset(key, minutes);
      const raw = strToU8(JSON.stringify(geometry));
      entries[asset] = raw;
      complete.zones[minutes] = { asset, bytes: raw.byteLength };
    }
    index.scopes[key] = complete;
  }
  function bytes() { return zipSync({ ...entries, "index.json": strToU8(JSON.stringify(index)) }); }
  return { index, entries, bytes };
}

export function walkingCatalogueFixture(extraMetroStations = 0) {
  const line = (id: string, mode: string) => [id, id, id, mode, "#2563eb", "#fff", [], [], null];
  const station = (id: string, lon: number, lat: number, lines: number[]) => [id, id, "Paris", 0, 0, lon, lat, 0, 0, "chunk", false, lines, []];
  return {
    bootstrap: { dataVersion: "test-v1", encoding: "rows-v1", lines: [line("line:METRO:1", "METRO"), line("line:METRO:2", "METRO"), line("line:RER:A", "RER"), line("line:BUS:1", "BUS"), line("line:NOCTILIEN:1", "NOCTILIEN")] },
    catalogue: { dataVersion: "test-v1", encoding: "rows-v1", stations: [
      station("s1", 2.35, 48.85, [0, 2]), station("s2", 2.351, 48.85, [0]),
      station("s3", 2.36, 48.86, [1]), station("s1-platform", 2.3500003, 48.8500002, [2]),
      station("b1", 2.37, 48.87, [3]), station("n1", 2.38, 48.88, [4]),
      ...Array.from({ length: extraMetroStations }, (_, i) => station(`extra-${i}`, 2.4 + i / 100, 48.85, [0])),
    ] },
    manifest: { schemaVersion: 1, dataVersion: "test-v1", files: { bootstrap: { asset: "bootstrap.json" }, catalog: { asset: "catalog.json" } } },
  };
}
