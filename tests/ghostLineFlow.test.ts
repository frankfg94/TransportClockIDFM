import { describe, expect, it } from "vitest";
import type { LineRouteSequence } from "../src/types/transit";
import {
  createTransportLineSearchOption,
  createTransportLineFlowDirections,
} from "../src/features/transport-map/overlays/ghostLineDirections";
import {
  createGhostLineFlowModel,
  type GhostLineFlowDirection,
} from "../src/features/transport-map/overlays/ghostLineFlow";
import type {
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import {
  selectDirectionByLabel,
  selectDirectionTowardStation,
} from "../src/features/nearby-stations/useNearbyStationsLineFlow";
import type { NearbyStationEntry } from "../src/features/nearby-stations/nearbyStations";

const camera = createCamera({
  centerWorldX: 0.5,
  centerWorldY: 0.5,
  zoom: 0,
  viewportWidthCssPx: 100,
  viewportHeightCssPx: 100,
});

const line: GlobalMapLine = {
  id: "line:bus:flow",
  index: 1,
  code: "42",
  label: "42",
  mode: "BUS",
  color: "#5146ff",
  textColor: "#ffffff",
  aliases: [],
  stationIds: ["a", "b", "c", "d"],
  geometryIds: [],
};

function screenWorld(x: number, y: number): { x: number; y: number } {
  return {
    x: camera.centerWorldX + (x - camera.viewportWidthCssPx / 2) / 256,
    y: camera.centerWorldY + (y - camera.viewportHeightCssPx / 2) / 256,
  };
}

function station(id: string, x: number, y: number): GlobalMapStation {
  const world = screenWorld(x, y);
  const lonLat = worldToLonLatForTest(world);
  return {
    id,
    index: Number(id.charCodeAt(0)),
    name: id.toUpperCase(),
    normalizedName: id,
    aliases: [],
    rawRefs: [id],
    lineIds: [line.id],
    ownerChunkId: "fixture",
    isHub: false,
    sourceCrs: "EPSG:2154",
    sourceX: 650000,
    sourceY: 6860000,
    lon: lonLat.lon,
    lat: lonLat.lat,
    worldX: world.x,
    worldY: world.y,
    coordinateSource: "gtfs",
    transformVersion: "lambert93-ntf-v1",
  };
}


function path(
  id: string,
  points: Array<[string | undefined, number, number]>,
  subpathStarts?: number[],
): GlobalMapPath {
  const vertices = points.map(([stationId, x, y]) => ({
    ...(stationId ? { stationId } : {}),
    ...screenWorld(x, y),
  }));
  return {
    id,
    lineId: line.id,
    geometrySource: "gtfs",
    sourceVersion: "fixture",
    quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
    stationIds: points.flatMap(([stationId]) => stationId ? [stationId] : []),
    vertices,
    ...(subpathStarts ? { subpathStarts } : {}),
    minX: Math.min(...vertices.map((vertex) => vertex.x)),
    minY: Math.min(...vertices.map((vertex) => vertex.y)),
    maxX: Math.max(...vertices.map((vertex) => vertex.x)),
    maxY: Math.max(...vertices.map((vertex) => vertex.y)),
    chunkIds: ["fixture"],
  };
}

function direction(
  id: string,
  orderedStationIds: string[],
  label = "Terminus",
  destinationCity?: string,
): GhostLineFlowDirection {
  return {
    id,
    label,
    orderedStationIds,
    destinationStationId: orderedStationIds.at(-1),
    destinationCity,
  };
}

function stationsById(entries: GlobalMapStation[]): Map<string, GlobalMapStation> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

describe("ghost line flow overlay model", () => {
  it("uses the SIRI line reference expected by next-departures requests", () => {
    expect(createTransportLineSearchOption({
      ...line,
      id: "line:IDFM:C01807",
      code: "C01807",
      label: "N66",
      mode: "NOCTILIEN",
    })?.ref).toBe("STIF:Line::C01807:");
  });

  it("keeps every full-detail vertex and never joins separated subpaths", () => {
    const stations = [
      station("a", 10, 20),
      station("b", 40, 35),
      station("c", 60, 50),
      station("d", 90, 80),
    ];
    const model = createGhostLineFlowModel({
      camera,
      line,
      stationsById: stationsById(stations),
      directions: [direction("forward", ["a", "b", "c", "d"])],
      paths: [path("full", [
        ["a", 10, 20],
        [undefined, 25, 28],
        ["b", 40, 35],
        ["c", 60, 50],
        ["d", 90, 80],
      ], [0, 3])],
    });

    expect(model.paths).toHaveLength(2);
    expect(model.paths[0]!.d.match(/L/g)).toHaveLength(2);
    expect(model.paths[1]!.d.match(/L/g)).toHaveLength(1);
    expect(model.wavePaths).toHaveLength(2);
    expect(model.termini).toEqual([
      expect.objectContaining({ directionId: "forward", x: 90, y: 80 }),
    ]);
  });

  it("reverses a stored path when GTFS direction is the opposite sequence", () => {
    const stations = [station("a", 20, 50), station("b", 80, 50)];
    const model = createGhostLineFlowModel({
      camera,
      line,
      stationsById: stationsById(stations),
      directions: [direction("forward", ["a", "b"])],
      paths: [path("reverse", [["b", 80, 50], ["a", 20, 50]])],
    });

    expect(model.wavePaths[0]?.d.startsWith("M 20.00 50.00")).toBe(true);
  });

  it("detects exits on every viewport side, including visible destinations", () => {
    const cases: Array<[string, [number, number], [number, number]]> = [
      ["top", [50, 20], [50, -20]],
      ["right", [80, 50], [130, 50]],
      ["bottom", [50, 80], [50, 130]],
      ["left", [20, 50], [-30, 50]],
    ];

    for (const [expectedSide, start, end] of cases) {
      const stations = [station("a", start[0], start[1]), station("b", end[0], end[1])];
      const model = createGhostLineFlowModel({
        camera,
        line,
        stationsById: stationsById(stations),
        directions: [direction("forward", ["a", "b"], "Destination")],
        paths: [path(expectedSide, [["a", ...start], ["b", ...end]])],
      });
      expect(model.exits[0]?.side).toBe(expectedSide);
      expect(model.termini).toHaveLength(0);
    }

    const visibleStations = [station("a", 20, 50), station("b", 80, 50)];
    const visibleDestination = createGhostLineFlowModel({
      camera,
      line,
      stationsById: stationsById(visibleStations),
      directions: [direction("forward", ["a", "b"], "Destination")],
      paths: [path("visible", [["a", 20, 50], ["b", 80, 50]])],
    });
    expect(visibleDestination.exits).toHaveLength(0);
    expect(visibleDestination.termini).toEqual([
      expect.objectContaining({ directionId: "forward", x: 80, y: 50 }),
    ]);

    const visibleDestinationWithExit = createGhostLineFlowModel({
      camera,
      line,
      stationsById: stationsById(visibleStations),
      directions: [direction("forward", ["a", "b"], "Destination")],
      paths: [path("visible-then-exit", [
        ["a", 20, 50],
        ["b", 80, 50],
        [undefined, -20, 50],
      ])],
    });
    expect(visibleDestinationWithExit.exits).toHaveLength(0);
    expect(visibleDestinationWithExit.termini).toHaveLength(1);
  });

  it("supports two opposite directions and produces reduced-motion chevrons", () => {
    const stations = [station("a", -20, 50), station("b", 120, 50)];
    const model = createGhostLineFlowModel({
      camera,
      line,
      stationsById: stationsById(stations),
      directions: [
        direction("forward", ["a", "b"], "B"),
        direction("reverse", ["b", "a"], "A"),
      ],
      paths: [
        path("forward", [["a", -20, 50], ["b", 120, 50]]),
        path("reverse", [["b", 120, 50], ["a", -20, 50]]),
      ],
    });

    expect(new Set(model.wavePaths.map((item) => item.directionId))).toEqual(new Set(["forward", "reverse"]));
    expect(new Set(model.exits.map((item) => item.side))).toEqual(new Set(["left", "right"]));
    expect(model.termini).toHaveLength(0);
    expect(model.chevrons.length).toBeGreaterThan(0);
  });

  it("limits the animated wave and exit to a selected heavy-station direction", () => {
    const stations = [station("a", -20, 50), station("b", 120, 50)];
    const model = createGhostLineFlowModel({
      camera,
      line,
      stationsById: stationsById(stations),
      focusedDirectionId: "forward",
      directions: [
        direction("forward", ["a", "b"], "B"),
        direction("reverse", ["b", "a"], "A"),
      ],
      paths: [
        path("forward", [["a", -20, 50], ["b", 120, 50]]),
        path("reverse", [["b", 120, 50], ["a", -20, 50]]),
      ],
    });

    expect(new Set(model.wavePaths.map((item) => item.directionId))).toEqual(new Set(["forward"]));
    expect(new Set(model.exits.map((item) => item.directionId))).toEqual(new Set(["forward"]));
    expect(model.focusedDirectionId).toBe("forward");
  });

  it("clips an itinerary line at the boarding station in the selected direction", () => {
    const stations = [
      station("a", -20, 50),
      station("b", 20, 50),
      station("c", 70, 50),
      station("d", 120, 50),
    ];
    const model = createGhostLineFlowModel({
      camera,
      line,
      stationsById: stationsById(stations),
      focusedDirectionId: "forward",
      focusedFromStationId: "b",
      directions: [
        direction("forward", ["a", "b", "c", "d"], "D"),
        direction("reverse", ["d", "c", "b", "a"], "A"),
      ],
      paths: [path("shared", [
        ["a", -20, 50],
        ["b", 20, 50],
        ["c", 70, 50],
        ["d", 120, 50],
      ])],
    });

    expect(model.paths).toHaveLength(1);
    expect(model.paths[0]?.d).toBe("M 20.00 50.00 L 70.00 50.00 L 120.00 50.00");
    expect(model.wavePaths[0]?.d).toBe(model.paths[0]?.d);
  });

  it("keeps both direction exits on one shared physical path", () => {
    const stations = [station("a", -20, 50), station("b", 120, 50)];
    const model = createGhostLineFlowModel({
      camera,
      line,
      stationsById: stationsById(stations),
      directions: [
        direction("forward", ["a", "b"], "B", "Ville B"),
        direction("reverse", ["b", "a"], "A", "Ville A"),
      ],
      paths: [path("shared", [["a", -20, 50], ["b", 120, 50]])],
    });

    expect(model.exits).toEqual(expect.arrayContaining([
      expect.objectContaining({ directionId: "forward", side: "right", destinationCity: "Ville B" }),
      expect.objectContaining({ directionId: "reverse", side: "left", destinationCity: "Ville A" }),
    ]));
    expect(model.termini).toHaveLength(0);
  });
});

describe("transport line flow directions", () => {
  it("prefers GTFS direction text and falls back to the terminal", () => {
    const stations = [station("a", 20, 50), station("b", 50, 50), station("c", 80, 50)];
    const stop = (id: string, label: string) => ({
      id,
      label,
      station: { id, label, monitoringRef: id },
    });
    const sequences: LineRouteSequence[] = [
      { id: "direction-a", label: "Commercial 42", direction: "Direction GTFS", stops: [stop("a", "A"), stop("b", "B"), { ...stop("c", "C"), city: "Ville C" }] },
      { id: "direction-b", label: "Commercial 42", stops: [stop("c", "C"), stop("b", "B"), stop("a", "A")] },
    ];

    const directions = createTransportLineFlowDirections(line, sequences, stations);

    expect(directions.map((item) => item.flow.label)).toEqual(["Direction GTFS", "A"]);
    expect(directions[0]?.flow.orderedStationIds).toEqual(["a", "b", "c"]);
    expect(directions[1]?.flow.orderedStationIds).toEqual(["c", "b", "a"]);
    expect(directions[0]?.flow.destinationCity).toBe("Ville C");
  });

  it("selects only the direction that leads to a clicked projected station", () => {
    const local = station("a", 20, 50);
    const target = station("b", 120, 50);
    const localEntry = {
      id: local.id,
      station: { ...local, memberStationIds: [local.id] },
      memberStations: [local],
      lines: [line],
      distanceMeters: 120,
      lineDistanceMeters: { [line.id]: 120 },
      lineInsideRadius: { [line.id]: true },
      insideRadius: true,
    } satisfies NearbyStationEntry;
    const directions = [
      {
        flow: { id: "forward", label: "B", orderedStationIds: [local.id, target.id] },
        selection: {} as never,
      },
      {
        flow: { id: "reverse", label: "A", orderedStationIds: [target.id, local.id] },
        selection: {} as never,
      },
    ];

    expect(selectDirectionTowardStation(line, target.id, directions, [localEntry])).toBe("forward");
  });

  it("matches an itinerary direction when the provider adds the city", () => {
    const directions = [
      {
        flow: { id: "viroflay", label: "Viroflay - Rive Droite", orderedStationIds: ["a", "b"] },
        selection: {} as never,
      },
      {
        flow: { id: "chatillon", label: "Châtillon - Montrouge", orderedStationIds: ["b", "a"] },
        selection: {} as never,
      },
    ];

    expect(selectDirectionByLabel(
      directions,
      "Viroflay - Rive Droite (Viroflay)",
    )).toBe("viroflay");
  });
});

function worldToLonLatForTest(world: { x: number; y: number }): { lon: number; lat: number } {
  return {
    lon: world.x * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * world.y))) * 180) / Math.PI,
  };
}
