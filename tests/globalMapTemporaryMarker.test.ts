import { describe, expect, it } from "vitest";
import {
  parseGlobalMapNearbyHeavyLineIds,
  parseGlobalMapNearbyHeavyStationIds,
  parseGlobalMapLineToKeep,
  parseGlobalMapTemporaryMarker,
  parseGlobalMapTemporaryMarkerRadius,
} from "../src/features/line-map/globalMapTemporaryMarker";

describe("global map temporary marker query state", () => {
  it("parses the marker, its address label, radius, and repeated line scope", () => {
    const query = {
      temporaryMarker: "2.3522,48.8566",
      temporaryMarkerText: "Hôtel de Ville",
      temporaryMarkerRadius: "600",
      lineToKeep: ["line:bus:123", "line:metro:1", "line:bus:123"],
      nearbyHeavyLine: ["line:rer:A", "line:rer:A"],
      nearbyHeavyStation: ["station:heavy", "station:heavy"],
    };

    expect(parseGlobalMapTemporaryMarker(query)).toEqual({
      lon: 2.3522,
      lat: 48.8566,
      text: "Hôtel de Ville",
    });
    expect(parseGlobalMapTemporaryMarkerRadius(query)).toBe(600);
    expect(parseGlobalMapLineToKeep(query)).toEqual(["line:bus:123", "line:metro:1"]);
    expect(parseGlobalMapNearbyHeavyLineIds(query)).toEqual(["line:rer:A"]);
    expect(parseGlobalMapNearbyHeavyStationIds(query)).toEqual(["station:heavy"]);
  });

  it("rejects invalid coordinates and non-positive radii", () => {
    expect(parseGlobalMapTemporaryMarker({ temporaryMarker: "48.8566,not-a-number" })).toBeUndefined();
    expect(parseGlobalMapTemporaryMarker({ temporaryMarker: "181,48" })).toBeUndefined();
    expect(parseGlobalMapTemporaryMarkerRadius({ temporaryMarkerRadius: "0" })).toBeUndefined();
    expect(parseGlobalMapLineToKeep({ lineToKeep: ["", "  ", null] })).toEqual([]);
  });
});
