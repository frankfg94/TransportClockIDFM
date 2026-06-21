import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertCleanGitWorktree,
  assertReadableFile,
  assertValidatedArtifact,
  getCurrentSourceRevision,
  getApkSignerCertificateSha256,
  getVersionCode,
  getVersionName,
  gradleCommand,
  isOversizeApproved,
  mobileReleaseManifestPath,
  mobileReleaseOutputDir,
  npxCommand,
  projectRoot,
  requireEnv,
  run,
} from "./common";
import { createAndroidReleaseManifest } from "./releaseMetadata";

async function main(): Promise<void> {
  assertCleanGitWorktree();
  const sourceRevision = getCurrentSourceRevision();
  const versionCode = getVersionCode();
  const versionName = getVersionName(versionCode);
  const apiBaseUrl = requireEnv("NUXT_PUBLIC_API_BASE_URL");
  const keystorePath = requireEnv("MOBILE_RELEASE_KEYSTORE_PATH");
  requireEnv("MOBILE_RELEASE_KEYSTORE_PASSWORD");
  requireEnv("MOBILE_RELEASE_KEY_ALIAS");
  requireEnv("MOBILE_RELEASE_KEY_PASSWORD");
  await assertReadableFile(keystorePath);

  const buildEnvironment = {
    ...process.env,
    CAPACITOR_BUILD: "true",
    NUXT_PUBLIC_API_BASE_URL: apiBaseUrl,
    NUXT_PUBLIC_APP_SOURCE_REVISION: sourceRevision,
  };
  run(npxCommand(), ["nuxt", "generate"], buildEnvironment);
  run(npxCommand(), ["cap", "sync", "android"], buildEnvironment);
  run(gradleCommand(), [
    "assembleRelease",
    `-PMOBILE_RELEASE_VERSION_CODE=${versionCode}`,
    `-PMOBILE_RELEASE_VERSION_NAME=${versionName}`,
  ]);

  const generatedApk = join(
    projectRoot,
    "android",
    "app",
    "build",
    "outputs",
    "apk",
    "release",
    "app-release.apk",
  );
  await assertReadableFile(generatedApk);

  const fileName = `transport-clock-idfm-${sourceRevision}-v${versionCode}.apk`;
  const apkPath = join(mobileReleaseOutputDir, fileName);
  await mkdir(mobileReleaseOutputDir, { recursive: true });
  await cp(generatedApk, apkPath);
  const signingCertificateSha256 = await getApkSignerCertificateSha256(apkPath);

  const manifest = await createAndroidReleaseManifest({
    apkPath,
    sourceRevision,
    versionName,
    versionCode,
    signingCertificateSha256,
    oversizeApproved: false,
  });
  if (manifest.sizeBytes > 25 * 1024 * 1024 && isOversizeApproved()) {
    manifest.oversizeApproved = true;
  }
  await writeFile(mobileReleaseManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assertValidatedArtifact({
    manifest,
    apkPath,
    expectedRevision: sourceRevision,
    approveOversize: isOversizeApproved(),
  });

  console.log(`APK validée : ${apkPath}`);
  console.log(`Manifest : ${mobileReleaseManifestPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
