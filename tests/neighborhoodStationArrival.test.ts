import { describe, expect, it } from "vitest";
import { createNeighborhoodStationReferenceResolver, getOfficialStationReference, resolveNeighborhoodStationReference } from "../src/features/nearby-stations/neighborhoodStationReferences";
import { evaluateNearbyHeavyJourney } from "../src/features/nearby-stations/nearbyHeavyTransportRules";
import type { NearbyJourney } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { GlobalMapStation } from "../src/features/transport-map/contracts/manifest";

describe("verdict station arrival", () => {
  const station = (name: string, rawRefs: string[], lon = 2.3): GlobalMapStation => ({
    name, aliases: [name], rawRefs, lon, lat: 48.8,
  } as GlobalMapStation);
  it("links a NeTEx-only quay to one co-located official station without matching partial names", () => {
    const quay = station("Example - Station", ["station:FR::Quay:123:FR1"]);
    const current = station("Example Station", ["12345"], 2.3002);
    expect(resolveNeighborhoodStationReference(quay, [quay, current], 250)).toBe("stop_area:IDFM:12345");
    expect(resolveNeighborhoodStationReference(quay, [station("Example", ["12345"])], 250)).toBeUndefined();
    expect(resolveNeighborhoodStationReference(quay, [station("Example Station", ["12345"], 2.4)], 250)).toBeUndefined();
  });
  it("keeps ambiguous co-located references unresolved and preserves a station's own reference", () => {
    const quay = station("Example", ["station:FR::Quay:123:FR1"]);
    const stations = [station("Example", ["12345"]), station("Example", ["67890"], 2.3002)];
    expect(resolveNeighborhoodStationReference(quay, stations, 250)).toBeUndefined();
    expect(resolveNeighborhoodStationReference(stations[0]!, stations, 250)).toBe("stop_area:IDFM:12345");
  });
  it("preserves official namespaces and refuses a projected reference without a current station", () => {
    expect(getOfficialStationReference({ rawRefs: ["IDFM:monomodalStopPlace:42"] })).toBe("stop_area:IDFM:monomodalStopPlace:42");
    expect(getOfficialStationReference({ rawRefs: ["123"] })).toBe("stop_area:IDFM:123");
    expect(getOfficialStationReference({ rawRefs: ["gpe-projected"] })).toBeUndefined();
  });
  it("reuses the name index across destination probes without traversing the catalogue again", () => {
    let aliasReads = 0;
    const current = station("Example Station", ["12345"]);
    Object.defineProperty(current, "aliases", { get() { aliasReads++; return ["Exact Alias"]; } });
    const resolve = createNeighborhoodStationReferenceResolver([current], 250);
    expect(resolve(current)).toBe("stop_area:IDFM:12345");
    expect(aliasReads).toBe(0);
    const quay = station("Exact Alias", ["station:FR::Quay:123:FR1"]);
    for (let i = 0; i < 20; i++) expect(resolve(quay)).toBe("stop_area:IDFM:12345");
    expect(aliasReads).toBe(1);
    expect(resolve(station("Example", [], 2.3))).toBeUndefined();
    expect(resolve(station("Exact Alias", [], 2.4))).toBeUndefined();
  });
  it("applies the existing thirty-minute bound after only the initial wait for GTFS", () => {
    const journey: NearbyJourney = { source: "gtfs", durationSeconds: 1860, transferCount: 1, sections: [
      { type: "walking", durationSeconds: 120 }, { type: "waiting", durationSeconds: 120 },
      { type: "public_transport", lineId: "tram", lineMode: "TRAM", durationSeconds: 600 },
      { type: "waiting", durationSeconds: 120 },
      { type: "public_transport", lineId: "rail", lineMode: "RER", durationSeconds: 900 },
    ] };
    const options = { stationDistanceMeters: 5000, localLineIds: new Set(["tram"]), localLineCodes: new Set<string>() };
    expect(evaluateNearbyHeavyJourney({ ...options, journey })?.scoreSeconds).toBe(1740);
    expect(evaluateNearbyHeavyJourney({ ...options, journey: { ...journey, source: undefined } })).toBeUndefined();
    expect(evaluateNearbyHeavyJourney({ ...options, journey: { ...journey, durationSeconds: 1921 } })).toBeUndefined();
  });
});
