import { describe, expect, it } from "vitest";
import { matchGtfsEntrancesToRequestStops } from "../server/services/lineGeometry/entranceMatching";
import type { GtfsIndexedPattern } from "../server/services/gtfs/types";

describe("GTFS entrance matching", () => {
  it("matches an entrance from its parent station projection, never from the entrance position", () => {
    const patterns: GtfsIndexedPattern[] = [
      createPattern("IDFM:71410", 2.35709, 48.88075),
      createPattern("IDFM:71434", 2.3595, 48.8844),
    ];
    const entrances = [
      {
        id: "gare-du-nord:far-exit",
        parentStopId: "IDFM:71410",
        name: "r. du Faubourg Saint-Denis",
        code: "1",
        // Deliberately closer to La Chapelle than to the Gare du Nord centre.
        lon: 2.3594,
        lat: 48.8839,
      },
      {
        id: "la-chapelle:exit",
        parentStopId: "IDFM:71434",
        name: "La Chapelle",
        code: "0",
        lon: 2.3595,
        lat: 48.8844,
      },
    ];

    expect(
      matchGtfsEntrancesToRequestStops(entrances, patterns, [
        {
          id: "FR::monomodalStopPlace:462394:FR1",
          label: "Gare du Nord",
          lon: 2.3572,
          lat: 48.8808,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: "gare-du-nord:far-exit",
        parentStopId: "FR::monomodalStopPlace:462394:FR1",
      }),
    ]);
  });

  it("keeps an exact parent reference without requiring a projection", () => {
    expect(
      matchGtfsEntrancesToRequestStops(
        [
          {
            id: "exact",
            parentStopId: "stop:gare-du-nord",
            name: "Exact",
            lon: 2.3572,
            lat: 48.8808,
          },
        ],
        [],
        [{ id: "stop:gare-du-nord", lon: 2.3572, lat: 48.8808 }],
      ),
    ).toEqual([
      expect.objectContaining({
        id: "exact",
        parentStopId: "stop:gare-du-nord",
      }),
    ]);
  });
});

function createPattern(
  stopId: string,
  lon: number,
  lat: number,
): GtfsIndexedPattern {
  return {
    id: `pattern:${stopId}`,
    stopIds: [stopId],
    shapeId: "shape:test",
    shapeDirection: "forward",
    projections: [
      {
        stopId,
        shapePointIndex: 0,
        segmentProgress: 0,
        distanceAlongMeters: 0,
        errorMeters: 10,
        coordinate: { lon, lat },
      },
    ],
  };
}
