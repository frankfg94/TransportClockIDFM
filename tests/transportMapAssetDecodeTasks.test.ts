import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { GlobalMapBootstrap, GlobalMapCatalog, GlobalMapManifest, GlobalMapRegionalPayload } from "../src/features/transport-map/contracts/manifest";
import { decodeBootstrap, decodeRegionalPaths } from "../src/features/transport-map/data/assetLoader";
import { assetResultParts, decodeCatalogAsset, decodeRegionalAsset } from "../src/features/transport-map/workers/assetDecodeTasks";
import { buildStationSpatialIndex, PackedSpatialIndex } from "../src/features/transport-map/spatial/packedIndex";
import { createWorkerRequest, type TransportMapWorkerResponse } from "../src/features/transport-map/workers/protocol";

const root = resolve(process.cwd(), "public/data/global-map/v1");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8")) as GlobalMapManifest;
const bootstrap = JSON.parse(readFileSync(resolve(root, "bootstrap.json"), "utf8")) as GlobalMapBootstrap;

describe("bounded Worker asset decoding", () => {
  it("preserves catalogue relationships, colors and spatial lookup exactly", () => {
    const catalog = { schemaVersion: manifest.schemaVersion, dataVersion: manifest.dataVersion, encoding: "rows-v1",
      stations: bootstrap.stations.slice(0, 20), entrances: [],
    } satisfies GlobalMapCatalog;
    const decoded = decodeCatalogAsset({ raw: JSON.stringify(catalog), bootstrap, manifest });
    const reference = decodeBootstrap({ ...bootstrap, paths: [] }, manifest, catalog);
    expect(decoded.network).toEqual(reference);
    const index = PackedSpatialIndex.fromTransferred(structuredClone(decoded.stationIndex));
    expect(index.query(manifest.bounds)).toEqual(buildStationSpatialIndex(reference.stations).query(manifest.bounds));
    expect(index.size).toBe(reference.stations.length);
  });

  it("rejects incompatible assets before any collection is returned", () => {
    expect(() => decodeCatalogAsset({ raw: JSON.stringify({ dataVersion: "wrong" }), bootstrap, manifest })).toThrow(/version mismatch/);
    expect(() => decodeRegionalAsset({ raw: JSON.stringify({ dataVersion: "wrong" }), bootstrap, manifest })).toThrow(/version mismatch/);
  });

  it("retains every regional vertex, station anchor, subpath and quality field", () => {
    const payload = JSON.parse(readFileSync(resolve(root, manifest.files.regional!.asset), "utf8")) as GlobalMapRegionalPayload;
    const subset = { ...payload, paths: payload.paths.slice(0, 3) } as GlobalMapRegionalPayload;
    expect(decodeRegionalAsset({ raw: JSON.stringify(subset), bootstrap, manifest })).toEqual(decodeRegionalPaths(subset, bootstrap));
  });

  it("bounds record batches and preserves original order without dropping records", () => {
    const records = Array.from({ length: 1025 }, (_, id) => ({ id }));
    const parts = [...assetResultParts("stations", records)];
    expect(parts.every(part => part.items.length <= 256)).toBe(true);
    expect(parts.flatMap(part => part.items)).toEqual(records);
    expect([...assetResultParts("stations", [])]).toEqual([]);
  });

  it("bounds path batches by vertices as well as record count, keeping long paths intact", () => {
    const records = [2000, 2000, 2000, 5000, 100].map((count, id) => ({ id, vertices: Array(count).fill([0, 0]) }));
    const parts = [...assetResultParts("paths", records)];
    expect(parts.map(part => part.items.length)).toEqual([2, 1, 1, 1]);
    expect(parts.flatMap(part => part.items)).toEqual(records);
  });

  it("rejects malformed transferable spatial arrays", () => {
    const index = new PackedSpatialIndex([{ id: "a", minX: 0, minY: 0, maxX: 1, maxY: 1, index: 0 }]);
    expect(() => PackedSpatialIndex.fromTransferred({ ...index, minX: new Float64Array() })).toThrow(/Invalid transferred/);
  });

  it("counts the detailed LOD arrays when bounding clone batches", () => {
    const records = Array.from({ length: 3 }, (_, id) => ({ id, vertices: [[0, 0]], lodVertices: { "1": Array(2000).fill([0, 0]) } }));
    expect([...assetResultParts("paths", records)].map(part => part.items.length)).toEqual([2, 1]);
  });

  it("streams the real worker's chunk response without changing its header or geometry", async () => {
    const messages: TransportMapWorkerResponse[] = [];
    const scope = { onmessage: undefined as ((event: MessageEvent) => void) | undefined,
      postMessage: (response: TransportMapWorkerResponse) => { messages.push(structuredClone(response)); },
    };
    vi.stubGlobal("self", scope);
    try {
      await import("../src/features/transport-map/workers/transportMap.worker");
      const raw = readFileSync(resolve(root, manifest.files.chunks[0]!.asset), "utf8");
      const request = createWorkerRequest("decode-chunk", { raw }, 12);
      scope.onmessage!({ data: request } as MessageEvent);
      const paths: unknown[] = [];
      while (messages.at(-1)?.part) {
        const part = messages.at(-1)!.part!;
        paths.push(...part.items);
        expect(part.items.length).toBeLessThanOrEqual(256);
        scope.onmessage!({ data: { schemaVersion: 1, requestId: request.requestId, continue: true } } as MessageEvent);
      }
      const last = messages.at(-1)!;
      expect(last.ok).toBe(true);
      expect({ ...(last.result as object), paths }).toEqual(JSON.parse(raw));
      expect(messages.every(message => message.requestId === request.requestId && message.generation === 12)).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
});
