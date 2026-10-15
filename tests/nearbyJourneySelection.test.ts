import { describe, expect, it } from "vitest";
import { listNearbyHeavyJourneyAlternatives, type NearbyJourney } from "../src/features/nearby-stations/nearbyHeavyTransports";
import { chooseFastestJourney } from "../src/features/nearby-stations/neighborhood/journeys";

function walking(seconds: number): NearbyJourney["sections"][number] {
  return { type: "street_network", mode: "walking", durationSeconds: seconds };
}

function wait(seconds: number): NearbyJourney["sections"][number] {
  return { type: "waiting", mode: "waiting", durationSeconds: seconds };
}

function t6(seconds: number): NearbyJourney["sections"][number] {
  return { type: "public_transport", mode: "tram", lineMode: "TRAM", lineId: "IDFM:T6", lineCode: "T6", durationSeconds: seconds };
}

const directT6: NearbyJourney = {
  id: "direct-t6",
  source: "gtfs",
  durationSeconds: 660,
  transferCount: 0,
  sections: [walking(270), wait(33), t6(357)],
};

const reboardT6: NearbyJourney = {
  id: "reboard-t6",
  source: "gtfs",
  durationSeconds: 1_380,
  transferCount: 1,
  sections: [
    walking(245),
    wait(133),
    t6(162),
    { type: "transfer", mode: "transfer", durationSeconds: 133, transferDurationSource: "gtfs-minimum" },
    wait(167),
    t6(540),
  ],
};

describe("nearby journey selection", () => {
  it("keeps the direct T6 over alighting and reboarding it for a slightly shorter initial walk", () => {
    const alternatives = listNearbyHeavyJourneyAlternatives([reboardT6, directT6], {
      stationDistanceMeters: 5_000,
      localLineCodes: new Set(["T6"]),
    });

    expect(alternatives).toHaveLength(1);
    expect(alternatives[0]?.journey).toBe(directT6);
  });

  it("compares journey time before initial tram boarding walk within the same line pattern", () => {
    const slowerSingleRide: NearbyJourney = {
      ...reboardT6,
      sections: [walking(245), wait(133), t6(1_002)],
    };

    expect(chooseFastestJourney([slowerSingleRide, directT6])).toBe(directT6);
  });
});
