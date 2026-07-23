import { describe, expect, it } from "vitest";
import {
  createGeographicMapFocusPlan,
  createDetailedLineMapViewModel,
  createMapTiles,
  createTransferDirectionList,
  getMaximumMapZoom,
} from "../src/features/line-map/lineMapData";
import type { LineRouteSequence, LineRouteStop, LineSearchOption } from "../src/types/transit";

describe("detailed station picker line map model", () => {
  it("creates a map with background tiles from projected NeTEx coordinates", () => {
    const chatelet = createProjectedStop("Chatelet", 652146, 6862288);

    chatelet.quays = [
      {
        id: "quay:1",
        name: "Quai 1",
        projectedX: 652150,
        projectedY: 6862292,
        srsName: "EPSG:2154",
      },
    ];
    const model = createDetailedLineMapViewModel(createLine(), [
      createSequence("main", [
        chatelet,
        createProjectedStop("Republique", 653275, 6863211),
        createProjectedStop("Belleville", 654283, 6863727),
      ]),
    ]);

    expect(model.stops).toHaveLength(3);
    expect(model.segments).toHaveLength(2);
    expect(model.tiles.length).toBeGreaterThan(0);
    expect(model.stops.every((stop) => stop.coordinateSource === "lambert93")).toBe(true);
    expect(model.stops.every((stop) => Number.isFinite(stop.lon))).toBe(true);
    expect(model.stops.every((stop) => Number.isFinite(stop.lat))).toBe(true);
    expect(model.viewport).toBeDefined();
    expect(model.stops[0].quays?.[0]).toMatchObject({ id: "quay:1" });
    expect(model.stops[0].quays?.[0].lon).toBeTypeOf("number");
    expect(model.stops[0].quays?.[0].lat).toBeTypeOf("number");

    const xs = model.stops.map((stop) => stop.x);
    const ys = model.stops.map((stop) => stop.y);

    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.42);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.25);
    expect(model.stops[0].x).toBeLessThan(model.stops[2].x);
  });

  it("loads more detailed raster tiles only for the visible window while zooming", () => {
    const model = createDetailedLineMapViewModel(createLine(), [
      createSequence("main", [
        createProjectedStop("Chatelet", 652146, 6862288),
        createProjectedStop("Republique", 653275, 6863211),
        createProjectedStop("Belleville", 654283, 6863727),
      ]),
    ]);
    const baseZoom = Number(model.tiles[0].id.split("/")[0]);
    const detailedFullMap = createMapTiles(model.viewport, { mapScale: 8 });
    const detailedVisibleWindow = createMapTiles(model.viewport, {
      mapScale: 8,
      visibleWindow: {
        minX: 0.42,
        maxX: 0.58,
        minY: 0.35,
        maxY: 0.65,
      },
    });
    const detailedZoom = Number(detailedVisibleWindow[0].id.split("/")[0]);

    expect(detailedZoom).toBeGreaterThan(baseZoom);
    expect(detailedVisibleWindow.length).toBeLessThan(detailedFullMap.length);
    expect(detailedVisibleWindow.every((tile) => tile.url.includes(`/${detailedZoom}/`))).toBe(
      true,
    );

    const firstRowY = detailedFullMap[0].id.split("/")[2];
    const firstRow = detailedFullMap
      .filter((tile) => tile.id.split("/")[2] === firstRowY)
      .sort((left, right) => left.x - right.x);
    expect(firstRow.length).toBeGreaterThan(1);
    const overlap = firstRow[0].x + firstRow[0].width - firstRow[1].x;
    expect(overlap).toBeGreaterThan(0);
    expect(overlap).toBeLessThan(0.2);
  });

  it("keeps raster requests inside their budgets and uses Retina URLs without extra tiles", () => {
    const viewport = {
      minX: 0.5001,
      maxX: 0.5026,
      minY: 0.343,
      maxY: 0.34431,
    };
    const visibleWindow = { minX: 0.38, maxX: 0.62, minY: 0.3, maxY: 0.7 };
    const initialTiles = createMapTiles(viewport, { mapScale: 1, maxTiles: 64 });
    const standardTiles = createMapTiles(viewport, {
      mapScale: 64,
      pixelRatio: 1,
      visibleWindow,
      maxTiles: 96,
    });
    const retinaTiles = createMapTiles(viewport, {
      mapScale: 64,
      pixelRatio: 2,
      visibleWindow,
      maxTiles: 96,
    });

    expect(initialTiles.length).toBeLessThanOrEqual(64);
    expect(standardTiles.length).toBeLessThanOrEqual(96);
    expect(retinaTiles.map((tile) => tile.id)).toEqual(standardTiles.map((tile) => tile.id));
    expect(standardTiles.every((tile) => !tile.url.includes("@2x"))).toBe(true);
    expect(retinaTiles.every((tile) => tile.url.endsWith("@2x.png"))).toBe(true);
    expect(new Set(standardTiles.map((tile) => tile.id)).size).toBe(standardTiles.length);
    expect(standardTiles.some((tile) => tile.priority === "visible")).toBe(true);
    expect(standardTiles.some((tile) => tile.priority === "overscan")).toBe(true);

    const adjacentRow = [...new Set(standardTiles.map((tile) => tile.id.split("/")[2]))]
      .map((rowId) =>
        standardTiles
          .filter((tile) => tile.id.split("/")[2] === rowId)
          .sort((left, right) => left.x - right.x),
      )
      .find((tiles) => tiles.length > 1);
    expect(adjacentRow).toBeDefined();
    const overlap = adjacentRow![0].x + adjacentRow![0].width - adjacentRow![1].x;
    expect(overlap * 64).toBeCloseTo(1, 4);
  });

  it("builds deterministic 250 m and 1 km camera plans and rejects aberrant exits", () => {
    const model = createDetailedLineMapViewModel(createLine(), [
      createSequence("main", [
        createProjectedStop("Chatelet", 652146, 6862288),
        createProjectedStop("Republique", 653275, 6863211),
      ]),
    ]);
    const center = { lon: model.stops[0].lon!, lat: model.stops[0].lat! };
    const nearbyEntrance = { lon: center.lon + 0.001, lat: center.lat + 0.0004 };
    const aberrantEntrance = { lon: center.lon + 1, lat: center.lat + 1 };
    const common = {
      canvasWidth: 900,
      canvasHeight: 600,
      maximumZoom: 192,
    };
    const overview = createGeographicMapFocusPlan(model.viewport!, {
      ...common,
      center,
      coordinates: [nearbyEntrance, aberrantEntrance],
      radiusMeters: 1_000,
      maximumCoordinateDistanceMeters: 1_000,
    });
    const overviewWithoutOutlier = createGeographicMapFocusPlan(model.viewport!, {
      ...common,
      center,
      coordinates: [nearbyEntrance],
      radiusMeters: 1_000,
      maximumCoordinateDistanceMeters: 1_000,
    });
    const exactEntrance = createGeographicMapFocusPlan(model.viewport!, {
      ...common,
      center: nearbyEntrance,
      radiusMeters: 250,
    });

    expect(overview).toMatchObject({ includedCoordinateCount: 1, rejectedCoordinateCount: 1 });
    expect(overview?.zoom).toBeCloseTo(overviewWithoutOutlier!.zoom, 8);
    expect(exactEntrance!.zoom).toBeGreaterThan(overview!.zoom);
    expect(exactEntrance!.zoom).toBeLessThanOrEqual(192);
  });
  it("allows street-level zoom on regional maps without changing compact-line defaults", () => {
    expect(getMaximumMapZoom({ minX: 0.4, maxX: 0.40025, minY: 0.4, maxY: 0.4002 })).toBe(20);
    expect(getMaximumMapZoom({ minX: 0.4, maxX: 0.4016, minY: 0.4, maxY: 0.401 })).toBe(80);
    expect(getMaximumMapZoom({ minX: 0.4, maxX: 0.41, minY: 0.4, maxY: 0.405 })).toBe(192);
  });
  it("keeps a deterministic fallback layout when no map coordinates exist", () => {
    const model = createDetailedLineMapViewModel(createLine(), [
      createSequence("fallback", [createStop("A"), createStop("B"), createStop("C")]),
    ]);

    expect(model.tiles).toEqual([]);
    expect(model.segments).toHaveLength(2);
    expect(model.stops.map((stop) => stop.coordinateSource)).toEqual([
      "fallback",
      "fallback",
      "fallback",
    ]);
    expect(model.stops.map((stop) => Number(stop.x.toFixed(2)))).toEqual([0.08, 0.5, 0.92]);
    expect(new Set(model.stops.map((stop) => stop.y))).toEqual(new Set([0.5]));
  });

  it("attaches canonical stop areas for transfer hydration", () => {
    const model = createDetailedLineMapViewModel(
      createLine(),
      [
        createSequence("main", [
          createProjectedStop("Croix de Berny", 649512, 6851436),
          createProjectedStop("La Vallée", 649100, 6851100),
        ]),
      ],
      [
        {
          id: "stop_area:IDFM:463101",
          label: "La Croix de Berny",
          city: "Antony",
          lon: 2.304,
          lat: 48.762,
          monitoringRef: "STIF:StopArea:SP:463101:",
          scheduleStopAreaRef: "stop_area:IDFM:463101",
        },
      ],
    );

    const croixDeBerny = model.stops.find((stop) => stop.label === "Croix de Berny");

    expect(croixDeBerny?.station.id).toBe("stop_area:IDFM:463101");
    expect(croixDeBerny?.station.scheduleStopAreaRef).toBe("stop_area:IDFM:463101");
  });

  it("dedupes bus directions by removing transport-only qualifiers", () => {
    expect(
      createTransferDirectionList([
        "Châtillon - Montrouge",
        "Châtillon - Montrouge - Métro",
        "Place de Clichy",
        "Porte d'Orléans",
      ]),
    ).toEqual(["Châtillon - Montrouge", "Place de Clichy", "Porte d'Orléans"]);

    expect(
      createTransferDirectionList([
        "Meudon Val Fleury",
        "Meudon-Val Fleury RER",
        "Porte de Vanves",
        "Portes de Vanves",
      ]),
    ).toEqual(["Meudon Val Fleury", "Porte de Vanves"]);

    expect(
      createTransferDirectionList([
        "Gare Montparnasse",
        "Dreux - Gare Montparnasse",
        "Dreux",
        "Gare Montparnasse - Dreux",
        "Plaisir - Grignon",
        "Gare Montparnasse - Plaisir - Grignon",
      ]),
    ).toEqual(["Gare Montparnasse", "Dreux", "Plaisir - Grignon"]);
  });
});

function createLine(): LineSearchOption {
  return {
    family: "METRO",
    id: "line:fake",
    label: "11",
    navitiaId: "line:fake",
    ref: "line:fake",
    color: "#6e4f00",
    textColor: "#ffffff",
  };
}

function createSequence(id: string, stops: LineRouteStop[]): LineRouteSequence {
  return {
    id,
    label: id,
    stops,
  };
}

function createProjectedStop(label: string, projectedX: number, projectedY: number): LineRouteStop {
  return {
    ...createStop(label),
    projectedX,
    projectedY,
  };
}

function createStop(label: string): LineRouteStop {
  return {
    id: `station:${label}`,
    label,
    station: {
      id: `station:${label}`,
      label,
      monitoringRef: `station:${label}`,
    },
  };
}
