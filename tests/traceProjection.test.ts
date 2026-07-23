import { describe, expect, it } from "vitest";
import {
  createCanonicalTraceGeometry,
  createSegmentsFromTraces,
  projectStopsMonotonically,
} from "../server/services/lineGeometry/traceProjection";

describe("GTFS trace projection", () => {
  it("rejects a nearby but unrelated trace outside the 300 metre tolerance", () => {
    const projected = projectStopsMonotonically(
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.31, lat: 48.8 },
      ],
      [
        [
          { lon: 2.3, lat: 48.81 },
          { lon: 2.31, lat: 48.81 },
        ],
      ],
    );

    expect(projected).toBeUndefined();
  });

  it("prefers a shape with a lower average error over a uniformly shifted shape", () => {
    const accurateTrace = [
      { lon: 2.3, lat: 48.8 },
      { lon: 2.31, lat: 48.8007 },
      { lon: 2.32, lat: 48.8 },
    ];
    const shiftedTrace = [
      { lon: 2.3, lat: 48.80045 },
      { lon: 2.31, lat: 48.80045 },
      { lon: 2.32, lat: 48.80045 },
    ];
    const projected = projectStopsMonotonically(
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.31, lat: 48.8 },
        { lon: 2.32, lat: 48.8 },
      ],
      [shiftedTrace, accurateTrace],
    );

    expect(projected?.trace).toBe(accurateTrace);
    expect(projected?.meanErrorMeters).toBeLessThan(35);
  });

  it("rejects an implausible detour even when both terminal projections are exact", () => {
    const projected = projectStopsMonotonically(
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.31, lat: 48.8 },
      ],
      [
        [
          { lon: 2.3, lat: 48.8 },
          { lon: 2.3, lat: 48.9 },
          { lon: 2.31, lat: 48.9 },
          { lon: 2.31, lat: 48.8 },
        ],
      ],
    );

    expect(projected).toBeUndefined();
  });

  it("uses successive shapes from the same provider when no single shape covers every stop", () => {
    const request = {
      lineId: "line:test",
      stops: [
        { id: "A", lon: 2.3, lat: 48.8 },
        { id: "B", lon: 2.31, lat: 48.8 },
        { id: "C", lon: 2.32, lat: 48.8 },
      ],
      branches: [{ id: "complete", stopIds: ["A", "B", "C"] }],
    };
    const segments = createSegmentsFromTraces(request, [
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.31, lat: 48.8 },
      ],
      [
        { lon: 2.31, lat: 48.8 },
        { lon: 2.32, lat: 48.8 },
      ],
    ]);

    expect(segments).toHaveLength(2);
    expect(segments?.map((segment) => segment.id)).toEqual(["A--B", "B--C"]);
  });

  it("rejects the provider when an adjacent stop pair has no matching shape", () => {
    const request = {
      lineId: "line:test",
      stops: [
        { id: "A", lon: 2.3, lat: 48.8 },
        { id: "B", lon: 2.31, lat: 48.8 },
        { id: "C", lon: 2.32, lat: 48.8 },
      ],
      branches: [{ id: "incomplete", stopIds: ["A", "B", "C"] }],
    };

    expect(
      createSegmentsFromTraces(request, [
        [
          { lon: 2.3, lat: 48.8 },
          { lon: 2.31, lat: 48.8 },
        ],
      ]),
    ).toBeUndefined();
  });

  it("keeps a tiny edge when two nearby stops project to the same shape point", () => {
    const request = {
      lineId: "line:test",
      stops: [
        { id: "A", lon: 2.3, lat: 48.8 },
        { id: "B", lon: 2.3002, lat: 48.8 },
      ],
      branches: [{ id: "nearby", stopIds: ["A", "B"] }],
    };
    const segments = createSegmentsFromTraces(request, [
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.3, lat: 48.81 },
      ],
    ]);

    expect(segments).toHaveLength(1);
    expect(segments?.[0].coordinates).toEqual([
      { lon: 2.3, lat: 48.8 },
      { lon: 2.3002, lat: 48.8 },
    ]);
  });

  it("builds provider-owned route geometry from complete traces without request chords", () => {
    const traces = [
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.301, lat: 48.801 },
        { lon: 2.302, lat: 48.8 },
      ],
      [
        { lon: 2.31, lat: 48.81 },
        { lon: 2.312, lat: 48.812 },
      ],
    ];

    const canonical = createCanonicalTraceGeometry(traces);

    expect(canonical.branches).toHaveLength(2);
    expect(canonical.segments).toHaveLength(2);
    expect(canonical.segments[0]).toMatchObject({
      id: "provider-trace:0",
      fromStopId: "provider-trace:0:start",
      toStopId: "provider-trace:0:end",
      coordinates: traces[0],
    });
    expect(canonical.stops).toEqual([
      { id: "provider-trace:0:start", lon: 2.3, lat: 48.8 },
      { id: "provider-trace:0:end", lon: 2.302, lat: 48.8 },
      { id: "provider-trace:1:start", lon: 2.31, lat: 48.81 },
      { id: "provider-trace:1:end", lon: 2.312, lat: 48.812 },
    ]);
  });
});
