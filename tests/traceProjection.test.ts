import { describe, expect, it } from "vitest";
import {
  createCanonicalTraceGeometry,
  createCompleteSegmentsFromTraces,
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

  it("prefers a coherent reverse trace over a hybrid detour between the same stops", () => {
    const stops = [
      { lon: 2.36, lat: 48.88 },
      { lon: 2.76, lat: 48.74 },
    ];
    const hybridTrace = [
      stops[0],
      { lon: 2.2, lat: 49.1 },
      { lon: 2.9, lat: 49.1 },
      stops[1],
    ];
    const coherentReverseTrace = [
      stops[1],
      { lon: 2.6, lat: 48.8 },
      { lon: 2.45, lat: 48.86 },
      stops[0],
    ];

    const projected = projectStopsMonotonically(
      stops,
      [hybridTrace, coherentReverseTrace],
    );

    expect(projected?.trace).toEqual([...coherentReverseTrace].reverse());
    expect(projected?.pathRatio).toBeLessThan(1.8);
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

  it("keeps one requested segment per physical edge across duplicate trip traces", () => {
    const request = {
      lineId: "line:test",
      stops: [
        { id: "A", lon: 2.3, lat: 48.8 },
        { id: "B", lon: 2.31, lat: 48.8 },
        { id: "C", lon: 2.32, lat: 48.8 },
      ],
      branches: [
        { id: "A--B", stopIds: ["A", "B"] },
        { id: "B--C", stopIds: ["B", "C"] },
      ],
    };
    const segments = createSegmentsFromTraces(request, [
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.31, lat: 48.8 },
        { lon: 2.32, lat: 48.8 },
      ],
      [
        { lon: 2.32, lat: 48.8002 },
        { lon: 2.31, lat: 48.8002 },
        { lon: 2.3, lat: 48.8002 },
      ],
    ]);

    expect(segments?.map((segment) => segment.id)).toEqual(["A--B", "B--C"]);
    expect(new Set(segments?.map((segment) => segment.id)).size).toBe(2);
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

  it("keeps the requested topology complete when only part of a trace is available", () => {
    const request = {
      lineId: "line:IDFM:C01390",
      stops: [
        { id: "Puteaux", lon: 2.238, lat: 48.883 },
        { id: "LaDefense", lon: 2.2385, lat: 48.892 },
        { id: "Faubourg", lon: 2.246, lat: 48.895 },
        { id: "Fauvelles", lon: 2.25, lat: 48.9 },
      ],
      branches: [
        {
          id: "tram-t2",
          stopIds: ["Puteaux", "LaDefense", "Faubourg", "Fauvelles"],
        },
      ],
    };
    const segments = createCompleteSegmentsFromTraces(request, [
      [
        { lon: 2.238, lat: 48.883 },
        { lon: 2.2385, lat: 48.892 },
      ],
      [
        { lon: 2.246, lat: 48.895 },
        { lon: 2.25, lat: 48.9 },
      ],
    ]);

    expect(segments?.map((segment) => segment.id)).toEqual([
      "LaDefense--Puteaux",
      "Faubourg--LaDefense",
      "Faubourg--Fauvelles",
    ]);
    expect(segments?.find((segment) => segment.id === "Faubourg--LaDefense")?.coordinates).toEqual([
      { lon: 2.2385, lat: 48.892 },
      { lon: 2.246, lat: 48.895 },
    ]);
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
