import { describe, expect, it } from "vitest";
import { alignNearbyWalkingGeometryToEndpoints, createNearbyTravelWalkingSegments } from "../src/features/nearby-stations/nearbyTravelGeometry";
import type { NearbyJourneySection } from "../src/features/nearby-stations/nearbyHeavyTransports";

const origin = { lon: 2.30, lat: 48.81 };
const firstStop = { lon: 2.301, lat: 48.811 };
const secondStop = { lon: 2.302, lat: 48.812 };
const destination = { lon: 2.31, lat: 48.82 };

function walk(fromPoint?: typeof origin, toPoint?: typeof origin): NearbyJourneySection {
  return {
    type: "street_network",
    mode: "walking",
    durationSeconds: 120,
    fromPoint,
    toPoint,
  };
}

function tram(fromPoint: typeof origin, toPoint: typeof origin, lineCode = "T6"): NearbyJourneySection {
  return {
    type: "public_transport",
    mode: "tram",
    durationSeconds: 600,
    lineCode,
    lineMode: "TRAM",
    fromPoint,
    toPoint,
  };
}

describe("nearby travel walking geometry", () => {
  it("uses transit boundaries instead of a malformed walking endpoint", () => {
    const segments = createNearbyTravelWalkingSegments({
      id: "journey:t6",
      sections: [
        // This is the regression shape: the street-network endpoint is the
        // destination, while the T6 section contains the real boarding stop.
        walk(origin, destination),
        tram(firstStop, secondStop),
        walk(secondStop, destination),
      ],
    }, origin, destination);

    expect(segments).toEqual([
      { id: "journey:t6:walk:0", from: origin, to: firstStop },
      { id: "journey:t6:walk:2", from: secondStop, to: destination },
    ]);
  });

  it("links a transfer walk between the previous and next lines", () => {
    const segments = createNearbyTravelWalkingSegments({
      id: "journey:transfer",
      sections: [
        tram(origin, firstStop, "T6"),
        walk(firstStop, destination),
        tram(secondStop, destination, "T2"),
      ],
    }, origin, destination);

    expect(segments).toEqual([
      { id: "journey:transfer:walk:1", from: firstStop, to: secondStop },
    ]);
  });

  it("starts a transfer walk at the selected exit", () => {
    const fastestExit = { lon: 2.304, lat: 48.813 };
    const segments = createNearbyTravelWalkingSegments({
      id: "journey:transfer-exit",
      sections: [
        tram(origin, firstStop, "T6"),
        walk(firstStop, destination),
        tram(secondStop, destination, "T2"),
      ],
    }, origin, destination, {
      resolveTransitExitPoint: (section, target) => {
        expect(section.lineCode).toBe("T6");
        expect(target).toEqual(secondStop);
        return fastestExit;
      },
    });

    expect(segments).toEqual([{
      id: "journey:transfer-exit:walk:1",
      from: fastestExit,
      to: secondStop,
    }]);
  });

  it("clips provider geometry and restores exact transit boundary coordinates", () => {
    const geometry = [
      origin,
      { lon: 2.3005, lat: 48.8105 },
      firstStop,
      { lon: 2.3015, lat: 48.8115 },
      destination,
    ];
    const aligned = alignNearbyWalkingGeometryToEndpoints(geometry, origin, firstStop);
    expect(aligned[0]).toEqual(origin);
    expect(aligned.at(-1)).toEqual(firstStop);
    expect(aligned).not.toContainEqual(destination);
  });

  it("starts the final walk at the selected transit exit", () => {
    const fastestExit = { lon: 2.305, lat: 48.815 };
    const segments = createNearbyTravelWalkingSegments({
      id: "journey:exit",
      sections: [
        tram(origin, secondStop),
        walk(secondStop, destination),
      ],
    }, origin, destination, {
      resolveFinalTransitExitPoint: () => fastestExit,
    });

    expect(segments).toEqual([{
      id: "journey:exit:walk:1",
      from: fastestExit,
      to: destination,
    }]);
  });
});
