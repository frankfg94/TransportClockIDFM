import { describe, expect, it } from "vitest";
import {
  findAndroidRelease,
  getAndroidDownloadHeaders,
  getAndroidReleaseStatus,
  type AndroidReleaseManifest,
  type R2BucketLike,
} from "../server/services/mobileRelease/androidRelease";

const revision = "a".repeat(40);
const otherRevision = "b".repeat(40);

function manifest(overrides: Partial<AndroidReleaseManifest> = {}): AndroidReleaseManifest {
  const fileName = "transport-clock-idfm.apk";
  return {
    schemaVersion: 1,
    platform: "android",
    sourceRevision: revision,
    versionName: "0.1.0+42",
    versionCode: 42,
    builtAt: "2026-06-21T09:00:00.000Z",
    sizeBytes: 1_024,
    sha256: "c".repeat(64),
    minSdk: 24,
    objectKey: `mobile-releases/android/${revision}/${fileName}`,
    fileName,
    signingCertificateSha256: "d".repeat(64),
    oversizeApproved: false,
    ...overrides,
  };
}

function bucketFor(payload: unknown): R2BucketLike {
  return {
    async get() {
      return {
        body: new ReadableStream(),
        size: 1_024,
        text: async () => JSON.stringify(payload),
      };
    },
  };
}

describe("Android mobile release runtime", () => {
  it("reports the missing binding without exposing a download", async () => {
    await expect(findAndroidRelease(undefined, revision)).resolves.toEqual({
      available: false,
      reason: "not-configured",
    });
  });

  it("rejects an invalid manifest", async () => {
    await expect(findAndroidRelease(bucketFor({ nope: true }), revision)).resolves.toEqual({
      available: false,
      reason: "invalid-release",
    });
  });

  it("keeps an APK unavailable when its manifest targets another source revision", async () => {
    const mismatched = manifest({ sourceRevision: otherRevision });
    await expect(findAndroidRelease(bucketFor(mismatched), revision)).resolves.toEqual({
      available: false,
      reason: "source-revision-mismatch",
    });
  });

  it("returns safe download metadata and attachment headers for a valid release", async () => {
    const event = {
      context: { cloudflare: { env: { MOBILE_RELEASES_BUCKET: bucketFor(manifest()) } } },
    } as never;
    const result = await getAndroidReleaseStatus(event, revision);

    expect(result).toMatchObject({
      available: true,
      versionCode: 42,
      minSdk: 24,
      selection: "matching-source",
      downloadUrl: expect.stringContaining(`revision=${revision}`),
    });
    expect(getAndroidDownloadHeaders(manifest(), 1_024)).toEqual({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Length": 1_024,
      "Content-Disposition": 'attachment; filename="transport-clock-idfm.apk"',
      "X-Content-Type-Options": "nosniff",
    });
  });

  it("falls back to the latest valid release when the page commit has no APK", async () => {
    const current = manifest();
    const bucket: R2BucketLike = {
      async get(key) {
        if (key.endsWith("manifest.json")) {
          return {
            body: new ReadableStream(),
            size: 1_024,
            text: async () => JSON.stringify(current),
          };
        }
        return null;
      },
      async list() {
        return { objects: [{ key: `mobile-releases/android/${revision}/manifest.json` }] };
      },
    };
    const event = {
      context: { cloudflare: { env: { MOBILE_RELEASES_BUCKET: bucket } } },
    } as never;

    await expect(getAndroidReleaseStatus(event, otherRevision)).resolves.toMatchObject({
      available: true,
      selection: "latest",
      sourceRevision: revision,
    });
  });
});
