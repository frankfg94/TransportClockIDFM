import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GlobalMapAssetLoader, decodeBootstrap } from "../src/features/transport-map/data/assetLoader";
import { decodeCatalogAsset } from "../src/features/transport-map/workers/assetDecodeTasks";

const root = resolve(process.cwd(), "public/data/global-map/v1");
const fetcher = async (input: RequestInfo | URL) => {
  const asset = String(input).split("/global-map/v1/")[1];
  try { return new Response(readFileSync(resolve(root, asset!))); }
  catch { return new Response(null, { status: 404 }); }
};

describe("TER commercial route sidecar", () => {
  it("loads the real dated pack and retains the matches after catalogue decoding", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher });
    const manifest = await loader.loadManifest();
    const commercial = await loader.loadCommercialLines(manifest);
    const bootstrap = await loader.loadBootstrapPayload(manifest);
    expect(commercial?.entries).toHaveLength(10);
    const bytes = readFileSync(resolve(root, manifest.files.commercialLines!.asset));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifest.files.commercialLines!.checksum);
    const initial = decodeBootstrap(bootstrap, manifest, undefined, undefined, commercial);
    const k4 = initial.linesById.get("line:IDFM:C02370")!;
    expect(k4.code).toBe("C02370");
    expect(k4.commercialNetworkLabel).toBe("TER Normandie");
    expect(k4.commercialRoutes?.map((route) => route.code)).toEqual(["K4"]);
    expect(initial.linesById.get("line:IDFM:C02368")?.commercialRoutes?.[0]?.code).toBe("K2+");
    expect(initial.linesById.get("line:IDFM:C01738")?.commercialRoutes).toBeUndefined();
    const catalog = { schemaVersion: 1, dataVersion: manifest.dataVersion, encoding: "rows-v1", stations: [], entrances: [] };
    const decoded = decodeCatalogAsset({ raw: JSON.stringify(catalog), bootstrap, manifest, commercialLines: commercial });
    expect(decoded.network.linesById.get(k4.id)?.commercialRoutes).toEqual(k4.commercialRoutes);
    expect(decodeBootstrap(bootstrap, manifest).linesById.get(k4.id)?.commercialRoutes).toBeUndefined();
  });

  it("rejects a sidecar compiled for a different pack", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher });
    const manifest = await loader.loadManifest();
    await expect(loader.loadCommercialLines({ ...manifest, dataVersion: "other" })).rejects.toThrow(/version mismatch/);
    const legacy = { ...manifest, files: { ...manifest.files, commercialLines: undefined } };
    await expect(loader.loadCommercialLines(legacy)).resolves.toBeUndefined();
  });
});
