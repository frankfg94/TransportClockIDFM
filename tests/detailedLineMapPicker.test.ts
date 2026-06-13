import { describe, expect, it } from "vitest";
import {
  createDetailedLineMapViewModel,
  createTransferDirectionList,
} from "../src/features/line-map/lineMapData";
import type {
  LineRouteSequence,
  LineRouteStop,
  LineSearchOption,
} from "../src/types/transit";

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
    expect(model.stops.every((stop) => stop.coordinateSource === "lambert93"))
      .toBe(true);
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

  it("keeps a deterministic fallback layout when no map coordinates exist", () => {
    const model = createDetailedLineMapViewModel(createLine(), [
      createSequence("fallback", [
        createStop("A"),
        createStop("B"),
        createStop("C"),
      ]),
    ]);

    expect(model.tiles).toEqual([]);
    expect(model.segments).toHaveLength(2);
    expect(model.stops.map((stop) => stop.coordinateSource)).toEqual([
      "fallback",
      "fallback",
      "fallback",
    ]);
    expect(model.stops.map((stop) => Number(stop.x.toFixed(2)))).toEqual([
      0.08,
      0.5,
      0.92,
    ]);
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

    const croixDeBerny = model.stops.find(
      (stop) => stop.label === "Croix de Berny",
    );

    expect(croixDeBerny?.station.id).toBe("stop_area:IDFM:463101");
    expect(croixDeBerny?.station.scheduleStopAreaRef).toBe(
      "stop_area:IDFM:463101",
    );
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

function createSequence(
  id: string,
  stops: LineRouteStop[],
): LineRouteSequence {
  return {
    id,
    label: id,
    stops,
  };
}

function createProjectedStop(
  label: string,
  projectedX: number,
  projectedY: number,
): LineRouteStop {
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
