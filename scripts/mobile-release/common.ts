import { execFileSync } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { constants, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANDROID_MIN_SDK,
  MAX_ANDROID_APK_BYTES,
  MOBILE_RELEASES_PREFIX,
  type AndroidReleaseManifest,
  isSourceRevision,
  normalizeSha256,
  sha256File,
} from "./releaseMetadata";

export const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const mobileReleaseOutputDir = join(projectRoot, "dist", "mobile-release");
export const mobileReleaseManifestPath = join(mobileReleaseOutputDir, "manifest.json");
export const mobileReleaseEnvPath = join(projectRoot, ".env.mobile-release");

// Local publishing should be as ergonomic as the CI workflow. Environment
// variables explicitly supplied by the shell or GitHub Actions always win.
loadMobileReleaseEnvironment();

export function loadMobileReleaseEnvironment(
  path = mobileReleaseEnvPath,
  target: NodeJS.ProcessEnv = process.env,
): void {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match || target[match[1]] !== undefined) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/u, "").trim();
    }
    target[match[1]] = value;
  }
}

export function getArgument(name: string): boolean {
  return process.argv.includes(name);
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} est requis.`);
  return value;
}

export function run(
  command: string,
  args: string[],
  environment?: NodeJS.ProcessEnv,
  cwd = projectRoot,
): void {
  execFileSync(command, args, {
    cwd,
    env: environment ?? process.env,
    stdio: "inherit",
    shell: isWindowsBatchFile(command),
  });
}

export function runOutput(command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
  }).trim();
}

export function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function npxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

export function gradleCommand(): string {
  return process.platform === "win32"
    ? join(projectRoot, "android", "gradlew.bat")
    : join(projectRoot, "android", "gradlew");
}

export function assertCleanGitWorktree(): void {
  const status = runOutput("git", ["status", "--porcelain", "--untracked-files=normal"]);
  assertCleanGitStatus(status);
}

export function assertCleanGitStatus(status: string): void {
  if (status.trim()) {
    throw new Error(
      "La publication APK exige une arborescence Git propre. Committez ou mettez de côté les modifications avant de relancer.",
    );
  }
}

export function getCurrentSourceRevision(): string {
  const revision = runOutput("git", ["rev-parse", "HEAD"]).toLowerCase();
  if (!isSourceRevision(revision)) throw new Error("Impossible de déterminer le SHA de commit Git.");
  return revision;
}

export function getVersionCode(): number {
  const value = Number.parseInt(requireEnv("MOBILE_RELEASE_VERSION_CODE"), 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("MOBILE_RELEASE_VERSION_CODE doit être un entier positif.");
  }
  return value;
}

export function getVersionName(versionCode: number): string {
  if (process.env.MOBILE_RELEASE_VERSION_NAME?.trim()) {
    return process.env.MOBILE_RELEASE_VERSION_NAME.trim();
  }
  const packageVersion = JSON.parse(
    readFileSync(join(projectRoot, "package.json"), "utf8"),
  ).version as string;
  return `${packageVersion}+${versionCode}`;
}

export function isOversizeApproved(): boolean {
  return getArgument("--approve-oversize");
}

export function assertApkSize(sizeBytes: number, approved: boolean): void {
  if (sizeBytes > MAX_ANDROID_APK_BYTES && !approved) {
    throw new Error(
      `APK trop volumineuse (${formatBytes(sizeBytes)}). La limite est ${formatBytes(MAX_ANDROID_APK_BYTES)}. Relancez exceptionnellement avec --approve-oversize.`,
    );
  }
}

export async function assertReadableFile(path: string): Promise<void> {
  await access(path, constants.R_OK);
}

export async function readManifest(path = mobileReleaseManifestPath): Promise<AndroidReleaseManifest> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`Manifest Android invalide ou absent : ${path}`);
  }
  return raw as AndroidReleaseManifest;
}

export async function assertValidatedArtifact(input: {
  manifest: AndroidReleaseManifest;
  apkPath: string;
  expectedRevision: string;
  expectedCertificateSha256?: string;
  approveOversize: boolean;
  verifySignature?: (apkPath: string, expectedCertificateSha256: string) => Promise<void>;
}): Promise<void> {
  const { manifest } = input;
  const expectedCertificateSha256 = normalizeSha256(
    input.expectedCertificateSha256 ?? manifest.signingCertificateSha256,
  );
  const expectedRevision = input.expectedRevision.toLowerCase();

  if (
    manifest.schemaVersion !== 1 ||
    manifest.platform !== "android" ||
    manifest.sourceRevision !== expectedRevision ||
    !isSourceRevision(manifest.sourceRevision) ||
    !Number.isSafeInteger(manifest.versionCode) ||
    manifest.versionCode < 1 ||
    !manifest.versionName?.trim() ||
    manifest.minSdk !== ANDROID_MIN_SDK ||
    manifest.objectKey !== `${MOBILE_RELEASES_PREFIX}/${expectedRevision}/${manifest.fileName}` ||
    !/^[a-zA-Z0-9._-]+\.apk$/u.test(manifest.fileName) ||
    normalizeSha256(manifest.signingCertificateSha256) !== expectedCertificateSha256 ||
    typeof manifest.oversizeApproved !== "boolean"
  ) {
    throw new Error("Le manifest Android ne correspond pas au commit ou au certificat de signature attendu.");
  }

  await assertReadableFile(input.apkPath);
  const apkStats = await stat(input.apkPath);
  assertApkSize(apkStats.size, input.approveOversize);
  if (manifest.oversizeApproved !== (apkStats.size > MAX_ANDROID_APK_BYTES)) {
    throw new Error("Le manifest doit indiquer explicitement l’exception de taille de l’APK.");
  }

  if (manifest.sizeBytes !== apkStats.size || manifest.sha256 !== await sha256File(input.apkPath)) {
    throw new Error("L’APK ne correspond pas à sa taille ou à son SHA-256 dans le manifest.");
  }

  await (input.verifySignature ?? assertApkSignerCertificate)(
    input.apkPath,
    expectedCertificateSha256,
  );
}

export async function assertApkSignerCertificate(
  apkPath: string,
  expectedCertificateSha256: string,
): Promise<void> {
  const certificateSha256 = await getApkSignerCertificateSha256(apkPath);
  if (certificateSha256 !== normalizeSha256(expectedCertificateSha256)) {
    throw new Error("Le certificat de signature de l’APK ne correspond pas au manifest attendu.");
  }
}

export async function getApkSignerCertificateSha256(
  apkPath: string,
): Promise<string> {
  const apksigner = await findApkSigner();
  let output: string;
  try {
    output = execFileSync(apksigner, ["verify", "--verbose", "--print-certs", apkPath], {
      cwd: projectRoot,
      encoding: "utf8",
      shell: isWindowsBatchFile(apksigner),
    });
  } catch {
    throw new Error("La signature APK est invalide (apksigner verify a échoué).");
  }

  const match = output.match(/certificate SHA-256 digest:\s*([a-fA-F0-9:]+)/iu);
  if (!match) {
    throw new Error("Impossible de lire l’empreinte du certificat de signature APK.");
  }
  return normalizeSha256(match[1]);
}

async function findApkSigner(): Promise<string> {
  if (process.env.ANDROID_APKSIGNER_PATH) return process.env.ANDROID_APKSIGNER_PATH;
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdk) return process.platform === "win32" ? "apksigner.bat" : "apksigner";

  const { readdir } = await import("node:fs/promises");
  const buildTools = join(sdk, "build-tools");
  const versions = (await readdir(buildTools)).sort().reverse();
  const executable = process.platform === "win32" ? "apksigner.bat" : "apksigner";
  for (const version of versions) {
    const candidate = join(buildTools, version, executable);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue until a usable Android build-tools installation is found.
    }
  }
  return executable;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} Mio`;
}

function isWindowsBatchFile(command: string): boolean {
  return process.platform === "win32" && /\.(?:bat|cmd)$/iu.test(command);
}
