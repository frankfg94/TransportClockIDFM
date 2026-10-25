import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertReadableFile,
  assertValidatedArtifact,
  getReleaseSource,
  getApkSignerCertificateSha256,
  getVersionCode,
  getVersionName,
  gradleCommand,
  isOversizeApproved,
  mobileReleaseManifestPath,
  mobileReleaseOutputDir,
  mobileReleaseProvenancePath,
  projectRoot,
  requireEnv,
  run,
} from "./common";
import { createAndroidReleaseManifest } from "./releaseMetadata";
import { releaseConfiguration, sha256 } from "./sourceSnapshot";

async function main(): Promise<void> {
  const source = getReleaseSource();
  const { sourceRevision } = source;
  releaseConfiguration();
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
    NODE_ENV: "production",
    CAPACITOR_BUILD: "true",
    CAPACITOR_LIVE_RELOAD: "false",
    CF_PAGES_COMMIT_SHA: sourceRevision,
    NUXT_BUILD_DIR: ".nuxt-mobile-release",
    NUXT_PUBLIC_API_BASE_URL: apiBaseUrl,
    NUXT_PUBLIC_APP_SOURCE_REVISION: sourceRevision,
  };
  // Avoid changing the shared dev server's .nuxt directory.
  run(process.execPath, [join(projectRoot, "node_modules/nuxt/bin/nuxt.mjs"), "generate"], buildEnvironment);
  run(process.execPath, [join(projectRoot, "node_modules/@capacitor/cli/bin/capacitor"), "sync", "android"], buildEnvironment);
  run(gradleCommand(), [
    "assembleRelease",
    `-PMOBILE_RELEASE_VERSION_CODE=${versionCode}`,
    `-PMOBILE_RELEASE_VERSION_NAME=${versionName}`,
  ], undefined, join(projectRoot, "android"));

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
  if (source.snapshot) {
    manifest.sourceKind = "worktree-snapshot";
    manifest.baseCommit = source.snapshot.baseCommit;
    manifest.snapshotSha256 = source.snapshot.snapshotSha256;
  }
  if (manifest.sizeBytes > 25 * 1024 * 1024 && isOversizeApproved()) {
    manifest.oversizeApproved = true;
  }
  await writeFile(mobileReleaseManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assertValidatedArtifact({
    manifest,
    apkPath,
    expectedRevision: sourceRevision,
    approveOversize: isOversizeApproved(),
    expectedCertificateSha256: process.env.MOBILE_RELEASE_EXPECTED_CERTIFICATE_SHA256,
  });
  const after = getReleaseSource();
  if (after.sourceRevision !== sourceRevision) throw new Error("Sources changed during build.");
  if (source.snapshot) {
    const provenance = { schemaVersion: 1, snapshot: source.snapshot, artifact: manifest, manifestSha256: sha256(JSON.stringify(manifest)) };
    await writeFile(mobileReleaseProvenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  }

  console.log(`APK validée : ${apkPath}`);
  console.log(`Manifest : ${mobileReleaseManifestPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
