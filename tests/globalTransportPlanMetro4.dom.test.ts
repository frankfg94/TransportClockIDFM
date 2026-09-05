import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GlobalMapAssetLoader,
  decodeBootstrap,
} from "../src/features/transport-map/data/assetLoader";
import { measureLineStationAngles } from "../src/features/transport-map/debug/stationAngles";

const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");

function createLocalFetcher() {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const asset = String(input).split("/global-map/v1/")[1];
    if (!asset) return new Response(null, { status: 404 });
    try {
      return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
    } catch {
      return new Response(null, { status: 404 });
    }
  };
}

describe("GlobalTransportPlan Metro 4 DOM geometry", () => {
  it("does not create a station V at Cité or Châtelet in the detailed GTFS geometry", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher() });
    const manifest = await loader.loadManifest();
    const bootstrapPayload = await loader.loadBootstrapPayload(manifest);
    const catalog = await loader.loadCatalog(manifest);
    const network = decodeBootstrap(bootstrapPayload, manifest, catalog);
    const metro4 = network.linesById.get("line:IDFM:C01374");
    expect(metro4).toMatchObject({ mode: "METRO", label: "4" });

    const stations = metro4!.stationIds.map((stationId) => network.stationsById.get(stationId)!);
    const stationBounds = {
      minX: Math.min(...stations.map((station) => station.worldX)),
      minY: Math.min(...stations.map((station) => station.worldY)),
      maxX: Math.max(...stations.map((station) => station.worldX)),
      maxY: Math.max(...stations.map((station) => station.worldY)),
    };
    const descriptors = manifest.files.chunks.filter((descriptor) =>
      descriptor.level === 11 && descriptor.modes?.includes("METRO") &&
      !(descriptor.bounds.maxX < stationBounds.minX || descriptor.bounds.minX > stationBounds.maxX ||
        descriptor.bounds.maxY < stationBounds.minY || descriptor.bounds.minY > stationBounds.maxY),
    );
    const detailedPaths = (await Promise.all(descriptors.map((descriptor) => loader.loadChunk(manifest, descriptor))))
      .flatMap((payload) => payload.paths)
      .filter((path) => path.lineId === metro4!.id);
    expect(detailedPaths.length).toBeGreaterThan(0);
    expect(detailedPaths.every((path) => path.geometrySource === "gtfs")).toBe(true);

    const stationAngles = measureLineStationAngles(metro4!, detailedPaths, network.stationsById);
    expect(
      stationAngles.filter((row) => row.inconsistent),
      "Metro 4 must not contain a long acute GTFS fold at any station",
    ).toEqual([]);
    const cite = stationAngles.find((row) => row.stationName === "Cité");
    expect(cite).toBeDefined();
    expect(cite?.inconsistent, `Cité still has a ${cite?.angleDegrees?.toFixed(1)}° V`).toBe(false);
    expect(cite?.angleDegrees).toBeGreaterThanOrEqual(35);
    const chatelet = stationAngles.find((row) => row.stationName === "Châtelet");
    expect(chatelet).toBeDefined();
    expect(chatelet?.inconsistent, `Châtelet still has a ${chatelet?.angleDegrees?.toFixed(1)}° V`).toBe(false);
    expect(chatelet?.angleDegrees).toBeGreaterThanOrEqual(150);
  });
});
