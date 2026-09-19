import { describe, expect, it } from "vitest";
import { inferTravelServiceType } from "../src/features/nearby-stations/travelServiceType";
import type { NearbyJourneySection } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";

function networkFixture(): TransportMapNetwork {
  const stations = ["Alpha", "Bravo", "Charlie", "Delta"].map((name, index) => ({
    id: `station:${name.toLowerCase()}`,
    name,
    normalizedName: name.toLowerCase(),
    aliases: [],
    index,
  }));
  return {
    linesById: new Map([[
      "line:test",
      { id: "line:test", stationIds: stations.map((station) => station.id) },
    ]]),
    stationsById: new Map(stations.map((station) => [station.id, station])),
  } as unknown as TransportMapNetwork;
}

describe("travel service type inference", () => {
  it("marks a route that skips topology stops as semi-direct", () => {
    const section: NearbyJourneySection = {
      lineId: "line:test",
      lineCode: "R",
      durationSeconds: 600,
      stopNames: ["Alpha", "Charlie", "Delta"],
    };

    expect(inferTravelServiceType(section, networkFixture(), "line:test")).toBe("semi-direct");
  });

  it("marks a route serving every topology stop as all stops", () => {
    const section: NearbyJourneySection = {
      lineId: "line:test",
      lineCode: "R",
      durationSeconds: 900,
      stopNames: ["Alpha", "Bravo", "Charlie", "Delta"],
    };

    expect(inferTravelServiceType(section, networkFixture(), "line:test")).toBe("omnibus");
  });
});
