import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  parseAndroidGfxinfoFrames,
  parseAndroidPssKb,
  summarizeAndroidGfxinfo,
  type AndroidGfxinfoMetrics,
} from "./androidGfxinfo";

const projectRoot = resolve(import.meta.dirname, "../..");
const packageId = process.env.MAP_REPLAY_PACKAGE ?? "fr.vibeidfm.transportclock";
const activity = process.env.MAP_REPLAY_ACTIVITY ?? `${packageId}/.MainActivity`;
const defaultReleaseApk = resolve(projectRoot, "android/app/build/outputs/apk/release/app-release.apk");
const defaultReportPath = resolve(projectRoot, "reports/global-map/performance-android-release-gfxinfo-latest.json");
const defaultRawDirectory = resolve(projectRoot, "reports/global-map-performance");

const thresholds = {
  deliveredFrameRatioMin: 0.98,
  medianFrameTimeMsMax: 16.7,
  p95FrameTimeMsMax: 18,
  p99FrameTimeMsMax: 25,
  longFrameMsMax: 50,
  memoryCycles: 5,
} as const;

const longScenarioDurationMs = positiveEnv("MAP_REPLAY_LONG_SCENARIO_MS", 30_000);
const shortScenarioDurationMs = positiveEnv("MAP_REPLAY_SHORT_SCENARIO_MS", 3_000);
const coldRuns = nonNegativeEnv("MAP_REPLAY_COLD_RUNS", 3);
const warmRuns = nonNegativeEnv("MAP_REPLAY_WARM_RUNS", 5);
const mapReadyMs = positiveEnv("MAP_REPLAY_MAP_READY_MS", 5_000);
const settleMs = positiveEnv("MAP_REPLAY_GFXINFO_SETTLE_MS", 250);
const maxWaitMs = positiveEnv("MAP_REPLAY_MAX_WAIT_MS", 60_000);
const allowDebugBuild = process.env.MAP_REPLAY_ALLOW_DEBUG === "1";
const installApk = process.env.MAP_REPLAY_INSTALL === "1";
const requestedScenarios = new Set(
  (process.env.MAP_REPLAY_SCENARIOS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

type JsonRecord = Record<string, unknown>;
type RunKind = "cold" | "warm";

interface ScreenSize {
  width: number;
  height: number;
}

interface ScenarioResult {
  run: number;
  runKind: RunKind;
  cycle: number;
  scenario: string;
  action: string;
  metrics?: AndroidGfxinfoMetrics;
  pssKb?: number;
  rawGfxinfo?: string;
  error?: string;
}

interface RunResult {
  run: number;
  runKind: RunKind;
  cycle: number;
  pssKb?: number;
  scenarios: ScenarioResult[];
}

async function main(): Promise<void> {
  const adbPath = resolveAdbPath();
  const devices = adbPath ? listDevices(adbPath) : [];
  const serial = process.env.ANDROID_DEVICE_SERIAL ?? devices[0];
  const apkPath = resolve(process.env.MAP_REPLAY_APK_PATH ?? process.env.MOBILE_RELEASE_APK_PATH ?? defaultReleaseApk);
  const buildType = /(?:^|[\\/])debug(?:[\\/]|\.|$)/iu.test(apkPath) ? "debug" : "release";
  const blockers: string[] = [];

  if (!adbPath) blockers.push("adb is unavailable; set ADB_PATH or ANDROID_SDK_ROOT/ANDROID_HOME");
  if (!serial) blockers.push("no Android device is connected");
  if (!existsSync(apkPath)) blockers.push(`APK missing: ${apkPath}`);
  if (buildType !== "release" && !allowDebugBuild) blockers.push("a release APK is required; set MAP_REPLAY_ALLOW_DEBUG=1 only for diagnostics");
  if (buildType === "release" && existsSync(apkPath)) {
    const manifestPath = resolve(projectRoot, "public/data/global-map/v1/manifest.json");
    if (existsSync(manifestPath) && statSync(apkPath).mtimeMs < statSync(manifestPath).mtimeMs) {
      blockers.push("release APK predates the current global-map assets; rebuild the signed release APK");
    }
  }
  if (adbPath && serial && !devices.includes(serial)) blockers.push(`requested Android device is not online: ${serial}`);

  if (blockers.length) {
    await writeReport({
      schemaVersion: 1,
      status: "blocked",
      generatedAt: new Date().toISOString(),
      packageId,
      apkPath,
      buildType,
      deviceSerial: serial,
      requiredThresholds: thresholds,
      protocol: protocolDescription(),
      runs: [],
      blockers,
      observed: null,
    });
    console.error(blockers.map((blocker) => `- ${blocker}`).join("\n"));
    process.exitCode = 2;
    return;
  }

  if (installApk) adb(adbPath!, serial!, ["install", "-r", apkPath]);

  const metadata = readDeviceMetadata(adbPath!, serial!);
  const screen = readScreenSize(adbPath!, serial!);
  const runs: RunResult[] = [];
  let runIndex = 0;

  for (let index = 0; index < coldRuns; index += 1) {
    await launchMap(adbPath!, serial!, screen);
    runs.push(await runReplay(adbPath!, serial!, screen, runIndex++, "cold", index + 1));
  }
  for (let index = 0; index < warmRuns; index += 1) {
    await relaunchMapIntent(adbPath!, serial!, screen);
    runs.push(await runReplay(adbPath!, serial!, screen, runIndex++, "warm", index + 1));
  }

  const observed = aggregate(runs);
  const report = {
    schemaVersion: 1,
    status: "diagnostic",
    generatedAt: new Date().toISOString(),
    packageId,
    apkPath,
    buildType,
    deviceSerial: serial,
    device: metadata,
    screen,
    requiredThresholds: thresholds,
    protocol: protocolDescription(),
    observed,
    runs,
    blockers: [
      "dumpsys gfxinfo is a release-safe black-box complement, not a replacement for the page instrumentation and reference-device gate",
      "WebView DOM state and long-task metrics are not observable from a non-debuggable release APK",
      ...(buildType !== "release" ? ["diagnostic build; release gate is not claimed"] : []),
      ...(coldRuns !== 3 || warmRuns !== 5 ? ["replay counts differ from the required 3 cold + 5 warm protocol"] : []),
      "the connected emulator is not the declared Android reference handset",
    ],
  };
  await writeReport(report);
  console.log(`Android release gfxinfo replay written to ${resolve(process.env.MAP_REPLAY_GFXINFO_OUTPUT ?? defaultReportPath)}`);
  console.log(JSON.stringify({ status: report.status, observed }, null, 2));
  process.exitCode = 2;
}

async function launchMap(adbPath: string, serial: string, screen: ScreenSize): Promise<void> {
  adb(adbPath, serial, ["shell", "am", "force-stop", packageId]);
  await relaunchMapIntent(adbPath, serial, screen);
}

async function relaunchMapIntent(adbPath: string, serial: string, screen: ScreenSize): Promise<void> {
  adb(adbPath, serial, [
    "shell",
    "am",
    "start",
    "-W",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    "https://localhost/map?mapDebug=1",
    "-n",
    activity,
  ]);
  await sleep(mapReadyMs);
  const xml = adb(adbPath, serial, ["shell", "uiautomator", "dump", "/sdcard/global-map-window.xml"]);
  const hierarchy = adb(adbPath, serial, ["shell", "cat", "/sdcard/global-map-window.xml"]);
  if (!hierarchy.includes("android.webkit.WebView")) {
    throw new Error(`Capacitor WebView was not present after map launch: ${xml.trim()}`);
  }
  tapReset(adbPath, serial, screen);
  await sleep(160);
}

async function runReplay(
  adbPath: string,
  serial: string,
  screen: ScreenSize,
  run: number,
  runKind: RunKind,
  cycle: number,
): Promise<RunResult> {
  console.log(`[map-gfxinfo] run ${runKind} ${cycle}/${runKind === "cold" ? coldRuns : warmRuns}`);
  const scenarios: ScenarioResult[] = [];
  const names = scenarioNames().filter((scenario) => !requestedScenarios.size || requestedScenarios.has(scenario));

  for (const scenario of names) {
    tapReset(adbPath, serial, screen);
    await sleep(80);
    adb(adbPath, serial, ["shell", "dumpsys", "gfxinfo", packageId, "reset"]);
    const action = await performScenario(adbPath, serial, screen, scenario);
    await sleep(settleMs);
    const rawGfxinfo = adb(adbPath, serial, ["shell", "dumpsys", "gfxinfo", packageId, "framestats"]);
    const metrics = summarizeAndroidGfxinfo(parseAndroidGfxinfoFrames(rawGfxinfo));
    const pssKb = parseAndroidPssKb(adb(adbPath, serial, ["shell", "dumpsys", "meminfo", packageId]));
    scenarios.push({ run, runKind, cycle, scenario, action, metrics, pssKb, rawGfxinfo });
    console.log(`[map-gfxinfo] ${runKind} ${cycle}: ${scenario} ${formatMetrics(metrics)}`);
  }

  const pssKb = parseAndroidPssKb(adb(adbPath, serial, ["shell", "dumpsys", "meminfo", packageId]));
  return { run, runKind, cycle, pssKb, scenarios };
}

async function performScenario(adbPath: string, serial: string, screen: ScreenSize, scenario: string): Promise<string> {
  const canvas = {
    x1: Math.round(screen.width * 0.28),
    x2: Math.round(screen.width * 0.72),
    y: Math.round(screen.height * 0.56),
  };
  switch (scenario) {
    case "regional-open-all-families":
      await sleep(shortScenarioDurationMs);
      return "launch route with mapDebug=1; default all-family state";
    case "pan-horizontal":
      await repeatedSwipe(adbPath, serial, canvas.x1, canvas.y, canvas.x2, canvas.y, longScenarioDurationMs);
      return "adb touchscreen horizontal swipes";
    case "pan-diagonal":
      await repeatedSwipe(adbPath, serial, canvas.x1, canvas.y + 80, canvas.x2, canvas.y - 80, longScenarioDurationMs);
      return "adb touchscreen diagonal swipes";
    case "pinch-z9-z15":
      await repeatedKey(adbPath, serial, "KEYCODE_PLUS", 14);
      await sleep(shortScenarioDurationMs);
      return "ADB key zoom approximation; true multi-touch requires Espresso/Appium/manual protocol";
    case "zoom-z15-z9":
      await repeatedKey(adbPath, serial, "KEYCODE_PLUS", 14);
      await repeatedKey(adbPath, serial, "KEYCODE_MINUS", 14);
      await sleep(shortScenarioDurationMs);
      return "ADB key zoom approximation";
    case "fast-inertia":
      await repeatedSwipe(adbPath, serial, canvas.x1, canvas.y, canvas.x2, canvas.y - 80, 1_200);
      await sleep(shortScenarioDurationMs);
      return "short fling-like touchscreen swipe";
    case "line-selection":
      tapCanvas(adbPath, serial, screen, 0.50, 0.52);
      await sleep(shortScenarioDurationMs);
      return "center canvas tap; selected feature is not DOM-verifiable in release";
    case "station-selection":
      tapCanvas(adbPath, serial, screen, 0.50, 0.52);
      await sleep(shortScenarioDurationMs);
      return "center canvas tap; selected feature is not DOM-verifiable in release";
    case "toggle-bus":
      tap(adbPath, serial, Math.round(screen.width * 0.20), Math.round(screen.height * 0.20));
      await sleep(shortScenarioDurationMs);
      return "approximate first filter-row tap; filter state is not DOM-verifiable in release";
    case "all-families":
      await sleep(shortScenarioDurationMs);
      return "launch route with all families requested by the default filter state";
    case "traffic-open-close":
      tap(adbPath, serial, Math.round(screen.width * 0.38), Math.round(screen.height * 0.14));
      await sleep(Math.min(shortScenarioDurationMs, 2_000));
      tap(adbPath, serial, Math.round(screen.width * 0.38), Math.round(screen.height * 0.14));
      await sleep(shortScenarioDurationMs);
      return "approximate traffic action taps; traffic state is not DOM-verifiable in release";
    case "dense-paris":
      await repeatedKey(adbPath, serial, "KEYCODE_PLUS", 8);
      await repeatedSwipe(adbPath, serial, canvas.x1, canvas.y, canvas.x2, canvas.y, shortScenarioDurationMs);
      await sleep(shortScenarioDurationMs);
      return "zoom key approximation plus horizontal swipes";
    case "peripheral":
      tapReset(adbPath, serial, screen);
      await repeatedSwipe(adbPath, serial, Math.round(screen.width * 0.50), canvas.y, Math.round(screen.width * 0.82), Math.round(screen.height * 0.78), shortScenarioDurationMs);
      await sleep(shortScenarioDurationMs);
      return "recenter approximation plus diagonal swipes";
    default:
      throw new Error(`Unknown replay scenario: ${scenario}`);
  }
}

async function repeatedSwipe(adbPath: string, serial: string, x1: number, y1: number, x2: number, y2: number, durationMs: number): Promise<void> {
  // One continuous shell gesture is the closest release-safe equivalent to
  // the CDP pointer replay. Alternating 850 ms swipes floods the emulator's
  // input queue and measures injected-event backlog rather than map drawing.
  adb(adbPath, serial, [
    "shell",
    "input",
    "swipe",
    String(x1),
    String(y1),
    String(x2),
    String(y2),
    String(Math.max(250, Math.round(durationMs))),
  ]);
}

async function repeatedKey(adbPath: string, serial: string, key: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    adb(adbPath, serial, ["shell", "input", "keyevent", key]);
    await sleep(35);
  }
}

function tapReset(adbPath: string, serial: string, screen: ScreenSize): void {
  tap(adbPath, serial, Math.round(screen.width * 0.14), Math.round(screen.height * 0.14));
}

function tapCanvas(adbPath: string, serial: string, screen: ScreenSize, xRatio: number, yRatio: number): void {
  tap(adbPath, serial, Math.round(screen.width * xRatio), Math.round(screen.height * (0.20 + yRatio * 0.60)));
}

function tap(adbPath: string, serial: string, x: number, y: number): void {
  adb(adbPath, serial, ["shell", "input", "tap", String(x), String(y)]);
}

function aggregate(runs: RunResult[]): JsonRecord & { gatePass: false } {
  const scenarioResults = runs.flatMap((run) => run.scenarios);
  const metrics = scenarioResults.map((scenario) => scenario.metrics).filter((value): value is AndroidGfxinfoMetrics => Boolean(value));
  const numeric = (key: keyof AndroidGfxinfoMetrics) => metrics.map((metric) => metric[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const ratios = numeric("deliveredFrameRatio");
  const medians = numeric("medianFrameTimeMs");
  const p95 = numeric("p95FrameTimeMs");
  const p99 = numeric("p99FrameTimeMs");
  const over50 = numeric("framesOver50Ms");
  const memoryCycles = runs.filter((run) => run.runKind === "warm").map((run) => run.pssKb).filter((value): value is number => Number.isFinite(value));
  const observed = {
    reportCount: metrics.length,
    deliveredFrameRatioMin: min(ratios),
    medianFrameTimeMsMedian: median(medians),
    p95FrameTimeMsMax: max(p95),
    p99FrameTimeMsMax: max(p99),
    framesOver50MsMax: max(over50),
    longTasksOver50MsMax: undefined,
    memoryCyclesPssKb: memoryCycles,
    memoryGrowthPssKb: memoryCycles.length >= 2 ? memoryCycles[memoryCycles.length - 1]! - memoryCycles[0]! : undefined,
    continuousMemoryGrowth: memoryCycles.length >= thresholds.memoryCycles && memoryCycles.every((value, index) => index === 0 || value > memoryCycles[index - 1]!),
    allFamiliesVisible: undefined,
    allFamiliesRequested: scenarioResults.some((scenario) => scenario.scenario === "all-families" || scenario.scenario === "regional-open-all-families"),
    trafficExercised: scenarioResults.some((scenario) => scenario.scenario === "traffic-open-close" && !scenario.error),
    stateVerification: "not-available-in-non-debuggable-release",
    renderer: "Canvas2D expected; DOM renderer state unavailable",
  };
  return { ...observed, gatePass: false };
}

function protocolDescription(): JsonRecord {
  return {
    method: "adb input + dumpsys gfxinfo framestats + dumpsys meminfo",
    route: "https://localhost/map?mapDebug=1",
    coldRuns,
    warmRuns,
    longScenarioDurationMs,
    shortScenarioDurationMs,
    note: "This release-safe black-box capture complements the page/CDP diagnostic. It cannot claim DOM state or long-task thresholds from a non-debuggable WebView.",
  };
}

function readDeviceMetadata(adbPath: string, serial: string): JsonRecord {
  const read = (...args: string[]) => adb(adbPath, serial, ["shell", ...args]).trim();
  return {
    model: read("getprop", "ro.product.model"),
    manufacturer: read("getprop", "ro.product.manufacturer"),
    soc: read("getprop", "ro.soc.model"),
    android: read("getprop", "ro.build.version.release"),
    sdk: read("getprop", "ro.build.version.sdk"),
    webView: read("dumpsys", "webviewupdate").split(/\r?\n/u).find((line) => /Current WebView package/u.test(line))?.trim(),
    wmSize: read("wm", "size"),
    wmDensity: read("wm", "density"),
  };
}

function readScreenSize(adbPath: string, serial: string): ScreenSize {
  const raw = adb(adbPath, serial, ["shell", "wm", "size"]);
  const matches = [...raw.matchAll(/(\d+)x(\d+)/gu)];
  const last = matches.at(-1);
  if (!last) throw new Error(`Unable to parse Android screen size: ${raw.trim()}`);
  return { width: Number(last[1]), height: Number(last[2]) };
}

function listDevices(adbPath: string): string[] {
  return adb(adbPath, undefined, ["devices", "-l"])
    .split(/\r?\n/u)
    .filter((line) => /^\s*\S+\s+device(?:\s|$)/u.test(line))
    .map((line) => line.split(/\s+/u)[0]!)
    .filter(Boolean);
}

async function writeReport(report: unknown): Promise<void> {
  const reportPath = resolve(process.env.MAP_REPLAY_GFXINFO_OUTPUT ?? defaultReportPath);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const rawPath = resolve(process.env.MAP_REPLAY_GFXINFO_RAW_OUTPUT ?? resolve(defaultRawDirectory, `${new Date().toISOString().replace(/[:.]/gu, "-")}-android-gfxinfo.json`));
  await mkdir(dirname(rawPath), { recursive: true });
  await writeFile(rawPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function formatMetrics(metrics: AndroidGfxinfoMetrics): string {
  return JSON.stringify({
    frames: metrics.frameCount,
    ratio: metrics.deliveredFrameRatio,
    median: metrics.medianFrameTimeMs,
    p95: metrics.p95FrameTimeMs,
    p99: metrics.p99FrameTimeMs,
    over50: metrics.framesOver50Ms,
  });
}

function min(values: number[]): number | undefined {
  return values.length ? Math.min(...values) : undefined;
}

function max(values: number[]): number | undefined {
  return values.length ? Math.max(...values) : undefined;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.5) - 1)];
}

function resolveAdbPath(): string | undefined {
  const explicit = process.env.ADB_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const sdkRoot = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME;
  if (sdkRoot) {
    const candidate = resolve(sdkRoot, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
    if (existsSync(candidate)) return candidate;
  }
  try {
    execFileSync(process.platform === "win32" ? "where.exe" : "which", [process.platform === "win32" ? "adb.exe" : "adb"], { stdio: "ignore" });
    return process.platform === "win32" ? "adb.exe" : "adb";
  } catch {
    return undefined;
  }
}

function adb(adbPath: string, serial: string | undefined, args: string[]): string {
  const fullArgs = serial && args[0] !== "devices" ? ["-s", serial, ...args] : args;
  return execFileSync(adbPath, fullArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function scenarioNames(): string[] {
  return [
    "regional-open-all-families",
    "pan-horizontal",
    "pan-diagonal",
    "pinch-z9-z15",
    "zoom-z15-z9",
    "fast-inertia",
    "line-selection",
    "station-selection",
    "toggle-bus",
    "all-families",
    "traffic-open-close",
    "dense-paris",
    "peripheral",
  ];
}

function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, durationMs));
}

void main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  try {
    await writeReport({ schemaVersion: 1, status: "error", generatedAt: new Date().toISOString(), packageId, requiredThresholds: thresholds, error: message });
  } catch { /* preserve the original failure */ }
  process.exitCode = 1;
});
