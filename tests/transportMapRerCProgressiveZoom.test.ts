import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GlobalMapAssetLoader } from "../src/features/transport-map/data/assetLoader";
import { TransportMapDataSource } from "../src/features/transport-map/data/createTransportMapDataSource";
import { GLOBAL_MAP_MODE_ORDER } from "../src/features/transport-map/contracts/manifest";
import { createCamera } from "../src/features/transport-map/geo/camera";

const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");
const rerCId = "line:IDFM:C01727";

describe("RER C progressive detail loading", () => {
  it("keeps a selected line connected when a branch only has NeTEx fallback geometry", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher() });
    const source = new TransportMapDataSource({ loader, maxChunkConcurrency: 2 });
    await source.initialize();
    const network = await source.ensureCatalog();
    const saintMichel = network.stations.find(
      (station) => station.name === "Saint-Michel Notre-Dame" && station.lineIds.includes(rerCId),
    );

    expect(saintMichel).toBeDefined();

    const camera = createCamera({
      centerWorldX: saintMichel!.worldX,
      centerWorldY: saintMichel!.worldY,
      zoom: 13.2,
      viewportWidthCssPx: 1_265,
      viewportHeightCssPx: 625,
    });
    const result = await source.queryViewport(
      camera,
      (1 << GLOBAL_MAP_MODE_ORDER.length) - 1,
      1,
      rerCId,
    );

    expect(result.stations.some((station) => station.id === saintMichel!.id)).toBe(true);
    expect(result.paths.some((path) => path.lineId === rerCId)).toBe(true);
  }, 15_000);
});

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
