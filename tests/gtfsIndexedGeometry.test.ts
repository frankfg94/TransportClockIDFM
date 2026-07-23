import { describe, expect, it, vi } from "vitest";
import type { GtfsLineArtifact } from "../server/services/gtfs/types";
import {
  compileGtfsLineArtifact,
  createSegmentsFromIndexedGtfs,
} from "../server/services/lineGeometry/gtfsIndexedGeometry";
import * as traceProjection from "../server/services/lineGeometry/traceProjection";
import type { LineGeometryRequest } from "../src/features/line-map/lineGeometry";

describe("indexed GTFS geometry", () => {
  it("uses imported projections for forward, reverse and skipped-stop branches", () => {
    const projectionSpy = vi.spyOn(traceProjection, "projectStopsMonotonically");
    const compiled = compileGtfsLineArtifact(createArtifact());

    expect(
      createSegmentsFromIndexedGtfs(
        createRequest(["A", "B", "C"]),
        compiled,
      )?.map((segment) => segment.coordinates),
    ).toEqual([
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.305, lat: 48.805 },
        { lon: 2.31, lat: 48.81 },
      ],
      [
        { lon: 2.31, lat: 48.81 },
        { lon: 2.315, lat: 48.815 },
        { lon: 2.32, lat: 48.82 },
      ],
    ]);

    expect(
      createSegmentsFromIndexedGtfs(
        createRequest(
          ["C", "A"],
          [
            { lon: 2.32, lat: 48.82 },
            { lon: 2.3, lat: 48.8 },
          ],
        ),
        compiled,
      )?.[0].coordinates,
    ).toEqual([
      { lon: 2.32, lat: 48.82 },
      { lon: 2.315, lat: 48.815 },
      { lon: 2.31, lat: 48.81 },
      { lon: 2.305, lat: 48.805 },
      { lon: 2.3, lat: 48.8 },
    ]);
    expect(projectionSpy).not.toHaveBeenCalled();
  });

  it("matches namespace-different stop IDs through their indexed coordinates", () => {
    const compiled = compileGtfsLineArtifact(createArtifact());
    const request = createRequest(
      ["topology:alpha", "topology:bravo", "topology:charlie"],
      [
        { lon: 2.30001, lat: 48.80001 },
        { lon: 2.31001, lat: 48.81001 },
        { lon: 2.32001, lat: 48.82001 },
      ],
    );

    const segments = createSegmentsFromIndexedGtfs(request, compiled);

    expect(segments?.map(({ fromStopId, toStopId }) => [fromStopId, toStopId])).toEqual([
      ["topology:alpha", "topology:bravo"],
      ["topology:bravo", "topology:charlie"],
    ]);
  });

  it("rejects ambiguous coordinate matches and incomplete branch coverage", () => {
    const ambiguousArtifact = createArtifact({
      patterns: [
        createPattern("main", ["A", "B", "C"], "shape"),
        createPattern("nearby", ["A2", "B", "C"], "shape-nearby"),
      ],
      shapes: {
        shape: createShape(),
        "shape-nearby": [
          { lon: 2.30002, lat: 48.80002 },
          { lon: 2.305, lat: 48.805 },
          { lon: 2.31, lat: 48.81 },
          { lon: 2.315, lat: 48.815 },
          { lon: 2.32, lat: 48.82 },
        ],
      },
    });
    ambiguousArtifact.patterns[1].projections[0].coordinate = {
      lon: 2.30002,
      lat: 48.80002,
    };
    const ambiguous = createRequest(
      ["unknown", "B"],
      [
        { lon: 2.30001, lat: 48.80001 },
        { lon: 2.31, lat: 48.81 },
      ],
    );

    expect(
      createSegmentsFromIndexedGtfs(
        ambiguous,
        compileGtfsLineArtifact(ambiguousArtifact),
      ),
    ).toBeUndefined();

    expect(
      createSegmentsFromIndexedGtfs(
        createRequest(
          ["A", "missing"],
          [
            { lon: 2.3, lat: 48.8 },
            { lon: 2.5, lat: 49 },
          ],
        ),
        compileGtfsLineArtifact(createArtifact()),
      ),
    ).toBeUndefined();
  });

  it("ignores unusable patterns instead of scanning their raw shapes", () => {
    const artifact = createArtifact();
    artifact.patterns.push({
      ...createPattern("broken", ["A", "D"], "broken-shape"),
      projections: [],
    });
    artifact.shapes["broken-shape"] = [
      { lon: 2.3, lat: 48.8 },
      { lon: 2.4, lat: 48.9 },
    ];

    const compiled = compileGtfsLineArtifact(artifact);

    expect(compiled.patterns.map(({ id }) => id)).toEqual(["main"]);
    expect(
      createSegmentsFromIndexedGtfs(
        createRequest(
          ["A", "D"],
          [
            { lon: 2.3, lat: 48.8 },
            { lon: 2.4, lat: 48.9 },
          ],
        ),
        compiled,
      ),
    ).toBeUndefined();
  });

  it("prioritizes the requested direction before skipped stops and stable IDs", () => {
    const matchingDirection = createPattern(
      "z-matching-direction",
      ["A", "X", "B", "C"],
      "matching-shape",
    );
    matchingDirection.direction = "north";
    matchingDirection.projections[1] = {
      ...matchingDirection.projections[1],
      stopId: "X",
      coordinate: { lon: 2.306, lat: 48.806 },
      shapePointIndex: 1,
    };
    const shorterWrongDirection = createPattern(
      "a-shorter-wrong-direction",
      ["A", "B", "C"],
      "shape",
    );
    shorterWrongDirection.direction = "south";
    const artifact = createArtifact({
      patterns: [shorterWrongDirection, matchingDirection],
      shapes: {
        shape: createShape(),
        "matching-shape": [
          { lon: 2.3, lat: 48.8 },
          { lon: 2.306, lat: 48.806 },
          { lon: 2.31, lat: 48.81 },
          { lon: 2.315, lat: 48.815 },
          { lon: 2.32, lat: 48.82 },
        ],
      },
    });
    const request = createRequest(["A", "B", "C"]);
    request.branches[0].direction = "north";

    const segments = createSegmentsFromIndexedGtfs(
      request,
      compileGtfsLineArtifact(artifact),
    );

    expect(segments?.[0].coordinates).toEqual([
      { lon: 2.3, lat: 48.8 },
      { lon: 2.306, lat: 48.806 },
      { lon: 2.31, lat: 48.81 },
    ]);
  });

  it("covers every branch, deduplicates shared edges and rejects contradictory shapes", () => {
    const sharedShape = createShape();
    const branchShape = [
      ...sharedShape.slice(0, 3),
      { lon: 2.36, lat: 48.86 },
      { lon: 2.4, lat: 48.9 },
    ];
    const branchPattern = createPattern("branch", ["A", "B", "D"], "branch-shape");
    branchPattern.projections[2] = {
      ...branchPattern.projections[2],
      shapePointIndex: 3,
      segmentProgress: 1,
      coordinate: { lon: 2.4, lat: 48.9 },
    };
    const artifact = createArtifact({
      patterns: [
        createPattern("main", ["A", "B", "C"], "shape"),
        branchPattern,
      ],
      shapes: {
        shape: sharedShape,
        "branch-shape": branchShape,
      },
    });
    const request = createBranchedRequest();

    const segments = createSegmentsFromIndexedGtfs(
      request,
      compileGtfsLineArtifact(artifact),
    );
    expect(segments?.map(({ id }) => id).sort()).toEqual(["A--B", "B--C", "B--D"]);

    const contradictory = structuredClone(artifact);
    contradictory.shapes["branch-shape"][1] = { lon: 2.315, lat: 48.825 };
    contradictory.patterns[1].projections[0].errorMeters = 0;
    expect(
      createSegmentsFromIndexedGtfs(
        request,
        compileGtfsLineArtifact(contradictory),
      ),
    ).toBeUndefined();
  });
});

function createRequest(
  stopIds: string[],
  coordinates = [
    { lon: 2.3, lat: 48.8 },
    { lon: 2.31, lat: 48.81 },
    { lon: 2.32, lat: 48.82 },
  ],
): LineGeometryRequest {
  return {
    lineId: "IDFM:TEST",
    stops: stopIds.map((id, index) => ({
      id,
      label: id,
      ...coordinates[index],
    })),
    branches: [{ id: "branch", stopIds }],
  };
}

function createArtifact(
  overrides: Partial<GtfsLineArtifact> = {},
): GtfsLineArtifact {
  return {
    schemaVersion: 1,
    lineId: "IDFM:TEST",
    routeIds: ["IDFM:TEST"],
    labels: ["Test"],
    routeTypes: ["3"],
    patterns: [createPattern("main", ["A", "B", "C"], "shape")],
    shapes: { shape: createShape() },
    entrances: [],
    ...overrides,
  };
}

function createBranchedRequest(): LineGeometryRequest {
  return {
    lineId: "IDFM:TEST",
    stops: [
      { id: "A", label: "A", lon: 2.3, lat: 48.8 },
      { id: "B", label: "B", lon: 2.31, lat: 48.81 },
      { id: "C", label: "C", lon: 2.32, lat: 48.82 },
      { id: "D", label: "D", lon: 2.4, lat: 48.9 },
    ],
    branches: [
      { id: "main", stopIds: ["A", "B", "C"] },
      { id: "branch", stopIds: ["A", "B", "D"] },
    ],
  };
}

function createPattern(
  id: string,
  stopIds: string[],
  shapeId: string,
): GtfsLineArtifact["patterns"][number] {
  const coordinateByStop: Record<string, { lon: number; lat: number }> = {
    A: { lon: 2.3, lat: 48.8 },
    A2: { lon: 2.30002, lat: 48.80002 },
    B: { lon: 2.31, lat: 48.81 },
    C: { lon: 2.32, lat: 48.82 },
    D: { lon: 2.4, lat: 48.9 },
  };
  const indexByStop: Record<string, number> = { A: 0, A2: 0, B: 2, C: 3, D: 0 };

  return {
    id,
    direction: "0",
    stopIds,
    shapeId,
    shapeDirection: "forward",
    projections: stopIds.map((stopId, index) => ({
      stopId,
      shapePointIndex: indexByStop[stopId] ?? index,
      segmentProgress: stopId === "C" ? 1 : 0,
      distanceAlongMeters: index * 1_000,
      errorMeters: 2,
      coordinate: coordinateByStop[stopId],
    })),
  };
}

function createShape() {
  return [
    { lon: 2.3, lat: 48.8 },
    { lon: 2.305, lat: 48.805 },
    { lon: 2.31, lat: 48.81 },
    { lon: 2.315, lat: 48.815 },
    { lon: 2.32, lat: 48.82 },
  ];
}
