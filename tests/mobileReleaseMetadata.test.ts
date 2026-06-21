import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertApkSize,
  assertCleanGitStatus,
  assertValidatedArtifact,
  loadMobileReleaseEnvironment,
} from "../scripts/mobile-release/common";
import {
  MAX_ANDROID_APK_BYTES,
  normalizeSha256,
  type AndroidReleaseManifest,
} from "../scripts/mobile-release/releaseMetadata";

const revision = "a".repeat(40);
const certificate = "b".repeat(64);

async function artifactFixture(): Promise<{
  directory: string;
  apkPath: string;
  manifest: AndroidReleaseManifest;
}> {
  const directory = await mkdtemp(join(tmpdir(), "mobile-release-test-"));
  const apkPath = join(directory, "transport-clock-idfm.apk");
  const bytes = Buffer.from("signed-apk-fixture");
  await writeFile(apkPath, bytes);
  return {
    directory,
    apkPath,
    manifest: {
      schemaVersion: 1,
      platform: "android",
      sourceRevision: revision,
      versionName: "0.1.0+1",
      versionCode: 1,
      builtAt: "2026-06-21T09:00:00.000Z",
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      minSdk: 24,
      objectKey: `mobile-releases/android/${revision}/transport-clock-idfm.apk`,
      fileName: "transport-clock-idfm.apk",
      signingCertificateSha256: certificate,
      oversizeApproved: false,
    },
  };
}

describe("mobile release validation", () => {
  it("normalizes a release certificate fingerprint", () => {
    expect(normalizeSha256("AA:BB " + "c".repeat(60))).toBe("aabb" + "c".repeat(60));
  });

  it("blocks an oversize APK until explicitly approved", () => {
    expect(() => assertApkSize(MAX_ANDROID_APK_BYTES + 1, false)).toThrow("--approve-oversize");
    expect(() => assertApkSize(MAX_ANDROID_APK_BYTES + 1, true)).not.toThrow();
  });

  it("refuses a dirty worktree before a build or upload", () => {
    expect(() => assertCleanGitStatus(" M package.json")).toThrow("arborescence Git propre");
  });

  it("loads the local release file without overriding CI or shell variables", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mobile-release-env-"));
    const envPath = join(directory, ".env.mobile-release");
    try {
      await writeFile(envPath, "MOBILE_RELEASE_VERSION_CODE=1001\nEXTRA_VALUE='with spaces'\n");
      const target: NodeJS.ProcessEnv = { MOBILE_RELEASE_VERSION_CODE: "2000" };
      loadMobileReleaseEnvironment(envPath, target);

      expect(target).toMatchObject({
        MOBILE_RELEASE_VERSION_CODE: "2000",
        EXTRA_VALUE: "with spaces",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects an APK whose manifest SHA or commit is inconsistent", async () => {
    const fixture = await artifactFixture();
    try {
      await expect(assertValidatedArtifact({
        manifest: { ...fixture.manifest, sha256: "c".repeat(64) },
        apkPath: fixture.apkPath,
        expectedRevision: revision,
        expectedCertificateSha256: certificate,
        approveOversize: false,
        verifySignature: async () => undefined,
      })).rejects.toThrow("SHA-256");
      await expect(assertValidatedArtifact({
        manifest: fixture.manifest,
        apkPath: fixture.apkPath,
        expectedRevision: "d".repeat(40),
        expectedCertificateSha256: certificate,
        approveOversize: false,
        verifySignature: async () => undefined,
      })).rejects.toThrow("commit");
    } finally {
      await rm(fixture.directory, { force: true, recursive: true });
    }
  });

  it("fails an invalid signature before an upload", async () => {
    const fixture = await artifactFixture();
    try {
      await expect(assertValidatedArtifact({
        manifest: fixture.manifest,
        apkPath: fixture.apkPath,
        expectedRevision: revision,
        expectedCertificateSha256: certificate,
        approveOversize: false,
        verifySignature: async () => {
          throw new Error("signature invalide");
        },
      })).rejects.toThrow("signature invalide");
    } finally {
      await rm(fixture.directory, { force: true, recursive: true });
    }
  });
});
