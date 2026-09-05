import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GLOBAL_MAP_MODE_ORDER } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapViewportResult } from "../src/features/transport-map/contracts/network";
import { GlobalMapAssetLoader } from "../src/features/transport-map/data/assetLoader";
import { TransportMapDataSource } from "../src/features/transport-map/data/createTransportMapDataSource";
import {
  createCamera,
  fitCameraToBounds,
  type CameraState,
} from "../src/features/transport-map/geo/camera";

const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");
const visibleModes = (1 << GLOBAL_MAP_MODE_ORDER.length) - 1;
const references = new Map<
  string,
  {
    lineId: string;
    camera: CameraState;
    result: TransportMapViewportResult;
  }
>();

function createSource() {
  const loader = new GlobalMapAssetLoader({
    fetcher: async (input) => {
      const asset = String(input).split("/global-map/v1/")[1];
      if (!asset) return new Response(null, { status: 404 });
      return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
    },
  });
  const source = new TransportMapDataSource({
    loader,
    maxChunkConcurrency: 1,
    // A whole RER does not fit in the decoded cache. Switching lines must
    // remain safe when some chunks need loading again.
    decodedChunkCacheMaxEntries: 4,
  });
  return { source, loader };
}

function ids(items: readonly { id: string }[]): string[] {
  return items.map((item) => item.id).sort();
}

beforeAll(async () => {
  const { source } = createSource();
  try {
    await source.initialize();
    const network = await source.ensureCatalog();
    let generation = 0;
    for (const code of ["C", "A"]) {
      const line = network.lines.find(
        (candidate) => candidate.mode === "RER" && candidate.label === code,
      )!;
      expect(line).toBeDefined();
      const stations = line.stationIds.map((id) => network.stationsById.get(id)!);
      const camera = fitCameraToBounds(
        createCamera({ viewportWidthCssPx: 1_280, viewportHeightCssPx: 900 }),
        {
          minX: Math.min(...stations.map((station) => station.worldX)),
          minY: Math.min(...stations.map((station) => station.worldY)),
          maxX: Math.max(...stations.map((station) => station.worldX)),
          maxY: Math.max(...stations.map((station) => station.worldY)),
        },
        64,
        8,
        17,
      );
      const result = await source.queryViewport(camera, visibleModes, ++generation, line.id);
      expect(result.paths.length).toBeGreaterThan(0);
      references.set(code, { lineId: line.id, camera, result });
    }
  } finally {
    source.dispose();
  }
}, 30_000);

describe("focused RER line switching", () => {
  it.each(["AbortError", "signal reason"])(
    "reloads all RER C segments after cancellation with %s",
    async (cancellation) => {
      const { source, loader } = createSource();
      const rerC = references.get("C")!;
      const rerA = references.get("A")!;
      const loadChunk = loader.loadChunk.bind(loader);
      let rerCChunks = 0;
      let chunkRequests = 0;
      let notifyPaused!: () => void;
      const paused = new Promise<void>((resolvePaused) => {
        notifyPaused = resolvePaused;
      });
      vi.spyOn(loader, "loadChunk").mockImplementation(async (...args) => {
        const payload = await loadChunk(...args);
        chunkRequests += 1;
        const shouldPause =
          cancellation === "signal reason"
            ? chunkRequests === rerC.result.chunkIds.length
            : payload.paths.some((path) => path.lineId === rerC.lineId) && ++rerCChunks === 2;
        if (shouldPause) {
          // Interrupt both a batch with queued chunks and its final in-flight
          // chunk. The latter has no queued AbortError to mask a numeric reason.
          await new Promise<void>((_resolve, reject) => {
            const signal = args[2]!;
            const abort = () =>
              reject(
                cancellation === "AbortError"
                  ? new DOMException("Line changed", "AbortError")
                  : signal.reason,
              );
            if (signal.aborted) abort();
            else signal.addEventListener("abort", abort, { once: true });
            notifyPaused();
          });
        }
        return payload;
      });

      try {
        await source.initialize();
        await source.ensureCatalog();
        const interrupted = source.queryViewport(rerC.camera, visibleModes, 1, rerC.lineId).then(
          (result) => ({ result }),
          (error: unknown) => ({ error }),
        );
        await paused;
        const selectedA = await source.queryViewport(rerA.camera, visibleModes, 2, rerA.lineId);
        expect(ids(selectedA.paths)).toEqual(ids(rerA.result.paths));

        for (let generation = 3; generation <= 7; generation += 1) {
          const reference = generation % 2 === 1 ? rerC : rerA;
          const result = await source.queryViewport(
            reference.camera,
            visibleModes,
            generation,
            reference.lineId,
          );
          expect(ids(result.stations)).toEqual(ids(reference.result.stations));
          expect(ids(result.paths)).toEqual(ids(reference.result.paths));
        }
        await expect(interrupted).resolves.toMatchObject({ error: { name: "AbortError" } });
      } finally {
        source.dispose();
      }
    },
    30_000,
  );

  it("does not keep a transiently missing C chunk in the focused result cache", async () => {
    const { source, loader } = createSource();
    const rerC = references.get("C")!;
    const rerA = references.get("A")!;
    const loadChunk = loader.loadChunk.bind(loader);
    let failedOnce = false;
    vi.spyOn(loader, "loadChunk").mockImplementation(async (...args) => {
      const payload = await loadChunk(...args);
      if (!failedOnce && payload.paths.some((path) => path.lineId === rerC.lineId)) {
        failedOnce = true;
        throw new Error("Temporary chunk download failure");
      }
      return payload;
    });

    try {
      await source.initialize();
      await source.ensureCatalog();
      const partial = await source.queryViewport(rerC.camera, visibleModes, 1, rerC.lineId);
      expect(failedOnce).toBe(true);
      expect(ids(partial.stations)).toEqual(ids(rerC.result.stations));
      expect(partial.paths.length).toBeLessThan(rerC.result.paths.length);

      await source.queryViewport(rerA.camera, visibleModes, 2, rerA.lineId);
      const recovered = await source.queryViewport(rerC.camera, visibleModes, 3, rerC.lineId);
      expect(ids(recovered.paths)).toEqual(ids(rerC.result.paths));
      expect(ids(recovered.stations)).toEqual(ids(rerC.result.stations));

      // Complete results still use the fast cache, including array identity.
      const cached = await source.queryViewport(rerC.camera, visibleModes, 4, rerC.lineId);
      expect(cached.fromCache).toBe(true);
      expect(cached.paths).toBe(recovered.paths);
    } finally {
      source.dispose();
    }
  }, 30_000);
});
