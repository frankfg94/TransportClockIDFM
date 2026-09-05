import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { GlobalMapAssetLoader } from "../../src/features/transport-map/data/assetLoader";
import { TransportMapDataSource } from "../../src/features/transport-map/data/createTransportMapDataSource";
import { GLOBAL_MAP_MODE_ORDER } from "../../src/features/transport-map/contracts/manifest";
import type { TransportMapRenderFrame, TransportMapRenderScene, TransportMapRendererHost } from "../../src/features/transport-map/contracts/renderer";
import { createCamera } from "../../src/features/transport-map/geo/camera";
import { lonLatToWorld } from "../../src/features/transport-map/geo/coordinateKernel";
import { createDeckTransportLayers } from "../../src/features/transport-map/next/deckMapLayers";
import { DeckGlRenderer } from "../../src/features/transport-map/render/deckgl/deckGlRenderer";
import {
  createDeckPathBinaryPacket,
  type DeckPathPacketCompiler,
} from "../../src/features/transport-map/render/deckgl/deckPathPacket";

interface AllBusSample {
  run: number;
  phase: "cold" | "warm";
  queryMs: number;
  frameMs: number;
  layerUpdateMs: number;
  pathCount: number;
  vertices: number;
  binaryBytes: number;
  binaryCompileMs: number;
  cacheHitRate: number;
  cacheHits: number;
  cacheMisses: number;
  layerCount: number;
  objectFallbackFrames: number;
  binaryLayerFrames: number;
}

const projectRoot = resolve(import.meta.dirname, "../..");
const assetRoot = resolve(projectRoot, "public/data/global-map/v1");
const outputPath = resolve(projectRoot, "reports/global-map/all-bus-latest.json");
const busMask = 1 << GLOBAL_MAP_MODE_ORDER.indexOf("BUS");
const paris = lonLatToWorld({ lon: 2.3522, lat: 48.8566 });

async function main(): Promise<void> {
  const coldRuns = readPositiveArg("cold", 2);
  const warmRuns = readPositiveArg("warm", 3);
  const samples: AllBusSample[] = [];

  for (let run = 1; run <= coldRuns; run += 1) {
    samples.push(await runAllBus(run, "cold", false));
  }
  for (let run = 1; run <= warmRuns; run += 1) {
    samples.push(await runAllBus(run, "warm", true));
  }

  const report = {
    schemaVersion: 1,
    status: "all-bus-static-deck-probe",
    generatedAt: new Date().toISOString(),
    dataRoot: basename(assetRoot),
    dataVersion: readManifestVersion(),
    renderer: "deckgl-webgl2-pathlayer-binary",
    scenario: {
      name: "all-bus-visible",
      modeMask: busMask,
      zoom: 8,
      viewport: { widthCssPx: 1280, heightCssPx: 720 },
      note: "Node-side Deck layer/update probe; it does not measure GPU rasterization.",
    },
    runs: { coldRuns, warmRuns },
    samples,
    aggregates: aggregate(samples),
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`All-bus map benchmark written to ${outputPath}`);
  console.log(JSON.stringify(report.aggregates, null, 2));
}

async function runAllBus(run: number, phase: "cold" | "warm", warm: boolean): Promise<AllBusSample> {
  const source = createSource();
  try {
    await source.initialize();
    const camera = createCamera({
      centerWorldX: paris.x,
      centerWorldY: paris.y,
      zoom: 8,
      viewportWidthCssPx: 1280,
      viewportHeightCssPx: 720,
    });
    if (warm) {
      await source.queryViewport(camera, busMask, camera.generation);
    }

    const queryStartedAt = performance.now();
    const result = await source.queryViewport(camera, busMask, camera.generation);
    const queryMs = round(performance.now() - queryStartedAt);
    const network = source.getNetwork();
    const scene: TransportMapRenderScene = {
      lines: network.lines,
      paths: result.paths,
      stations: result.stations,
      selectedStationIds: [],
      visibleModeMask: busMask,
    };

    const layerUpdateSamples: number[] = [];
    let lastFrame: TransportMapRenderFrame | undefined;
    let layerCount = 0;
    const host: TransportMapRendererHost = {
      present(frame) {
        const startedAt = performance.now();
        layerCount = createDeckTransportLayers(frame, undefined).length;
        layerUpdateSamples.push(performance.now() - startedAt);
        lastFrame = frame;
      },
      resize: () => undefined,
      dispose: () => undefined,
    };
    const compiler: DeckPathPacketCompiler = {
      compile(records, key) {
        return Promise.resolve(createDeckPathBinaryPacket(records, key));
      },
    };
    const renderer = new DeckGlRenderer(undefined, compiler);
    renderer.attachHost(host);
    const frameStartedAt = performance.now();
    renderer.render(camera, scene);
    await waitForBinaryFrame(() => lastFrame);
    const frameMs = round(performance.now() - frameStartedAt);
    const metrics = renderer.getMetrics();
    const binaryBytes = [
      lastFrame?.binaryPackets?.base,
      lastFrame?.binaryPackets?.traffic,
      lastFrame?.binaryPackets?.highlight,
    ].reduce((total, packet) => total + (packet?.bytes ?? 0), 0);
    const cacheAccesses = (metrics.binaryCacheHits ?? 0) + (metrics.binaryCacheMisses ?? 0);
    renderer.dispose();

    return {
      run,
      phase,
      queryMs,
      frameMs,
      layerUpdateMs: round(layerUpdateSamples.reduce((total, value) => total + value, 0)),
      pathCount: lastFrame?.model.pathCount ?? result.paths.length,
      vertices: lastFrame?.model.vertexCount ?? 0,
      binaryBytes,
      binaryCompileMs: metrics.binaryCompileMs ?? 0,
      cacheHitRate: cacheAccesses > 0 ? round((metrics.binaryCacheHits ?? 0) / cacheAccesses) : 0,
      cacheHits: metrics.binaryCacheHits ?? 0,
      cacheMisses: metrics.binaryCacheMisses ?? 0,
      layerCount,
      objectFallbackFrames: metrics.objectFallbackFrames ?? 0,
      binaryLayerFrames: metrics.binaryLayerFrames ?? 0,
    };
  } finally {
    source.dispose();
  }
}

function createSource(): TransportMapDataSource {
  const loader = new GlobalMapAssetLoader({
    fetcher: async (input, init) => {
      const asset = String(input).split("/global-map/v1/")[1];
      if (!asset) return new Response(null, { status: 404 });
      try {
        return new Response(await readFile(resolve(assetRoot, asset)), { status: 200 });
      } catch {
        if (init?.signal?.aborted) return new Response(null, { status: 499 });
        return new Response(null, { status: 404 });
      }
    },
  });
  return new TransportMapDataSource({
    loader,
    maxChunkConcurrency: 2,
    useRegionalOverview: true,
  });
}

async function waitForBinaryFrame(getFrame: () => TransportMapRenderFrame | undefined): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (getFrame()?.binaryPackets?.base) return;
    await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
  }
}

function aggregate(samples: AllBusSample[]): Record<string, Record<string, number>> {
  const numericFields = [
    "queryMs",
    "frameMs",
    "layerUpdateMs",
    "pathCount",
    "vertices",
    "binaryBytes",
    "binaryCompileMs",
    "cacheHitRate",
    "cacheHits",
    "cacheMisses",
  ] as const;
  return Object.fromEntries(numericFields.map((field) => {
    const values = samples.map((sample) => sample[field]).sort((left, right) => left - right);
    return [field, {
      median: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      min: round(values[0] ?? 0),
      max: round(values.at(-1) ?? 0),
    }];
  }));
}

function readManifestVersion(): string {
  const manifestPath = resolve(assetRoot, "manifest.json");
  if (!existsSync(manifestPath)) return "missing-assets";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { dataVersion?: string };
  return manifest.dataVersion ?? "unknown";
}

function readPositiveArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  const parsed = value === undefined ? fallback : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(sorted: number[], ratio: number): number {
  if (!sorted.length) return 0;
  return round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))]!);
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
