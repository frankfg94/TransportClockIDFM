import { execFileSync } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");
const packageId = process.env.MAP_REPLAY_PACKAGE ?? "fr.vibeidfm.transportclock";
const activity = process.env.MAP_REPLAY_ACTIVITY ?? `${packageId}/.MainActivity`;
const defaultReleaseApk = resolve(projectRoot, "android/app/build/outputs/apk/release/app-release.apk");
const defaultReportPath = resolve(projectRoot, "reports/global-map/performance-android-replay-latest.json");
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
const gestureIntervalMs = positiveEnv("MAP_REPLAY_GESTURE_INTERVAL_MS", 50);
const coldRuns = nonNegativeEnv("MAP_REPLAY_COLD_RUNS", 3);
const warmRuns = nonNegativeEnv("MAP_REPLAY_WARM_RUNS", 5);
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

interface CdpTarget {
  type: string;
  webSocketDebuggerUrl: string;
  url: string;
}

interface CdpResponse {
  id?: number;
  result?: JsonRecord;
  error?: { message?: string };
}

interface ScenarioResult {
  run: number;
  runKind: "cold" | "warm";
  cycle: number;
  scenario: string;
  pageReport?: JsonRecord;
  mapState?: JsonRecord;
  error?: string;
}

interface RunResult {
  run: number;
  runKind: "cold" | "warm";
  cycle: number;
  pageMemory?: JsonRecord;
  deviceMemory?: { totalPssKb?: number; raw: string };
  gfxInfo?: string;
  scenarios: ScenarioResult[];
}

class DevToolsClient {
  private readonly socket: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: CdpResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      let message: CdpResponse;
      try {
        message = JSON.parse(raw) as CdpResponse;
      } catch {
        return;
      }
      if (message.id === undefined) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(message.error.message ?? "CDP request failed"));
      else waiter.resolve(message);
    });
    socket.addEventListener("close", () => {
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
  }

  static async connect(url: string): Promise<DevToolsClient> {
    const socket = new globalThis.WebSocket(url);
    await new Promise<void>((resolvePromise, reject) => {
      const onOpen = () => {
        cleanup();
        resolvePromise();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Unable to connect to CDP ${url}`));
      };
      const cleanup = () => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
      };
      socket.addEventListener("open", onOpen);
      socket.addEventListener("error", onError);
    });
    return new DevToolsClient(socket);
  }

  async send(method: string, params: JsonRecord = {}): Promise<CdpResponse> {
    const id = this.nextId++;
    const response = new Promise<CdpResponse>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP request timed out: ${method}`));
      }, 15_000);
      this.pending.set(id, { resolve: resolvePromise, reject, timer });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    const result = response.result?.result as JsonRecord | undefined;
    if (response.result?.exceptionDetails) {
      throw new Error(JSON.stringify(response.result.exceptionDetails));
    }
    if (!result || !("value" in result)) return undefined as T;
    return result.value as T;
  }

  close(): void {
    this.socket.close();
  }
}

interface Session {
  client: DevToolsClient;
  port: number;
  pid: string;
  adbPath: string;
  serial: string;
}

async function main(): Promise<void> {
  const adbPath = resolveAdbPath();
  const devices = adbPath ? listDevices(adbPath) : [];
  const serial = process.env.ANDROID_DEVICE_SERIAL ?? devices[0];
  const apkPath = resolve(process.env.MAP_REPLAY_APK_PATH ?? process.env.MOBILE_RELEASE_APK_PATH ?? defaultReleaseApk);
  const buildType = allowDebugBuild || /(?:^|[\\/])debug(?:[\\/]|\.|$)/iu.test(apkPath) ? "debug" : "release";
  const blockers: string[] = [];

  if (!adbPath) blockers.push("adb is unavailable; set ADB_PATH or ANDROID_SDK_ROOT/ANDROID_HOME");
  if (!serial) blockers.push("no Android reference device is connected");
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
      runs: [],
      blockers,
      observed: null,
    });
    console.error(blockers.map((blocker) => `- ${blocker}`).join("\n"));
    process.exitCode = 2;
    return;
  }

  if (installApk) {
    adb(adbPath!, serial!, ["install", "-r", apkPath]);
  }

  const metadata = readDeviceMetadata(adbPath!, serial!);
  let session = await launchAndConnect(adbPath!, serial!);
  const runs: RunResult[] = [];
  let runIndex = 0;

  for (let index = 0; index < coldRuns; index += 1) {
    session = index === 0 ? session : await restartSession(adbPath!, serial!, session);
    runs.push(await runReplay(session, runIndex++, "cold", index + 1));
  }
  for (let index = 0; index < warmRuns; index += 1) {
    await reloadMap(session.client);
    runs.push(await runReplay(session, runIndex++, "warm", index + 1));
  }

  const observed = aggregate(runs);
  const eligible = buildType === "release" && coldRuns === 3 && warmRuns === 5 && !allowDebugBuild;
  const gatePass = eligible && observed.gatePass;
  const report = {
    schemaVersion: 1,
    status: gatePass ? "passed" : "diagnostic",
    generatedAt: new Date().toISOString(),
    packageId,
    apkPath,
    buildType,
    deviceSerial: serial,
    device: metadata,
    dataVersion: observed.dataVersion,
    renderer: observed.renderer,
    flags: { allFamiliesVisible: observed.allFamiliesVisible, trafficExercised: observed.trafficExercised },
    requiredThresholds: thresholds,
    protocol: {
      coldRuns,
      warmRuns,
      longScenarioDurationMs,
      shortScenarioDurationMs,
      gestureIntervalMs,
      scenarios: scenarioNames(),
      note: "Raw page reports, gfxinfo and memory captures are retained per run; debug/AVD results never satisfy the release reference-device gate.",
    },
    observed,
    runs,
    blockers: gatePass ? [] : [
      ...(buildType !== "release" ? ["diagnostic build; release gate is not claimed"] : []),
      ...(coldRuns !== 3 || warmRuns !== 5 ? ["replay counts differ from the required 3 cold + 5 warm protocol"] : []),
      ...(observed.gatePass ? [] : ["one or more performance/memory thresholds are not proven by this replay"]),
    ],
  };
  await writeReport(report);
  session.client.close();
  try { adb(adbPath!, serial!, ["forward", "--remove", `tcp:${session.port}`]); } catch { /* best effort */ }
  console.log(`Android map replay written to ${defaultReportPath}`);
  console.log(JSON.stringify({ status: report.status, observed }, null, 2));
  if (!gatePass) process.exitCode = 2;
}

async function runReplay(session: Session, run: number, runKind: "cold" | "warm", cycle: number): Promise<RunResult> {
  console.log(`[map-replay] run ${runKind} ${cycle}/${runKind === "cold" ? coldRuns : warmRuns}: WebView connected`);
  await navigateToMap(session.client);
  const scenarios: ScenarioResult[] = [];
  for (const scenario of scenarioNames()) {
    if (requestedScenarios.size && !requestedScenarios.has(scenario)) continue;
    console.log(`[map-replay] ${runKind} ${cycle}: start ${scenario}`);
    try {
      const pageReport = await measureScenario(session.client, scenario);
      scenarios.push({ run, runKind, cycle, scenario, pageReport, mapState: await readMapState(session.client) });
      console.log(`[map-replay] ${runKind} ${cycle}: done ${scenario}`);
    } catch (error) {
      scenarios.push({ run, runKind, cycle, scenario, error: error instanceof Error ? error.message : String(error) });
      console.log(`[map-replay] ${runKind} ${cycle}: failed ${scenario}: ${scenarios[scenarios.length - 1]!.error}`);
    }
  }
  const pageMemory = await readPageMemory(session.client);
  const deviceMemoryRaw = currentDeviceMemory(session.adbPath, session.serial);
  const gfxInfo = currentGfxInfo(session.adbPath, session.serial);
  return {
    run,
    runKind,
    cycle,
    pageMemory,
    deviceMemory: parsePss(deviceMemoryRaw),
    gfxInfo,
    scenarios,
  };
}

async function measureScenario(client: DevToolsClient, scenario: string): Promise<JsonRecord> {
  await prepareScenario(client, scenario);
  await clickDebugButton(client, "Démarrer");
  try {
    switch (scenario) {
      case "regional-open-all-families":
        await ensureAllFamilies(client);
        await sleep(shortScenarioDurationMs);
        break;
      case "pan-horizontal":
        await drag(client, 0.28, 0.50, 0.72, 0.50, longScenarioDurationMs);
        break;
      case "pan-diagonal":
        await drag(client, 0.30, 0.55, 0.70, 0.35, longScenarioDurationMs);
        break;
      case "pinch-z9-z15":
        await pinch(client, true);
        await sleep(shortScenarioDurationMs);
        break;
      case "zoom-z15-z9":
        await zoom(client, true);
        await sleep(250);
        await zoom(client, false);
        await sleep(shortScenarioDurationMs);
        break;
      case "fast-inertia":
        await fastInertia(client);
        await sleep(shortScenarioDurationMs);
        break;
      case "line-selection":
        await selectStationAndLine(client);
        await sleep(shortScenarioDurationMs);
        break;
      case "station-selection":
        await selectStation(client);
        await sleep(shortScenarioDurationMs);
        break;
      case "toggle-bus":
        await clickMode(client, "Bus");
        await sleep(shortScenarioDurationMs);
        break;
      case "all-families":
        await ensureAllFamilies(client);
        await sleep(shortScenarioDurationMs);
        break;
      case "traffic-open-close":
        await toggleTraffic(client);
        await sleep(Math.min(shortScenarioDurationMs, 2_000));
        await toggleTraffic(client);
        await sleep(shortScenarioDurationMs);
        break;
      case "dense-paris":
        await zoom(client, true);
        await drag(client, 0.44, 0.50, 0.56, 0.50, shortScenarioDurationMs);
        await sleep(shortScenarioDurationMs);
        break;
      case "peripheral":
        await clickButton(client, "Recentrer");
        await drag(client, 0.50, 0.50, 0.82, 0.78, shortScenarioDurationMs);
        await sleep(shortScenarioDurationMs);
        break;
      default:
        throw new Error(`Unknown replay scenario: ${scenario}`);
    }
  } finally {
    await clickDebugButton(client, "Arrêter");
  }
  return waitForJsonReport(client);
}

async function prepareScenario(client: DevToolsClient, scenario: string): Promise<void> {
  if (scenario !== "regional-open-all-families" && scenario !== "toggle-bus" && scenario !== "all-families") {
    await clickButton(client, "Recentrer");
  }
  await ensureAllFamilies(client);
  await dispatchKey(client, "Escape");
  await sleep(100);
}

async function navigateToMap(client: DevToolsClient): Promise<void> {
  const url = await client.evaluate<string>("location.href");
  if (!url.includes("/map?") || !url.includes("mapDebug=1")) {
    const target = await client.evaluate<string>(
      `(() => {
        for (const base of [document.baseURI, location.href, location.origin ? location.origin + '/' : '', 'http://localhost/']) {
          try { return new URL('/map?mapDebug=1', base).href; } catch { /* try the next WebView base */ }
        }
        return 'http://localhost/map?mapDebug=1';
      })()`,
    );
    await client.evaluate(`location.replace(${JSON.stringify(target)})`);
  } else {
    // Capacitor preserves the last URL across force-stop. Reload it so a
    // stale blank WebView document cannot make a replay look like a product
    // failure after an APK install.
    await client.send("Page.reload", { ignoreCache: false });
  }
  await waitForMap(client);
  await ensureAllFamilies(client);
}

async function reloadMap(client: DevToolsClient): Promise<void> {
  console.log("[map-replay] reload map");
  await client.send("Page.reload", { ignoreCache: false });
  await waitForMap(client);
}

async function waitForMap(client: DevToolsClient): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  let lastState = "";
  while (Date.now() < deadline) {
    try {
      const state = await readMapState(client);
      lastState = JSON.stringify(state);
      if (state.error) throw new Error(String(state.error));
      if (state.debugPanel && state.canvas && !state.loading && state.lines && state.stations) return;
    } catch (error) {
      lastState = error instanceof Error ? error.message : String(error);
    }
    await sleep(250);
  }
  const page = await client.evaluate(`({ href: location.href, base: document.baseURI, title: document.title, body: document.body?.innerText?.slice(0, 240) })`);
  throw new Error(`Map did not become ready: ${lastState}; page=${JSON.stringify(page)}`);
}

async function readMapState(client: DevToolsClient): Promise<JsonRecord> {
  return client.evaluate<JsonRecord>(`(() => {
    const root = document.querySelector('.global-transport-plan');
    const canvas = document.querySelector('.global-transport-plan__canvas');
    const status = document.querySelector('.global-transport-plan__subtitle')?.textContent ?? '';
    const chips = [...document.querySelectorAll('.mode-chip:not(.mode-chip--all)')].map((button) => ({
      label: button.textContent?.trim() ?? '',
      pressed: button.getAttribute('aria-pressed') === 'true',
      disabled: button.disabled,
    }));
    return {
      debugPanel: Boolean(document.querySelector('[data-global-map-debug]')),
      canvas: Boolean(canvas),
      loading: Boolean(document.querySelector('.map-notice[role="status"]')),
      error: document.querySelector('.map-notice[role="alert"]')?.textContent?.trim() || undefined,
      lines: /lignes/i.test(status) ? status : undefined,
      stations: /stations/i.test(status) ? status : undefined,
      allFamiliesVisible: chips.filter((chip) => !chip.disabled).every((chip) => chip.pressed),
      selectedModes: chips.filter((chip) => chip.pressed).map((chip) => chip.label),
      canvasRect: canvas ? (() => { const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })() : undefined,
    };
  })()`);
}

async function readPageMemory(client: DevToolsClient): Promise<JsonRecord | undefined> {
  return client.evaluate<JsonRecord | undefined>(`(() => {
    const memory = performance.memory;
    return memory ? { usedJsHeapSize: memory.usedJSHeapSize, totalJsHeapSize: memory.totalJSHeapSize, jsHeapSizeLimit: memory.jsHeapSizeLimit } : undefined;
  })()`);
}

async function clickDebugButton(client: DevToolsClient, label: string): Promise<void> {
  await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('[data-global-map-debug] button')].find((candidate) => candidate.textContent?.trim().startsWith(${JSON.stringify(label)}));
    if (!button) throw new Error(${JSON.stringify(`debug button not found: ${label}`)});
    button.click();
  })()`);
  if (label === "Arrêter") await sleep(120);
}

async function waitForJsonReport(client: DevToolsClient): Promise<JsonRecord> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const raw = await client.evaluate<string>("document.querySelector('.global-map-debug__json')?.textContent ?? ''");
    if (raw) {
      try { return JSON.parse(raw) as JsonRecord; } catch { /* wait for Vue to flush */ }
    }
    await sleep(100);
  }
  throw new Error("debug performance JSON was not rendered");
}

async function ensureAllFamilies(client: DevToolsClient): Promise<void> {
  await client.evaluate(`(() => {
    const button = document.querySelector('.mode-chip--all');
    if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
  })()`);
  await sleep(120);
}

async function clickMode(client: DevToolsClient, label: string): Promise<void> {
  await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('.mode-chip:not(.mode-chip--all)')].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
    if (!button || button.disabled) throw new Error(${JSON.stringify(`mode not available: ${label}`)});
    button.click();
  })()`);
  await sleep(120);
}

async function toggleTraffic(client: DevToolsClient): Promise<void> {
  await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('.global-transport-plan__actions button')].find((candidate) => /Afficher le trafic|^Trafic/i.test(candidate.textContent?.trim() ?? ''));
    if (!button) throw new Error('traffic button not found');
    button.click();
  })()`);
  await sleep(350);
}

async function clickButton(client: DevToolsClient, label: string): Promise<void> {
  await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
    if (!button) throw new Error(${JSON.stringify(`button not found: ${label}`)});
    button.click();
  })()`);
  await sleep(140);
}

async function dispatchKey(client: DevToolsClient, key: string): Promise<void> {
  await client.evaluate(`(() => {
    const root = document.querySelector('.global-transport-plan');
    if (!root) throw new Error('map root not found');
    root.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }));
  })()`);
}

async function selectStation(client: DevToolsClient): Promise<void> {
  await dispatchKey(client, "Tab");
  await dispatchKey(client, "Enter");
  await sleep(180);
}

async function selectStationAndLine(client: DevToolsClient): Promise<void> {
  await selectStation(client);
  await client.evaluate(`(() => {
    const line = document.querySelector('.line-pill');
    if (!line) throw new Error('no visible line pill for station selection');
    line.click();
  })()`);
  await sleep(180);
}

async function canvasRect(client: DevToolsClient): Promise<{ left: number; top: number; width: number; height: number }> {
  const state = await readMapState(client);
  const rect = state.canvasRect as { left: number; top: number; width: number; height: number } | undefined;
  if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error("map canvas has no viewport");
  return rect;
}

async function drag(client: DevToolsClient, fromX: number, fromY: number, toX: number, toY: number, durationMs: number): Promise<void> {
  const rect = await canvasRect(client);
  const start = { x: rect.left + rect.width * fromX, y: rect.top + rect.height * fromY };
  const end = { x: rect.left + rect.width * toX, y: rect.top + rect.height * toY };
  await mouse(client, "mouseMoved", start.x, start.y, 0);
  await mouse(client, "mousePressed", start.x, start.y, 1);
  const steps = Math.max(2, Math.ceil(durationMs / gestureIntervalMs));
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    await mouse(client, "mouseMoved", start.x + (end.x - start.x) * progress, start.y + (end.y - start.y) * progress, 1);
    await sleep(gestureIntervalMs);
  }
  await mouse(client, "mouseReleased", end.x, end.y, 0);
}

async function fastInertia(client: DevToolsClient): Promise<void> {
  const rect = await canvasRect(client);
  const x = rect.left + rect.width * 0.5;
  const y = rect.top + rect.height * 0.5;
  await mouse(client, "mousePressed", x, y, 1);
  for (let index = 1; index <= 5; index += 1) {
    await mouse(client, "mouseMoved", x + index * 32, y - index * 8, 1);
    await sleep(20);
  }
  await mouse(client, "mouseReleased", x + 160, y - 40, 0);
}

async function zoom(client: DevToolsClient, inwards: boolean): Promise<void> {
  const rect = await canvasRect(client);
  const x = rect.left + rect.width * 0.5;
  const y = rect.top + rect.height * 0.5;
  const deltaY = inwards ? -250 : 250;
  for (let index = 0; index < 14; index += 1) {
    await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY });
    await sleep(35);
  }
}

async function pinch(client: DevToolsClient, inwards: boolean): Promise<void> {
  const rect = await canvasRect(client);
  const cx = rect.left + rect.width * 0.5;
  const cy = rect.top + rect.height * 0.5;
  const startDistance = 10;
  const endDistance = 1_280;
  const from = inwards ? startDistance : endDistance;
  const to = inwards ? endDistance : startDistance;
  const point = (distance: number, sign: number) => ({ x: cx + sign * distance / 2, y: cy, id: sign > 0 ? 1 : 2, radiusX: 1, radiusY: 1, force: 1 });
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(from, -1), point(from, 1)] });
  const steps = 40;
  for (let index = 1; index <= steps; index += 1) {
    const distance = from + (to - from) * index / steps;
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(distance, -1), point(distance, 1)] });
    await sleep(Math.max(12, Math.round(shortScenarioDurationMs / steps)));
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function mouse(client: DevToolsClient, type: string, x: number, y: number, buttons: number): Promise<void> {
  await client.send("Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button: type === "mousePressed" || type === "mouseReleased" ? "left" : "none",
    buttons,
    clickCount: 1,
  });
}

async function launchAndConnect(adbPath: string, serial: string): Promise<Session> {
  adb(adbPath, serial, ["shell", "am", "force-stop", packageId]);
  adb(adbPath, serial, ["shell", "am", "start", "-n", activity]);
  const pid = await waitForPid(adbPath, serial);
  const port = await freePort();
  adb(adbPath, serial, ["forward", `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`]);
  const target = await waitForTarget(port);
  const client = await DevToolsClient.connect(target.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await waitForWebViewDocument(client);
  return { client, port, pid, adbPath, serial };
}

async function waitForWebViewDocument(client: DevToolsClient): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const document = await client.evaluate<{ href?: string; readyState?: string }>(
      "({ href: location.href, readyState: document.readyState })",
    );
    if (document.href && document.href !== "about:blank" && document.readyState !== "loading") return;
    await sleep(250);
  }
  throw new Error("WebView document stayed at about:blank");
}

async function restartSession(adbPath: string, serial: string, previous: Session): Promise<Session> {
  previous.client.close();
  try { adb(adbPath, serial, ["forward", "--remove", `tcp:${previous.port}`]); } catch { /* best effort */ }
  return launchAndConnect(adbPath, serial);
}

async function waitForPid(adbPath: string, serial: string): Promise<string> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    let raw = "";
    try {
      raw = adb(adbPath, serial, ["shell", "pidof", packageId]);
    } catch {
      raw = "";
    }
    const pid = raw.trim().split(/\s+/u)[0];
    if (pid) return pid;
    await sleep(250);
  }
  throw new Error(`application process did not start: ${packageId}`);
}

async function waitForTarget(port: number): Promise<CdpTarget> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await response.json() as CdpTarget[];
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* WebView is still starting */ }
    await sleep(250);
  }
  throw new Error(`WebView CDP target did not appear on port ${port}`);
}

function listDevices(adbPath: string): string[] {
  return adb(adbPath, undefined, ["devices", "-l"])
    .split(/\r?\n/u)
    .filter((line) => /^\s*\S+\s+device(?:\s|$)/u.test(line))
    .map((line) => line.split(/\s+/u)[0]!)
    .filter(Boolean);
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

function currentDeviceMemory(adbPath: string, serial: string): string {
  try {
    return adb(adbPath, serial, ["shell", "dumpsys", "meminfo", packageId]);
  } catch {
    return "";
  }
}

function currentGfxInfo(adbPath: string, serial: string): string {
  try {
    return adb(adbPath, serial, ["shell", "dumpsys", "gfxinfo", packageId, "framestats"]);
  } catch {
    return "";
  }
}

function parsePss(raw: string): { totalPssKb?: number; raw: string } {
  const match = raw.match(/TOTAL\s+PSS:\s+(\d+)/iu);
  return { totalPssKb: match ? Number(match[1]) : undefined, raw };
}

function aggregate(runs: RunResult[]): JsonRecord & { gatePass: boolean } {
  const pageReports = runs.flatMap((run) => run.scenarios.map((scenario) => scenario.pageReport).filter((report): report is JsonRecord => Boolean(report)));
  const numeric = (key: string) => pageReports.map((report) => Number(report[key])).filter(Number.isFinite);
  const min = (values: number[]) => values.length ? Math.min(...values) : undefined;
  const max = (values: number[]) => values.length ? Math.max(...values) : undefined;
  const median = (values: number[]) => {
    if (!values.length) return undefined;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.5) - 1)];
  };
  const ratios = numeric("deliveredFrameRatio");
  const medians = numeric("medianFrameTimeMs");
  const p95 = numeric("p95FrameTimeMs");
  const p99 = numeric("p99FrameTimeMs");
  const over50 = numeric("framesOver50Ms");
  const longTasks = numeric("longTasksOver50Ms");
  const memoryCycles = runs.filter((run) => run.runKind === "warm").map((run) => run.deviceMemory?.totalPssKb).filter((value): value is number => Number.isFinite(value));
  const continuousMemoryGrowth = memoryCycles.length >= thresholds.memoryCycles && memoryCycles.every((value, index) => index === 0 || value > memoryCycles[index - 1]!);
  const allFamiliesVisible = runs
    .flatMap((run) => run.scenarios
      .filter((scenario) => scenario.scenario === "regional-open-all-families" || scenario.scenario === "all-families")
      .map((scenario) => scenario.mapState?.allFamiliesVisible))
    .filter((value): value is boolean => typeof value === "boolean");
  const trafficExercised = runs.some((run) => run.scenarios.some((scenario) => scenario.scenario === "traffic-open-close" && !scenario.error));
  const dataVersions = pageReports.map((report) => (report.metadata as JsonRecord | undefined)?.dataVersion).filter((value): value is string => typeof value === "string");
  const renderers = pageReports.map((report) => (report.lastRenderer as JsonRecord | undefined)?.renderer).filter((value): value is string => typeof value === "string");
  const observed = {
    reportCount: pageReports.length,
    deliveredFrameRatioMin: min(ratios),
    medianFrameTimeMsMedian: median(medians),
    p95FrameTimeMsMax: max(p95),
    p99FrameTimeMsMax: max(p99),
    framesOver50MsMax: max(over50),
    longTasksOver50MsMax: max(longTasks),
    memoryCyclesPssKb: memoryCycles,
    memoryGrowthPssKb: memoryCycles.length >= 2 ? memoryCycles[memoryCycles.length - 1]! - memoryCycles[0]! : undefined,
    continuousMemoryGrowth,
    allFamiliesVisible: allFamiliesVisible.length > 0 && allFamiliesVisible.every(Boolean),
    trafficExercised,
    dataVersion: dataVersions[0],
    renderer: renderers[0],
  };
  const gatePass = Boolean(
    observed.reportCount > 0 &&
    observed.deliveredFrameRatioMin !== undefined && observed.deliveredFrameRatioMin >= thresholds.deliveredFrameRatioMin &&
    observed.medianFrameTimeMsMedian !== undefined && observed.medianFrameTimeMsMedian <= thresholds.medianFrameTimeMsMax &&
    observed.p95FrameTimeMsMax !== undefined && observed.p95FrameTimeMsMax <= thresholds.p95FrameTimeMsMax &&
    observed.p99FrameTimeMsMax !== undefined && observed.p99FrameTimeMsMax <= thresholds.p99FrameTimeMsMax &&
    (observed.framesOver50MsMax ?? Number.POSITIVE_INFINITY) === 0 &&
    (observed.longTasksOver50MsMax ?? Number.POSITIVE_INFINITY) === 0 &&
    observed.allFamiliesVisible &&
    !observed.continuousMemoryGrowth,
  );
  return { ...observed, gatePass };
}

async function writeReport(report: unknown): Promise<void> {
  const reportPath = resolve(process.env.MAP_REPLAY_OUTPUT ?? defaultReportPath);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const rawPath = resolve(process.env.MAP_REPLAY_RAW_OUTPUT ?? resolve(defaultRawDirectory, `${new Date().toISOString().replace(/[:.]/gu, "-")}-android-map.json`));
  await mkdir(dirname(rawPath), { recursive: true });
  await writeFile(rawPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address() as AddressInfo;
  const port = address.port;
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  return port;
}

function adb(adbPath: string, serial: string | undefined, args: string[]): string {
  const fullArgs = serial && args[0] !== "devices" ? ["-s", serial, ...args] : args;
  return execFileSync(adbPath, fullArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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
