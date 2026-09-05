import { describe, expect, it } from "vitest";
import { parseNearbyAirQualityLevel, isNearbyNoiseZonesResponse } from "../src/features/nearby-stations/nearbyNoiseZones";
import {
  buildNearbyNoiseGridResponse,
  type NearbyNoiseGridResponse,
} from "../server/services/neighborhoodVerdict/noiseGrid";
import type {
  CompiledAirNoiseGrid,
  VerdictSourceMetadata,
} from "../server/services/neighborhoodVerdict/contracts";

const source: VerdictSourceMetadata = {
  id: "air-noise-grid",
  title: "Couches SIG air-bruit – 9 classes",
  producer: "Airparif et Bruitparif",
  pageUrl: "https://www.bruitparif.fr/opendata-air-bruit/",
  format: "GeoTIFF",
  coverage: "Île-de-France",
  referencePeriod: "2024",
  licence: {
    id: "open-data",
    label: "Open data",
    attribution: "Source des données : Airparif et Bruitparif",
    kind: "open",
  },
  freshness: {
    status: "fresh",
    checkedAt: "2026-09-04T00:00:00.000Z",
    ageDays: 0,
    warnAfterDays: 365,
    staleAfterDays: 730,
  },
  scorable: true,
  limitations: ["Classe SIG, pas une mesure acoustique instantanée."],
};

function createGrid(): CompiledAirNoiseGrid {
  const columns = 20;
  const rows = 20;
  const classes = Array.from({ length: columns * rows }, () => 1);
  classes[10 * columns + 10] = 3;
  classes[10 * columns + 11] = 2;
  return {
    sourceCrs: "EPSG:4326",
    bbox: [2.3, 48.8, 2.4, 48.9],
    cellSizeDegrees: 0.005,
    columns,
    rows,
    values: ["11", "22", "33"],
    classes,
  };
}

describe("compiled neighborhood noise grid", () => {
  it("decodes the official asymmetric classes as noise then air", () => {
    const grid = createGrid();
    grid.values = ["12", "23", "31"];
    const result = buildNearbyNoiseGridResponse(
      { schemaVersion: "1.1", sources: [source], airNoiseGrid: grid },
      { lon: 2.35, lat: 48.85 }, 600,
    )!;
    expect(isNearbyNoiseZonesResponse(result)).toBe(true);
    for (const cell of result.cells) {
      expect(cell.noiseLevel).toBe(Number(cell.value[0]));
    }
    expect(parseNearbyAirQualityLevel("12")).toBe(2);
    expect(parseNearbyAirQualityLevel("23")).toBe(3);
    expect(parseNearbyAirQualityLevel("31")).toBe(1);
  });
  it("clips the grid around the origin and preserves the source metadata", () => {
    const result = buildNearbyNoiseGridResponse(
      { schemaVersion: "1.1", sources: [source], airNoiseGrid: createGrid() },
      { lon: 2.35, lat: 48.85 },
      600,
    );

    expect(result).toBeDefined();
    expect(result).toEqual(expect.objectContaining<Partial<NearbyNoiseGridResponse>>({
      schemaVersion: "1.1",
      radiusMeters: 600,
      columns: 20,
      rows: 20,
      source: expect.objectContaining({
        id: "air-noise-grid",
        producer: "Airparif et Bruitparif",
        referencePeriod: "2024",
        attribution: "Source des données : Airparif et Bruitparif",
      }),
    }));
    expect(result!.cells).toEqual(expect.arrayContaining([
      expect.objectContaining({ column: 10, row: 10, value: "33", noiseLevel: 3 }),
      expect.objectContaining({ column: 11, row: 10, value: "22", noiseLevel: 2 }),
    ]));
    expect(result!.cells).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ column: 0, row: 0 }),
    ]));
    expect(result!.cells.length).toBeLessThan(createGrid().classes.length);
  });

  it("does not expose a layer when its source is not scorable", () => {
    expect(buildNearbyNoiseGridResponse(
      {
        schemaVersion: "1.1",
        sources: [{ ...source, scorable: false }],
        airNoiseGrid: createGrid(),
      },
      { lon: 2.35, lat: 48.85 },
      600,
    )).toBeUndefined();
  });
});
