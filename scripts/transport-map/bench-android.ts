import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");
const defaultApkPath = resolve(projectRoot, "android/app/build/outputs/apk/release/app-release.apk");
const reportPath = resolve(projectRoot, "reports/global-map/performance-android-latest.json");

async function main(): Promise<void> {
  const blockers: string[] = [];
  const apkPath = process.env.MOBILE_RELEASE_APK_PATH ?? defaultApkPath;
  if (!existsSync(apkPath)) blockers.push(`release APK missing: ${apkPath}`);
  else if (existsSync(resolve(projectRoot, "public/data/global-map/v1/manifest.json"))) {
    const apkTime = statSync(apkPath).mtimeMs;
    const manifestTime = statSync(resolve(projectRoot, "public/data/global-map/v1/manifest.json")).mtimeMs;
    if (apkTime < manifestTime) blockers.push("release APK predates the current global-map assets; rebuild the signed release APK");
  }

  const adbPath = resolveAdbPath();
  if (!adbPath) {
    blockers.push("adb is unavailable; set ADB_PATH or ANDROID_SDK_ROOT/ANDROID_HOME");
  }

  let devices: string[] = [];
  if (adbPath) {
    try {
      devices = execFileSync(adbPath, ["devices", "-l"], { encoding: "utf8" })
        .split(/\r?\n/u)
        .filter((line) => /^\s*\S+\s+device(?:\s|$)/u.test(line));
    } catch (error) {
      blockers.push(`adb devices failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (devices.length === 0) blockers.push("no Android reference device is connected");

  const report = {
    schemaVersion: 1,
    status: blockers.length ? "blocked" : "ready-for-device-replay",
    generatedAt: new Date().toISOString(),
    apkPath,
    adbPath,
    devices,
    requiredThresholds: {
      deliveredFrameRatioMin: 0.98,
      medianFrameTimeMsMax: 16.7,
      p95FrameTimeMsMax: 18,
      p99FrameTimeMsMax: 25,
      longFrameMsMax: 50,
      memoryCycles: 5,
    },
    observed: null,
    blockers,
    nextStep: blockers.length
      ? "Configure the signed release APK and connect the reference device, then rerun this command before the deterministic replay."
      : "The prerequisite check passed; execute the mapDebug replay and attach the exported JSON plus dumpsys/Perfetto captures.",
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Android benchmark prerequisite report written to ${reportPath}`);
  if (blockers.length) {
    console.error(blockers.map((blocker) => `- ${blocker}`).join("\n"));
    process.exitCode = 2;
  }
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

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
