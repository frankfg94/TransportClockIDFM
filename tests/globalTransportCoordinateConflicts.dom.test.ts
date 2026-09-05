import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeBootstrap,
  decodeRegionalPaths,
} from "../src/features/transport-map/data/assetLoader";
import type {
  GlobalMapBootstrap,
  GlobalMapCatalog,
  GlobalMapManifest,
  GlobalMapRegionalPayload,
} from "../src/features/transport-map/contracts/manifest";
import { measureLineStationAngles } from "../src/features/transport-map/debug/stationAngles";

const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");

const conflictStations = [
  {
    lineId: "line:IDFM:C01384",
    stationIds: [
      "station:FR::Quay:50026882:FR1", // Bercy
      "station:FR::Quay:50025877:FR1", // Gare de Lyon
      "station:FR::Quay:50026544:FR1", // Madeleine
    ],
  },
  {
    lineId: "line:IDFM:C01742",
    stationIds: [
      "station:FR::monomodalStopPlace:470195:FR1", // Gare de Lyon
      "station:FR::monomodalStopPlace:43114:FR1", // Conflans Fin d'Oise
    ],
  },
  {
    lineId: "line:IDFM:C01729",
    stationIds: [
      "station:FR::monomodalStopPlace:43074:FR1", // Émerainville - Pontault-Combault
    ],
  },
] as const;

describe("GTFS/NeTEx station coordinate reconciliation", () => {
  it("keeps the requested metro and RER connections out of impossible V angles", () => {
    const manifest = readJson<GlobalMapManifest>("manifest.json");
    const bootstrap = readJson<GlobalMapBootstrap>("bootstrap.json");
    const catalog = readJson<GlobalMapCatalog>("catalog.json");
    const regional = readJson<GlobalMapRegionalPayload>("regional.json");
    const network = decodeBootstrap(bootstrap, manifest, catalog);
    const paths = decodeRegionalPaths(regional, bootstrap);

    for (const target of conflictStations) {
      const line = network.linesById.get(target.lineId);
      expect(line, `missing line ${target.lineId}`).toBeDefined();
      const angles = measureLineStationAngles(line!, paths, network.stationsById);
      for (const stationId of target.stationIds) {
        const row = angles.find((angle) => angle.stationId === stationId);
        expect(row, `missing angle ${target.lineId}:${stationId}`).toBeDefined();
        expect(row?.angleDegrees, `${target.lineId}:${stationId} has no usable angle`).toBeDefined();
        expect(row?.angleDegrees, `${target.lineId}:${stationId} still forms an acute connection`).toBeGreaterThanOrEqual(120);
        expect(row?.inconsistent, `${target.lineId}:${stationId} is flagged as inconsistent`).toBe(false);
      }
    }
  });
});

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(assetRoot, file), "utf8")) as T;
}
