import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { GlobalMapAssetLoader } from "../../src/features/transport-map/data/assetLoader";
import { TransportMapDataSource } from "../../src/features/transport-map/data/createTransportMapDataSource";
import { GLOBAL_MAP_MODE_ORDER } from "../../src/features/transport-map/contracts/manifest";
import { createCamera } from "../../src/features/transport-map/geo/camera";
import { lonLatToWorld } from "../../src/features/transport-map/geo/coordinateKernel";

interface TimingSample {
  scenario: string;
  phase: string;
  durationMs: number;
  paths: number;
  stations: number;
  chunks: number;
  bytes: number;
  fromCache: boolean;
}

interface RunResult {
  run: number;
  timings: TimingSample[];
}

const projectRoot = resolve(import.meta.dirname, "../..");
const assetRoot = resolve(projectRoot, "public/data/global-map/v1");
const outputPath = resolve(projectRoot, "reports/global-map/performance-desktop-latest.json");
const allModesMask = GLOBAL_MAP_MODE_ORDER.reduce((mask, _mode, index) => mask | (1 << index), 0);
const paris = lonLatToWorld({ lon: 2.3522, lat: 48.8566 });

async function main(): Promise<void> {
  const coldRuns = readPositiveArg("cold", 3);
  const warmRuns = readPositiveArg("warm", 5);
  const cold: RunResult[] = [];
  const warm: RunResult[] = [];

  for (let run = 1; run <= coldRuns; run += 1) cold.push(await runCold(run));
  for (let run = 1; run <= warmRuns; run += 1) warm.push(await runWarm(run));

  const report = {
    schemaVersion: 1,
    status: "desktop-static-probe",
    generatedAt: new Date().toISOString(),
    dataRoot: basename(assetRoot),
    dataVersion: readManifestVersion(),
    renderer: "not-applicable-node-loader-only",
    scenarios: {
      coldRuns,
      warmRuns,
      expectedScenarioSet: [
        "regional-open-all-families",
        "dense-paris-viewport",
        "zoom-z9-z15",
        "peripheral-viewport",
      ],
    },
    cold,
    warm,
    aggregates: aggregate([...cold, ...warm]),
    androidGate: {
      status: "not-measured",
      reason: "This command measures static loader/viewport work only; use bench:map:android on the release APK and reference device.",
    },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Desktop map benchmark written to ${outputPath}`);
  console.log(JSON.stringify(report.aggregates, null, 2));
}

async function runCold(run: number): Promise<RunResult> {
  const source = createSource();
  try {
    const timings: TimingSample[] = [];
    await measureColdInitializeAndQuery(source, createCamera({
      centerWorldX: paris.x,
      centerWorldY: paris.y,
      zoom: 8,
      viewportWidthCssPx: 1280,
      viewportHeightCssPx: 720,
    }), timings);
    await measureQuery(source, "dense-paris-viewport", "catalog-and-detail", createCamera({
      centerWorldX: paris.x,
      centerWorldY: paris.y,
      zoom: 13.5,
      viewportWidthCssPx: 1280,
      viewportHeightCssPx: 720,
    }), timings);
    await measureQuery(source, "zoom-z9-z15", "detail-zoom", createCamera({
      centerWorldX: paris.x,
      centerWorldY: paris.y,
      zoom: 15,
      viewportWidthCssPx: 412,
      viewportHeightCssPx: 915,
    }), timings);
    await measureQuery(source, "peripheral-viewport", "peripheral", createCamera({
      centerWorldX: lonLatToWorld({ lon: 2.8, lat: 48.9 }).x,
      centerWorldY: lonLatToWorld({ lon: 2.8, lat: 48.9 }).y,
      zoom: 12,
      viewportWidthCssPx: 768,
      viewportHeightCssPx: 1024,
    }), timings);
    return { run, timings };
  } finally {
    source.dispose();
  }
}

async function runWarm(run: number): Promise<RunResult> {
  const source = createSource();
  try {
    await source.initialize();
    await source.queryViewport(createCamera({ centerWorldX: paris.x, centerWorldY: paris.y, zoom: 13.5, viewportWidthCssPx: 1280, viewportHeightCssPx: 720 }), allModesMask, 1);
    const timings: TimingSample[] = [];
    await measureQuery(source, "regional-open-all-families", "warm-global", createCamera({ centerWorldX: paris.x, centerWorldY: paris.y, zoom: 8, viewportWidthCssPx: 1280, viewportHeightCssPx: 720 }), timings);
    await measureQuery(source, "dense-paris-viewport", "warm-detail", createCamera({ centerWorldX: paris.x, centerWorldY: paris.y, zoom: 13.5, viewportWidthCssPx: 1280, viewportHeightCssPx: 720 }), timings);
    await measureQuery(source, "zoom-z9-z15", "warm-zoom", createCamera({ centerWorldX: paris.x, centerWorldY: paris.y, zoom: 15, viewportWidthCssPx: 412, viewportHeightCssPx: 915 }), timings);
    const peripheral = lonLatToWorld({ lon: 2.8, lat: 48.9 });
    await measureQuery(source, "peripheral-viewport", "warm-peripheral", createCamera({ centerWorldX: peripheral.x, centerWorldY: peripheral.y, zoom: 12, viewportWidthCssPx: 768, viewportHeightCssPx: 1024 }), timings);
    return { run, timings };
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
  return new TransportMapDataSource({ loader, maxChunkConcurrency: 2 });
}

async function measureQuery(
  source: TransportMapDataSource,
  scenario: string,
  phase: string,
  camera: ReturnType<typeof createCamera>,
  timings: TimingSample[],
): Promise<void> {
  const startedAt = performance.now();
  const result = await source.queryViewport(camera, allModesMask, camera.generation);
  timings.push({
    scenario,
    phase,
    durationMs: round(performance.now() - startedAt),
    paths: result.paths.length,
    stations: result.stations.length,
    chunks: result.chunkIds.length,
    bytes: result.bytes,
    fromCache: result.fromCache,
  });
}

async function measureColdInitializeAndQuery(
  source: TransportMapDataSource,
  camera: ReturnType<typeof createCamera>,
  timings: TimingSample[],
): Promise<void> {
  const startedAt = performance.now();
  await source.initialize();
  const result = await source.queryViewport(camera, allModesMask, camera.generation);
  timings.push({
    scenario: "regional-open-all-families",
    phase: "initialize-and-global",
    durationMs: round(performance.now() - startedAt),
    paths: result.paths.length,
    stations: result.stations.length,
    chunks: result.chunkIds.length,
    bytes: result.bytes,
    fromCache: result.fromCache,
  });
}

function aggregate(runs: RunResult[]): Record<string, unknown> {
  const grouped = new Map<string, number[]>();
  for (const run of runs) {
    for (const sample of run.timings) {
      const values = grouped.get(sample.scenario) ?? [];
      values.push(sample.durationMs);
      grouped.set(sample.scenario, values);
    }
  }
  return Object.fromEntries([...grouped.entries()].map(([scenario, values]) => {
    const sorted = values.sort((left, right) => left - right);
    return [scenario, {
      samples: sorted.length,
      medianMs: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      minMs: sorted[0] ?? 0,
      maxMs: sorted.at(-1) ?? 0,
    }];
  }));
}

function readManifestVersion(): string {
  if (!existsSync(resolve(assetRoot, "manifest.json"))) return "missing-assets";
  const manifest = JSON.parse(readFileSync(resolve(assetRoot, "manifest.json"), "utf8")) as { dataVersion?: string };
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
