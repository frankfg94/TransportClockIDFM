import { describe, expect, it } from "vitest";
import type { TrafficDisruption } from "../src/features/traffic/types";
import type {
  GlobalMapPath,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import {
  analyzeActiveTransportMapTraffic,
  findTrafficPathSpan,
} from "../src/features/transport-map/state/transportMapTrafficAnalysis";

describe("selected Transilien P traffic analysis", () => {
  const stationNames = new Map([
    ["paris-est", "Paris Est"],
    ["noisy", "Noisy-le-Sec"],
    ["tournan", "Tournan"],
    ["provins", "Provins"],
    ["coulommiers", "Coulommiers"],
  ]);
  const stationsById = new Map(
    [...stationNames].map(([id, name], index) => [id, station(id, name, index)]),
  );
  const provinsPath = path("path:p:provins", [
    anchor("paris-est", 0),
    vertex(1),
    anchor("noisy", 2),
    vertex(3),
    anchor("tournan", 4),
    vertex(5),
    anchor("provins", 6),
  ]);
  const coulommiersPath = path("path:p:coulommiers", [
    anchor("paris-est", 0),
    vertex(1),
    anchor("noisy", 2),
    vertex(3),
    anchor("coulommiers", 4),
  ]);
  const disruptions = [
    disruption("p-interruption", "Trafic interrompu entre Noisy-le-Sec et Provins"),
    disruption("p-disturbance", "Trafic perturbé entre Paris Est et Noisy-le-Sec"),
  ];

  it("uses ordered path anchors for branched station and edge impacts", () => {
    const result = analyzeActiveTransportMapTraffic(
      disruptions,
      [provinsPath, coulommiersPath],
      stationsById,
    );

    expect(result.interruptedStationIds).toEqual(expect.arrayContaining(["tournan", "provins"]));
    expect(result.disturbedStationIds).toEqual(expect.arrayContaining(["paris-est", "noisy"]));
    expect(result.pathSpans).toEqual(
      expect.arrayContaining([
        {
          pathId: provinsPath.id,
          startVertexIndex: 0,
          endVertexIndex: 2,
          kind: "disturbance",
          disruptionId: "p-disturbance",
        },
        {
          pathId: provinsPath.id,
          startVertexIndex: 2,
          endVertexIndex: 6,
          kind: "interruption",
          disruptionId: "p-interruption",
        },
        {
          pathId: coulommiersPath.id,
          startVertexIndex: 0,
          endVertexIndex: 2,
          kind: "disturbance",
          disruptionId: "p-disturbance",
        },
      ]),
    );
  });

  it("does not project an impact onto a branch absent from the displayed direction", () => {
    const result = analyzeActiveTransportMapTraffic(disruptions, [coulommiersPath], stationsById);

    expect(result.pathSpans.some((span) => span.disruptionId === "p-interruption")).toBe(false);
    expect(result.interruptedStationIds).toEqual([]);
    expect(findTrafficPathSpan(result.pathSpans, coulommiersPath.id, 1)?.disruptionId).toBe(
      "p-disturbance",
    );
    expect(findTrafficPathSpan(result.pathSpans, coulommiersPath.id, 3)).toBeUndefined();
  });

  it("reconnects clipped fragments before projecting an interrupted trunk", () => {
    const clippedFirst = path("path:p:trunk:segment:2#chunk-a", [
      vertex(0),
      anchor("paris-est", 1),
      vertex(2),
      anchor("noisy", 3),
      vertex(4),
    ]);
    const clippedSecond = path("path:p:trunk:segment:2#chunk-b", [
      vertex(4),
      anchor("tournan", 1),
      vertex(2),
      anchor("provins", 3),
    ]);
    const result = analyzeActiveTransportMapTraffic(
      [disruption("p-clipped-interruption", "Trafic interrompu entre Paris Est et Provins")],
      [clippedFirst, clippedSecond],
      stationsById,
    );

    expect(result.interruptedStationIds).toEqual(expect.arrayContaining(["noisy", "tournan"]));
    expect(result.pathSpans).toEqual(
      expect.arrayContaining([
        {
          pathId: clippedFirst.id,
          startVertexIndex: 1,
          endVertexIndex: 4,
          kind: "interruption",
          disruptionId: "p-clipped-interruption",
        },
        {
          pathId: clippedSecond.id,
          startVertexIndex: 0,
          endVertexIndex: 3,
          kind: "interruption",
          disruptionId: "p-clipped-interruption",
        },
      ]),
    );
  });

  it("keeps interrupted and disturbed nodes stable when the rendered line is zoom-clipped", () => {
    const fullTopology = [provinsPath, coulommiersPath];
    const zoomedPath = path("path:p:provins:zoomed#chunk", [
      vertex(1.5),
      anchor("noisy", 2),
      vertex(3),
      anchor("tournan", 4),
      vertex(4.5),
    ]);

    const wide = analyzeActiveTransportMapTraffic(
      disruptions,
      fullTopology,
      stationsById,
      fullTopology,
    );
    const zoomed = analyzeActiveTransportMapTraffic(
      disruptions,
      [zoomedPath],
      stationsById,
      fullTopology,
    );

    expect(zoomed.interruptedStationIds).toEqual(wide.interruptedStationIds);
    expect(zoomed.disturbedStationIds).toEqual(wide.disturbedStationIds);
    expect(zoomed.pathSpans).toEqual(
      expect.arrayContaining([
        {
          pathId: zoomedPath.id,
          startVertexIndex: 0,
          endVertexIndex: 1,
          kind: "disturbance",
          disruptionId: "p-disturbance",
        },
        {
          pathId: zoomedPath.id,
          startVertexIndex: 1,
          endVertexIndex: 4,
          kind: "interruption",
          disruptionId: "p-interruption",
        },
      ]),
    );
    expect(findTrafficPathSpan(zoomed.pathSpans, zoomedPath.id, 0)?.kind).toBe("disturbance");
    expect(findTrafficPathSpan(zoomed.pathSpans, zoomedPath.id, 2)?.kind).toBe("interruption");
  });

  it.each([
    ["interruption", "Trafic interrompu entre Noisy-le-Sec et Tournan", "interruption"],
    ["disturbance", "Trafic perturb\u00e9 entre Noisy-le-Sec et Tournan", "disturbance"],
  ] as const)(
    "projects a %s through unanchored tile fragments",
    (_label, title, kind) => {
      const topology = path("path:p:topology", [
        anchor("paris-est", 0),
        vertex(1),
        anchor("noisy", 2),
        vertex(3),
        anchor("tournan", 4),
      ]);
      const renderBefore = path("path:p:segment:topology#chunk-a", [
        anchor("paris-est", 0),
        vertex(1),
        anchor("noisy", 2),
        vertex(2.5),
      ]);
      const renderMiddle = path("path:p:segment:topology#chunk-b", [
        vertex(2.5),
        vertex(3.5),
      ]);
      const renderAfter = path("path:p:segment:topology#chunk-c", [
        vertex(3.5),
        anchor("tournan", 4),
      ]);
      const result = analyzeActiveTransportMapTraffic(
        [disruption(`p-${kind}`, title)],
        [renderBefore, renderMiddle, renderAfter],
        stationsById,
        [topology],
      );

      expect(result.pathSpans).toEqual(
        expect.arrayContaining([
          {
            pathId: renderBefore.id,
            startVertexIndex: 2,
            endVertexIndex: 3,
            kind,
            disruptionId: `p-${kind}`,
          },
          {
            pathId: renderMiddle.id,
            startVertexIndex: 0,
            endVertexIndex: 1,
            kind,
            disruptionId: `p-${kind}`,
          },
          {
            pathId: renderAfter.id,
            startVertexIndex: 0,
            endVertexIndex: 1,
            kind,
            disruptionId: `p-${kind}`,
          },
        ]),
      );
    },
  );
});

function path(id: string, vertices: GlobalMapPath["vertices"]): GlobalMapPath {
  return {
    id,
    lineId: "line:IDFM:C01730",
    geometrySource: "gtfs",
    sourceVersion: "fixture-p",
    quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
    stationIds: vertices.flatMap((item) => (item.stationId ? [item.stationId] : [])),
    vertices,
    minX: 0,
    minY: 0,
    maxX: 6,
    maxY: 0,
    chunkIds: ["chunk:p"],
  };
}

function anchor(stationId: string, x: number): GlobalMapPath["vertices"][number] {
  return { stationId, x, y: 0 };
}

function vertex(x: number): GlobalMapPath["vertices"][number] {
  return { x, y: 0 };
}

function station(id: string, name: string, index: number): GlobalMapStation {
  return {
    id,
    index,
    name,
    normalizedName: name.toLowerCase(),
    aliases: [],
    rawRefs: [],
    lineIds: ["line:IDFM:C01730"],
    ownerChunkId: "chunk:p",
    isHub: false,
    sourceCrs: "EPSG:2154",
    sourceX: index,
    sourceY: 0,
    lon: 2.35,
    lat: 48.85,
    worldX: index,
    worldY: 0,
    coordinateSource: "netex",
    transformVersion: "lambert93-ntf-v1",
  };
}

function disruption(id: string, title: string): TrafficDisruption {
  return {
    id,
    title,
    kind: "incident",
    applicationPeriods: [],
    impactedLineRefs: ["line:IDFM:C01730"],
    impactedStopNames: [],
  };
}
