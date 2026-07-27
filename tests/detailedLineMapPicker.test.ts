import { describe, expect, it, vi } from "vitest";
import {
  createGeographicMapFocusPlan,
  createDetailedLineMapViewModel,
  createMapTiles,
  createTransferDirectionList,
  getMaximumMapZoom,
  loadStationTransfers,
  selectBusMapDirection,
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

  it("attaches the Palais Royal stop area to both official bus 68 quay labels", () => {
    const museum = createProjectedStop("Musée du Louvre", 651100, 6862511);
    const comedy = createProjectedStop(
      "Palais Royal - Comédie Française",
      651210,
      6862877,
    );

    museum.id = "FR::Quay:50114582:FR1";
    museum.station = {
      id: museum.id,
      label: museum.label,
      monitoringRef: "",
      scheduleStopAreaRef: museum.id,
    };
    comedy.id = "FR::Quay:50114347:FR1";
    comedy.station = {
      id: comedy.id,
      label: comedy.label,
      monitoringRef: "",
      scheduleStopAreaRef: comedy.id,
    };

    const model = createDetailedLineMapViewModel(
      {
        ...createLine(),
        family: "BUS",
        id: "line:IDFM:C01104",
        label: "68",
        navitiaId: "line:IDFM:C01104",
        ref: "line:IDFM:C01104",
      },
      [createSequence("direction", [museum, comedy])],
      [
        {
          id: "stop_area:IDFM:71297",
          label: "Palais Royal - Musée du Louvre",
          city: "Paris",
          lon: 2.336001,
          lat: 48.86253,
          monitoringRef: "STIF:StopArea:SP:71297:",
          scheduleStopAreaRef: "stop_area:IDFM:71297",
        },
      ],
    );

    expect(
      model.stops.map((stop) => [
        stop.id,
        stop.station.scheduleStopAreaRef,
      ]),
    ).toEqual([
      ["FR::Quay:50114582:FR1", "stop_area:IDFM:71297"],
      ["FR::Quay:50114347:FR1", "stop_area:IDFM:71297"],
    ]);
  });

  it("attaches official line hubs from unique label and position evidence", () => {
    const model = createDetailedLineMapViewModel(
      {
        ...createLine(),
        family: "BUS",
        id: "line:IDFM:C01104",
        label: "68",
        navitiaId: "line:IDFM:C01104",
        ref: "line:IDFM:C01104",
      },
      [
        createSequence("direction", [
          createNetexQuayStop(
            "Victor Considérant",
            "FR::Quay:50121463:FR1",
            650964,
            6859672,
          ),
          createNetexQuayStop(
            "Raspail - Edgar Quinet",
            "FR::Quay:50121508:FR1",
            650886,
            6860106,
          ),
          createNetexQuayStop(
            "Rennes - Raspail",
            "FR::Quay:50121459:FR1",
            650654,
            6861134,
          ),
          createNetexQuayStop(
            "Solférino - Bellechasse",
            "FR::Quay:50141953:FR1",
            650355,
            6862218,
          ),
          createNetexQuayStop(
            "Alésia - Maine",
            "FR::Quay:50114552:FR1",
            650668,
            6859016,
          ),
          createNetexQuayStop(
            "Alésia - Général Leclerc",
            "FR::Quay:50114399:FR1",
            650548,
            6858779,
          ),
        ]),
      ],
      [
        createCanonicalStation("stop_area:IDFM:71056", "Denfert-Rochereau", 2.332768, 48.833953),
        createCanonicalStation("stop_area:IDFM:71088", "Raspail", 2.330622, 48.838784),
        createCanonicalStation("stop_area:IDFM:73640", "Rennes", 2.328321, 48.848651),
        createCanonicalStation("stop_area:IDFM:71270", "Solférino", 2.323244, 48.858681),
        createCanonicalStation("stop_area:IDFM:71030", "Alésia", 2.326848, 48.828209),
      ],
    );

    expect(
      Object.fromEntries(
        model.stops.map((stop) => [
          stop.label,
          stop.station.scheduleStopAreaRef,
        ]),
      ),
    ).toEqual({
      "Victor Considérant": "stop_area:IDFM:71056",
      "Raspail - Edgar Quinet": "stop_area:IDFM:71088",
      "Rennes - Raspail": "stop_area:IDFM:73640",
      "Solférino - Bellechasse": "stop_area:IDFM:71270",
      "Alésia - Maine": "stop_area:IDFM:71030",
      "Alésia - Général Leclerc": "stop_area:IDFM:71030",
    });
  });

  it("refuses a position-only hub match when two official candidates are close", () => {
    const stop = createStop("Quai sans nom commun");

    stop.id = "FR::Quay:ambiguous:FR1";
    stop.lon = 2.33;
    stop.lat = 48.84;
    stop.station = {
      id: stop.id,
      label: stop.label,
      monitoringRef: "",
      scheduleStopAreaRef: stop.id,
    };

    const model = createDetailedLineMapViewModel(
      createLine(),
      [createSequence("main", [stop, createStop("Station suivante")])],
      [
        createCanonicalStation("stop_area:IDFM:A", "Pôle Alpha", 2.3304, 48.84),
        createCanonicalStation("stop_area:IDFM:B", "Pôle Bêta", 2.3308, 48.84),
      ],
    );

    expect(model.stops[0].station.scheduleStopAreaRef).toBe(
      "FR::Quay:ambiguous:FR1",
    );
  });

  it("does not attach an official stop area from a single shared name token", () => {
    const model = createDetailedLineMapViewModel(
      createLine(),
      [
        createSequence("main", [
          createProjectedStop("Maisons-Laffitte", 642000, 6872000),
          createProjectedStop("Station suivante", 642500, 6871500),
        ]),
      ],
      [
        {
          id: "stop_area:IDFM:Maisons-Alfort",
          label: "Maisons-Alfort - Alfortville",
          monitoringRef: "",
          scheduleStopAreaRef: "stop_area:IDFM:Maisons-Alfort",
        },
      ],
    );

    const maisonsLaffitte = model.stops.find(
      (stop) => stop.label === "Maisons-Laffitte",
    );

    expect(maisonsLaffitte?.station.id).toBe("station:Maisons-Laffitte");
    expect(maisonsLaffitte?.station.scheduleStopAreaRef).toBeUndefined();
  });

  it("loads map correspondences from the conservative transfer bundle", async () => {
    const fetchMock = vi.fn(async (
      _input: string | URL | Request,
      _init?: RequestInit,
    ) =>
      new Response(
        JSON.stringify({
          version: 1,
          generatedAt: "2026-07-27T12:00:00.000Z",
          lineId: "line:IDFM:C01104",
          lineLabel: "68",
          transfersByStopAreaRef: {
            "stop_area:IDFM:71297": [
              {
                id: "line:IDFM:C01371",
                label: "1",
                family: "METRO",
              },
              {
                id: "line:IDFM:C01372",
                label: "7",
                family: "METRO",
              },
            ],
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const transfers = await loadStationTransfers(
        {
          id: "stop_area:IDFM:71297",
          label: "Palais Royal - Musée du Louvre",
          city: "Paris",
          monitoringRef: "STIF:StopArea:SP:71297:",
          scheduleStopAreaRef: "stop_area:IDFM:71297",
        },
        {
          family: "BUS",
          id: "line:IDFM:C01104",
          label: "68",
          navitiaId: "line:IDFM:C01104",
          ref: "line:IDFM:C01104",
        },
      );

      expect(transfers.map((line) => line.label)).toEqual(["1", "7"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/transfer-bundles");
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
        lineId: "line:IDFM:C01104",
        nearbyDistanceMeters: 200,
        targets: [
          {
            stopAreaRef: "stop_area:IDFM:71297",
            label: "Palais Royal - Musée du Louvre",
          },
        ],
        transferResolverMode: "nearby",
      });
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("selects one coherent bus direction and exposes only genuinely different paths", () => {
    const outbound = createSequence("outbound", [
      createProjectedStop("Porte", 650000, 6860000),
      createProjectedStop("Mairie", 650300, 6859500),
      createProjectedStop("Robinson", 650500, 6859000),
    ]);
    outbound.direction = "Robinson";

    const inbound = createSequence("inbound", [
      createProjectedStop("Robinson retour", 650620, 6859000),
      createProjectedStop("Mairie retour", 650430, 6859500),
      createProjectedStop("Porte retour", 650120, 6860000),
    ]);
    inbound.direction = "Porte";

    const selection = selectBusMapDirection(
      [outbound, inbound],
      inbound.stops.at(-1)?.id,
    );

    expect(selection?.sequence.id).toBe("inbound");
    expect(selection?.options).toEqual([
      {
        id: outbound.stops.at(-1)?.id,
        label: "Robinson",
        stopCount: 3,
      },
      {
        id: inbound.stops.at(-1)?.id,
        label: "Porte",
        stopCount: 3,
      },
    ]);
  });

  it("keeps the bus direction control hidden when both directions share the same stops", () => {
    const outbound = createSequence("outbound", [
      createProjectedStop("A", 650000, 6860000),
      createProjectedStop("B", 650300, 6859500),
    ]);
    outbound.direction = "B";

    const inbound = createSequence("inbound", [
      createProjectedStop("B", 650300, 6859500),
      createProjectedStop("A", 650000, 6860000),
    ]);
    inbound.direction = "A";

    const selection = selectBusMapDirection([outbound, inbound]);

    expect(selection?.sequence.id).toBe("outbound");
    expect(selection?.options).toEqual([]);
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

function createNetexQuayStop(
  label: string,
  id: string,
  projectedX: number,
  projectedY: number,
): LineRouteStop {
  const stop = createProjectedStop(label, projectedX, projectedY);

  stop.id = id;
  stop.station = {
    id,
    label,
    monitoringRef: "",
    scheduleStopAreaRef: id,
  };

  return stop;
}

function createCanonicalStation(
  id: string,
  label: string,
  lon: number,
  lat: number,
) {
  return {
    id,
    label,
    lon,
    lat,
    monitoringRef: "",
    scheduleStopAreaRef: id,
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
