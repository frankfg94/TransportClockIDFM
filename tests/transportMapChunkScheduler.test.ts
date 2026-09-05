import { describe, expect, it, vi } from "vitest";
import type { GlobalMapChunkDescriptor, GlobalMapChunkPayload, GlobalMapManifest } from "../src/features/transport-map/contracts/manifest";
import { TransportMapChunkScheduler } from "../src/features/transport-map/data/chunkScheduler";
import type { GlobalMapAssetLoader } from "../src/features/transport-map/data/assetLoader";

const manifest = {
  files: {
    chunks: [
      { id: "chunk:a", level: 1, bounds: { minX: 0, minY: 0, maxX: 0.5, maxY: 1 }, asset: "chunks/a.json", bytes: 10 },
      { id: "chunk:b", level: 1, bounds: { minX: 0.5, minY: 0, maxX: 1, maxY: 1 }, asset: "chunks/b.json", bytes: 10 },
    ],
  },
} as unknown as GlobalMapManifest;

function payload(id: string): GlobalMapChunkPayload {
  return {
    schemaVersion: 1,
    dataVersion: "fixture",
    chunk: { id, level: 1, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, asset: `chunks/${id}.json`, pathIds: [], stationIds: [], lineIds: [] },
    paths: [],
  };
}

describe("transport map chunk scheduler", () => {
  it("deduplicates requests and respects visible priority", async () => {
    const resolvers = new Map<string, (value: GlobalMapChunkPayload) => void>();
    const loader = {
      loadChunk: vi.fn((_manifest, descriptor) => new Promise<GlobalMapChunkPayload>((resolve) => resolvers.set(descriptor.id, resolve))),
    } as unknown as GlobalMapAssetLoader;
    const scheduler = new TransportMapChunkScheduler(loader, manifest, 1);
    const first = scheduler.request({ descriptor: manifest.files.chunks[0]!, generation: 1, priority: "overscan" });
    const duplicate = scheduler.request({ descriptor: manifest.files.chunks[0]!, generation: 1, priority: "visible" });
    const second = scheduler.request({ descriptor: manifest.files.chunks[1]!, generation: 1, priority: "visible" });
    expect(first).toBe(duplicate);
    expect(loader.loadChunk).toHaveBeenCalledTimes(1);
    resolvers.get("chunk:a")!(payload("chunk:a"));
    await expect(first).resolves.toMatchObject({ chunk: { id: "chunk:a" } });
    expect(loader.loadChunk).toHaveBeenCalledTimes(2);
    resolvers.get("chunk:b")!(payload("chunk:b"));
    await expect(second).resolves.toMatchObject({ chunk: { id: "chunk:b" } });
    expect(scheduler.metrics().cache.entries).toBe(2);
    scheduler.dispose();
  });

  it("rejects stale pending work and records it as abandoned", async () => {
    const loader = {
      loadChunk: vi.fn((_manifest, _descriptor, signal: AbortSignal) => new Promise<GlobalMapChunkPayload>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("stale", "AbortError")), { once: true });
      })),
    } as unknown as GlobalMapAssetLoader;
    const scheduler = new TransportMapChunkScheduler(loader, manifest, 1);
    const request = scheduler.request({ descriptor: manifest.files.chunks[0]!, generation: 1, priority: "visible" });
    scheduler.cancelObsolete(2);
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(scheduler.metrics().abandoned).toBeGreaterThan(0);
    scheduler.dispose();
  });

  it("re-queues a chunk when a new generation arrives during an active abort", async () => {
    const attempts: Array<{
      resolve: (value: GlobalMapChunkPayload) => void;
      reject: (reason: unknown) => void;
    }> = [];
    const loader = {
      loadChunk: vi.fn((_manifest, _descriptor, signal: AbortSignal) =>
        new Promise<GlobalMapChunkPayload>((resolve, reject) => {
          attempts.push({ resolve, reject });
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("stale", "AbortError")),
            { once: true },
          );
        }),
      ),
    } as unknown as GlobalMapAssetLoader;
    const scheduler = new TransportMapChunkScheduler(loader, manifest, 1);
    const descriptor = manifest.files.chunks[0]!;
    const first = scheduler.request({ descriptor, generation: 1, priority: "visible" });

    scheduler.cancelObsolete(2);
    const retry = scheduler.request({ descriptor, generation: 2, priority: "visible" });
    const next = scheduler.request({ descriptor: manifest.files.chunks[1]!, generation: 2, priority: "visible" });

    expect(retry).not.toBe(first);
    expect(loader.loadChunk).toHaveBeenCalledTimes(2);

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(loader.loadChunk).toHaveBeenCalledTimes(2);
    attempts[1]!.resolve(payload(descriptor.id));
    await expect(retry).resolves.toMatchObject({ chunk: { id: descriptor.id } });
    expect(loader.loadChunk).toHaveBeenCalledTimes(3);
    attempts[2]!.resolve(payload(manifest.files.chunks[1]!.id));
    await expect(next).resolves.toMatchObject({ chunk: { id: manifest.files.chunks[1]!.id } });
    scheduler.dispose();
  });

  it("skips bus-only chunks while the separate Bus layer is disabled", () => {
    const modeManifest = {
      files: {
        chunks: [
          { id: "bus-only", level: 1, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, asset: "chunks/bus-only.json", modes: ["BUS"] },
          { id: "rail", level: 1, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, asset: "chunks/rail.json", modes: ["METRO", "RER"] },
        ],
      },
    } as unknown as GlobalMapManifest;
    const scheduler = new TransportMapChunkScheduler({} as GlobalMapAssetLoader, modeManifest, 1);

    expect(scheduler.descriptorsForBounds({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 0, 1 << 1).map((chunk) => chunk.id)).toEqual(["rail"]);
    expect(scheduler.descriptorsForBounds({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 0, (1 << 0) | (1 << 1)).map((chunk) => chunk.id)).toEqual(["bus-only", "rail"]);
    scheduler.dispose();
  });

  it("evicts cached Bus geometry when the Bus layer is hidden", async () => {
    const busChunk: GlobalMapChunkDescriptor = { id: "bus-only", level: 1, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, asset: "chunks/bus-only.json", modes: ["BUS"] };
    const modeManifest = { files: { chunks: [busChunk] } } as unknown as GlobalMapManifest;
    const scheduler = new TransportMapChunkScheduler(
      { loadChunk: async (_manifest: GlobalMapManifest, descriptor: GlobalMapChunkDescriptor) => payload(descriptor.id) } as unknown as GlobalMapAssetLoader,
      modeManifest,
      1,
    );

    await scheduler.request({ descriptor: busChunk, generation: 1, priority: "visible" });
    expect(scheduler.hasCached("bus-only")).toBe(true);
    scheduler.evictInvisibleModes(1 << 1);
    expect(scheduler.hasCached("bus-only")).toBe(false);
    scheduler.dispose();
  });

  it("preserves prefetch across a newer visible generation", async () => {
    let resolvePrefetch!: (value: GlobalMapChunkPayload) => void;
    const loader = {
      loadChunk: vi.fn((_manifest, descriptor) => new Promise<GlobalMapChunkPayload>((resolve) => {
        if (descriptor.id === "chunk:a") resolvePrefetch = resolve;
      })),
    } as unknown as GlobalMapAssetLoader;
    const scheduler = new TransportMapChunkScheduler(loader, manifest, 1);
    const prefetch = scheduler.request({
      descriptor: manifest.files.chunks[0]!,
      generation: 1,
      priority: "prefetch",
    });
    scheduler.cancelObsolete(2);
    resolvePrefetch(payload("chunk:a"));
    await expect(prefetch).resolves.toMatchObject({ chunk: { id: "chunk:a" } });
    expect(scheduler.hasCached("chunk:a")).toBe(true);
    scheduler.dispose();
  });

  it("lets visible work preempt an active prefetch when all slots are occupied", async () => {
    const resolvers = new Map<string, (value: GlobalMapChunkPayload) => void>();
    const loader = {
      loadChunk: vi.fn((_manifest, descriptor, signal: AbortSignal) => new Promise<GlobalMapChunkPayload>((resolve, reject) => {
        resolvers.set(descriptor.id, resolve);
        signal.addEventListener("abort", () => reject(new DOMException("preempted", "AbortError")), { once: true });
      })),
    } as unknown as GlobalMapAssetLoader;
    const scheduler = new TransportMapChunkScheduler(loader, manifest, 1);
    const prefetch = scheduler.request({
      descriptor: manifest.files.chunks[0]!,
      generation: 1,
      priority: "prefetch",
    });
    const visible = scheduler.request({
      descriptor: manifest.files.chunks[1]!,
      generation: 2,
      priority: "visible",
    });
    const retry = scheduler.request({
      descriptor: manifest.files.chunks[0]!,
      generation: 2,
      priority: "visible",
    });
    expect(retry).not.toBe(prefetch);
    resolvers.get("chunk:b")!(payload("chunk:b"));
    await expect(visible).resolves.toMatchObject({ chunk: { id: "chunk:b" } });
    await expect(prefetch).rejects.toMatchObject({ name: "AbortError" });
    expect(loader.loadChunk).toHaveBeenCalledTimes(3);
    resolvers.get("chunk:a")!(payload("chunk:a"));
    await expect(retry).resolves.toMatchObject({ chunk: { id: "chunk:a" } });
    expect(scheduler.metrics().abandoned).toBeGreaterThan(0);
    scheduler.dispose();
  });
});
