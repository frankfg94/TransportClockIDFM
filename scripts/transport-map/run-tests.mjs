import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");
const isWindows = process.platform === "win32";
const testRunner = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const coordinates = [
  "tests/transportMapProjection.test.ts",
  "tests/transportMapCamera.test.ts",
  "tests/transportMapZoomDrift.test.ts",
  "tests/transportMapPinchInvariant.test.ts",
  "tests/transportMapCoordinateBattery.test.ts",
  "tests/transportMapPerformance.test.ts",
  "tests/transportMapAnchorParity.test.ts",
  "tests/transportMapRendererParity.test.ts",
  "tests/transportMapRendererCache.test.ts",
  "tests/transportMapRenderShared.test.ts",
  "tests/transportMapBasemap.test.ts",
  "tests/selectedLineBasemapCover.test.ts",
  "tests/globalTransportPlanConfig.test.ts",
];
const e2e = [
  "tests/globalTransportPlan.dom.test.ts",
  "tests/globalTransportPlanAccessibility.dom.test.ts",
  "tests/globalTransportHover.dom.test.ts",
  "tests/globalTransportPerformanceScenarios.dom.test.ts",
  "tests/transportMapBasemap.dom.test.ts",
  "tests/selectedLineBasemapCover.dom.test.ts",
  "tests/transportMapAnchorParity.test.ts",
  "tests/transportMapRendererParity.test.ts",
];
const all = [
  ...coordinates,
  "tests/globalMapIsochrones.test.ts",
  "tests/globalMapIsochroneGenerator.test.ts",
  "tests/globalMapIsochroneWorker.test.ts",
  "tests/globalMapIsochroneServer.test.ts",
  "tests/globalMapIsochrones.dom.test.ts",
  "tests/globalMapIsochroneRendering.test.ts",
  "tests/globalTransportPerformanceScenarios.test.ts",
  "tests/transportMapAssets.test.ts",
  "tests/transportMapCache.test.ts",
  "tests/transportMapChunkScheduler.test.ts",
  "./tests/transportMapFilters.test.ts",
  "tests/transportMapDashboard.dom.test.ts",
  "tests/transportMapDataSource.test.ts",
  "tests/transportMapRadiusQuery.test.ts",
  "tests/transportMapRuntime.test.ts",
  "tests/transportMapSpatial.test.ts",
  "tests/transportMapSpatialIndex.test.ts",
  "tests/transportMapTraffic.test.ts",
  "tests/transportMapAndroidGfxinfo.test.ts",
  "tests/transportMapWorkerProtocol.test.ts",
  ...e2e,
];
const group =
  process.argv.find((argument) => argument.startsWith("--group="))?.slice("--group=".length) ??
  "all";
const files = group === "coordinates" ? coordinates : group === "e2e" ? e2e : all;

for (const file of files) {
  // Vitest on Windows treats a ./ prefixed filter as a literal unmatched
  // path. Keep the filters portable while passing the normalized path.
  const testFile = file.startsWith("./") ? file.slice(2) : file;
  const runnerArgs = isWindows
    ? ["/d", "/s", "/c", `npm.cmd run test -- --reporter=dot ${testFile}`]
    : ["run", "test", "--", "--reporter=dot", testFile];
  const result = spawnSync(testRunner, runnerArgs, {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
