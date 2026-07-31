import { describe, expect, it } from "vitest";
import type { TrafficDisruption } from "../src/features/traffic/types";
import type {
  PatternTrafficEdge,
  PatternTrafficImpactSegment,
  PatternTrafficImpactKind,
} from "../src/features/service-pattern/trafficImpactAnalysis";
import {
  getTrafficMarkerAnchor,
  getTrafficMarkerSize,
  groupPatternTrafficMarkerSegments,
  layoutTrafficMarkers,
  rectanglesOverlap,
  shouldPreferTrafficMarkerAbove,
} from "../src/features/service-pattern/trafficMarkerLayout";

describe("traffic marker presentation", () => {
  it("merges duplicate replacement-bus segments from the same alert and contiguous section", () => {
    const first = createSegment({
      id: "alert-a:section:0",
      stationKeys: ["station-b"],
      edgeKeys: ["station-a--station-b"],
    });
    const duplicate = createSegment({
      id: "alert-a:section:1",
      stationKeys: ["station-b"],
      edgeKeys: ["station-a--station-b"],
    });
    const next = createSegment({
      id: "alert-a:section:2",
      stationKeys: ["station-c"],
      edgeKeys: ["station-b--station-c"],
    });

    const groups = groupPatternTrafficMarkerSegments({
      segments: [first, duplicate, next],
      edges: [
        createEdge("station-a", "station-b"),
        createEdge("station-b", "station-c"),
      ],
      unifyReplacementBusMarkers: true,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.segments.map((segment) => segment.id)).toEqual([
      first.id,
      duplicate.id,
      next.id,
    ]);
    expect(groups[0]?.stationKeys).toEqual(["station-b", "station-c"]);
    expect(groups[0]?.edgeKeys).toEqual([
      "station-a--station-b",
      "station-b--station-c",
    ]);
  });

  it("does not merge two different source alerts even when their text and dates match", () => {
    const first = createSegment({ id: "alert-a:section:0" });
    const second = createSegment({
      id: "alert-b:section:0",
      disruptionId: "alert-b",
    });

    const groups = groupPatternTrafficMarkerSegments({
      segments: [first, second],
      edges: [createEdge("station-a", "station-b")],
      unifyReplacementBusMarkers: true,
    });

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.representative.disruption.id)).toEqual([
      "alert-a",
      "alert-b",
    ]);
  });

  it("keeps disconnected sections as separate replacement-bus markers", () => {
    const first = createSegment({
      id: "alert-a:section:0",
      stationKeys: ["station-b"],
      edgeKeys: ["station-a--station-b"],
    });
    const disconnected = createSegment({
      id: "alert-a:section:1",
      stationKeys: ["station-y"],
      edgeKeys: ["station-x--station-y"],
    });

    const groups = groupPatternTrafficMarkerSegments({
      segments: [first, disconnected],
      edges: [
        createEdge("station-a", "station-b"),
        createEdge("station-x", "station-y"),
      ],
      unifyReplacementBusMarkers: true,
    });

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.segments)).toEqual([
      [first],
      [disconnected],
    ]);
  });

  it("keeps different impact kinds separate even when the source alert matches", () => {
    const interruption = createSegment({ id: "alert-a:section:0" });
    const disturbance = createSegment({
      id: "alert-a:section:1",
      kind: "disturbance",
    });

    const groups = groupPatternTrafficMarkerSegments({
      segments: [interruption, disturbance],
      edges: [createEdge("station-a", "station-b")],
      unifyReplacementBusMarkers: true,
    });

    expect(groups).toHaveLength(2);
  });

  it("keeps the source segments unchanged when grouping is enabled", () => {
    const segments = [
      createSegment({ id: "alert-a:section:0" }),
      createSegment({ id: "alert-a:section:1" }),
    ];
    const analysisSnapshot = structuredClone({
      segments,
      stationImpacts: { "station-b": segments[0] },
      edgeImpacts: { "station-a--station-b": segments[0] },
    });

    groupPatternTrafficMarkerSegments({
      segments,
      edges: [createEdge("station-a", "station-b")],
      unifyReplacementBusMarkers: true,
    });

    expect({
      segments,
      stationImpacts: { "station-b": segments[0] },
      edgeImpacts: { "station-a--station-b": segments[0] },
    }).toEqual(analysisSnapshot);
  });

  it("anchors on the dominant branch at its midpoint", () => {
    const anchor = getTrafficMarkerAnchor(
      {
        stationKeys: [
          "station-branch",
          "station-top-a",
          "station-top-b",
          "station-lower-a",
          "station-lower-b",
        ],
        edgeKeys: [
          "station-root--station-branch",
          "station-branch--station-top-a",
          "station-top-a--station-top-b",
          "station-root--station-lower-a",
          "station-lower-a--station-lower-b",
        ],
      },
      [
        createEdge("station-root", "station-branch"),
        createEdge("station-branch", "station-top-a"),
        createEdge("station-top-a", "station-top-b"),
        createEdge("station-root", "station-lower-a"),
        createEdge("station-lower-a", "station-lower-b"),
      ],
      new Map([
        ["station-root", { x: 0, y: 100 }],
        ["station-branch", { x: 100, y: 0 }],
        ["station-top-a", { x: 200, y: 0 }],
        ["station-top-b", { x: 300, y: 0 }],
        ["station-lower-a", { x: 100, y: 100 }],
        ["station-lower-b", { x: 200, y: 100 }],
      ]),
    );

    expect(anchor).toEqual({ x: 200, y: 0 });
    expect(anchor?.y).toBe(0);

    const placement = layoutTrafficMarkers(
      [
        {
          key: "dominant-branch",
          anchor: anchor!,
          width: 120,
          height: 64,
          preferAbove: true,
        },
      ],
      [],
    ).get("dominant-branch");
    expect(placement).toBeDefined();
    if (placement && anchor) {
      const endpointY =
        placement.placement === "above"
          ? placement.rect.y + placement.rect.height + placement.connectorHeight
          : placement.rect.y - placement.connectorHeight;
      expect(endpointY).toBe(anchor.y);
      expect(endpointY).toBe(0);
    }
  });

  it("places the lowest branch below only when the topology has multiple rows", () => {
    const oneRow = [
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ];
    const branched = [
      ...oneRow,
      { x: 100, y: 200 },
      { x: 200, y: 200 },
    ];

    expect(shouldPreferTrafficMarkerAbove({ y: 100 }, oneRow)).toBe(true);
    expect(shouldPreferTrafficMarkerAbove({ y: 100 }, branched)).toBe(true);
    expect(shouldPreferTrafficMarkerAbove({ y: 200 }, branched)).toBe(false);
  });

  it("keeps replacement-bus cards large for both traffic impact kinds", () => {
    expect(getTrafficMarkerSize("interruption", true)).toEqual({
      width: 340,
      height: 124,
    });
    expect(getTrafficMarkerSize("disturbance", true, true)).toEqual({
      width: 340,
      height: 124,
    });
    expect(getTrafficMarkerSize("disturbance", true, false)).toEqual({
      width: 120,
      height: 68,
    });
  });

  it("places replacement-bus markers above their anchor and keeps all rectangles apart", () => {
    const obstacles = [
      { x: 70, y: 118, width: 184, height: 104 },
      { x: 220, y: 22, width: 180, height: 32 },
      { x: 72, y: 238, width: 96, height: 26 },
    ];
    const requests = [
      createRequest("bus-a", 160, 160),
      createRequest("bus-b", 160, 160),
      createRequest("bus-c", 160, 160),
    ];

    const placements = layoutTrafficMarkers(requests, obstacles);
    const results = requests.map((request) => placements.get(request.key));

    expect(results[0]?.placement).toBe("above");
    expect(results[0]?.position.y).toBeLessThan(160);
    results.forEach((result) => expect(result).toBeDefined());

    results.forEach((result, index) => {
      const request = requests[index];

      expect(request).toBeDefined();
      expect(result?.connectorOffset).toBeDefined();
      if (request && result) {
        expect(
          result.rect.x + result.rect.width / 2 + result.connectorOffset,
        ).toBeCloseTo(request.anchor.x);
        expect(result.connectorLength).toBeCloseTo(
          Math.hypot(
            result.connectorOffset,
            result.placement === "above"
              ? request.anchor.y - (result.rect.y + result.rect.height)
              : request.anchor.y - result.rect.y,
          ),
        );
      }

      const connectorEndpoint =
        result?.placement === "above"
          ? result.rect.y + result.rect.height + result.connectorHeight
          : result
            ? result.rect.y - result.connectorHeight
            : Number.NaN;
      expect(connectorEndpoint).toBe(request?.anchor.y);
    });

    const allRects = [
      ...obstacles,
      ...results.flatMap((result) => (result ? [result.rect] : [])),
    ];
    allRects.forEach((left, leftIndex) => {
      allRects.slice(leftIndex + 1).forEach((right) => {
        expect(
          rectanglesOverlap(left, right, 0),
          `rectangles ${leftIndex} and ${leftIndex + 1} overlap`,
        ).toBe(false);
      });
    });
  });

  it("keeps cards centered with a strictly vertical connector", () => {
    const requests = [
      createRequest("first", 160, 160),
      createRequest("second", 160, 160),
    ];
    const placements = layoutTrafficMarkers(requests, []);
    const first = placements.get("first");
    const second = placements.get("second");

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;

    expect(second.position.x).toBe(first.position.x);
    [first, second].forEach((placement, index) => {
      const request = requests[index]!;
      expect(placement.connectorOffset).toBe(0);
      expect(Math.abs(placement.connectorAngle)).toBe(90);
      expect(placement.rect.x + placement.rect.width / 2).toBeCloseTo(
        request.anchor.x,
      );
      expect(
        placement.placement === "above"
          ? placement.rect.y + placement.rect.height + placement.connectorHeight
          : placement.rect.y - placement.connectorHeight,
      ).toBeCloseTo(request.anchor.y);
    });
  });

  it("keeps a branch tooltip above Eragny-Neuville when lower lanes contain obstacles", () => {
    const anchorY = 240;
    const placements = layoutTrafficMarkers(
      [
        {
          key: "eragny-neuville-bus",
          anchor: { x: 180, y: anchorY },
          width: 120,
          height: 64,
          preferAbove: true,
        },
      ],
      [
        { x: 100, y: 260, width: 184, height: 104 },
        { x: 120, y: 372, width: 96, height: 26 },
        { x: 10, y: 40, width: 350, height: 50 },
      ],
    );
    const placement = placements.get("eragny-neuville-bus");

    expect(placement).toBeDefined();
    if (!placement) return;

    expect(placement?.placement).toBe("above");
    expect(placement.rect.y + placement.rect.height).toBeLessThan(
      anchorY,
    );
  });
});

function createSegment({
  id,
  disruptionId = "alert-a",
  stationKeys = ["station-b"],
  edgeKeys = ["station-a--station-b"],
  kind = "interruption",
}: {
  id: string;
  disruptionId?: string;
  stationKeys?: string[];
  edgeKeys?: string[];
  kind?: PatternTrafficImpactKind;
}): PatternTrafficImpactSegment {
  const disruption: TrafficDisruption = {
    id: disruptionId,
    title: "Travaux",
    message: "Bus de remplacement\nDates : du 1er au 7 août",
    kind: "works",
    applicationPeriods: [
      { begin: "20260801T000000", end: "20260807T235900" },
    ],
    impactedLineRefs: ["line:test"],
    impactedStopNames: ["Station B"],
  };

  return {
    id,
    kind,
    disruption,
    endDateLabel: "7 août",
    replacementBus: true,
    stationKeys,
    edgeKeys,
  };
}

function createEdge(source: string, target: string): PatternTrafficEdge {
  return { source, target };
}

function createRequest(
  key: string,
  x: number,
  y: number,
): {
  key: string;
  anchor: { x: number; y: number };
  width: number;
  height: number;
  preferAbove: boolean;
} {
  return {
    key,
    anchor: { x, y },
    width: 120,
    height: 64,
    preferAbove: true,
  };
}
