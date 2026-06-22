import type { H3Event } from "h3";
import type {
  AndroidReleaseAvailable,
  AndroidReleaseStatus,
  AndroidReleaseUnavailableReason,
} from "../../../src/features/mobile-release/types";

export const MOBILE_RELEASES_PREFIX = "mobile-releases/android";
export const MAX_ANDROID_APK_BYTES = 25 * 1024 * 1024;

interface R2ObjectBodyLike {
  body: ReadableStream<Uint8Array>;
  size: number;
  text(): Promise<string>;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  list?(options: { prefix: string }): Promise<{
    objects: Array<{ key: string; uploaded?: Date }>;
  }>;
}

interface MobileReleaseCloudflareEnv {
  MOBILE_RELEASES_BUCKET?: R2BucketLike;
}

export interface AndroidReleaseManifest {
  schemaVersion: 1;
  platform: "android";
  sourceRevision: string;
  versionName: string;
  versionCode: number;
  builtAt: string;
  sizeBytes: number;
  sha256: string;
  minSdk: number;
  objectKey: string;
  fileName: string;
  signingCertificateSha256: string;
  oversizeApproved: boolean;
}

export type AndroidReleaseLookup =
  | { available: true; manifest: AndroidReleaseManifest }
  | { available: false; reason: AndroidReleaseUnavailableReason };

export function getMobileReleasesBucket(event: H3Event): R2BucketLike | undefined {
  const context = event.context as typeof event.context & {
    cloudflare?: { env?: MobileReleaseCloudflareEnv };
  };
  return context.cloudflare?.env?.MOBILE_RELEASES_BUCKET;
}

export function isSourceRevision(value: string): boolean {
  return /^[a-f0-9]{40}$/iu.test(value);
}

export function getAndroidManifestKey(sourceRevision: string): string {
  return `${MOBILE_RELEASES_PREFIX}/${sourceRevision.toLowerCase()}/manifest.json`;
}

export async function findAndroidRelease(
  bucket: R2BucketLike | undefined,
  requestedRevision: string,
): Promise<AndroidReleaseLookup> {
  if (!bucket) return { available: false, reason: "not-configured" };
  if (!isSourceRevision(requestedRevision)) {
    return { available: false, reason: "not-found" };
  }

  const sourceRevision = requestedRevision.toLowerCase();
  const object = await bucket.get(getAndroidManifestKey(sourceRevision));
  if (!object) return { available: false, reason: "not-found" };

  let payload: unknown;
  try {
    payload = JSON.parse(await object.text());
  } catch {
    return { available: false, reason: "invalid-release" };
  }

  const manifest = parseAndroidReleaseManifest(payload, sourceRevision);
  if (!manifest) return { available: false, reason: "invalid-release" };
  if (manifest.sourceRevision !== sourceRevision) {
    return { available: false, reason: "source-revision-mismatch" };
  }

  return { available: true, manifest };
}

export async function findLatestAndroidRelease(
  bucket: R2BucketLike | undefined,
): Promise<AndroidReleaseLookup> {
  if (!bucket) return { available: false, reason: "not-configured" };
  if (!bucket.list) return { available: false, reason: "not-found" };

  const objects = await bucket.list({ prefix: `${MOBILE_RELEASES_PREFIX}/` });
  const manifestKeys = objects.objects
    .map((object) => object.key)
    .filter((key) => /^mobile-releases\/android\/([a-f0-9]{40})\/manifest\.json$/iu.test(key));
  const releases = await Promise.all(
    manifestKeys.map(async (key) => {
      const revision = key.match(/([a-f0-9]{40})\/manifest\.json$/iu)?.[1]?.toLowerCase();
      if (!revision) return undefined;
      const object = await bucket.get(key);
      if (!object) return undefined;
      try {
        return parseAndroidReleaseManifest(JSON.parse(await object.text()), revision);
      } catch {
        return undefined;
      }
    }),
  );
  const validReleases = releases.filter(
    (release): release is AndroidReleaseManifest => Boolean(release),
  );
  if (!validReleases.length) {
    return { available: false, reason: manifestKeys.length ? "invalid-release" : "not-found" };
  }

  validReleases.sort((left, right) =>
    Date.parse(right.builtAt) - Date.parse(left.builtAt) || right.versionCode - left.versionCode,
  );
  return { available: true, manifest: validReleases[0] };
}

export async function getAndroidReleaseStatus(
  event: H3Event,
  requestedRevision: string,
): Promise<AndroidReleaseStatus> {
  const bucket = getMobileReleasesBucket(event);
  const exactMatch = isSourceRevision(requestedRevision)
    ? await findAndroidRelease(bucket, requestedRevision)
    : undefined;
  const result = exactMatch?.available
    ? exactMatch
    : await findLatestAndroidRelease(bucket);
  if (!result.available) return result;

  const { manifest } = result;
  return {
    available: true,
    sourceRevision: manifest.sourceRevision,
    versionName: manifest.versionName,
    versionCode: manifest.versionCode,
    builtAt: manifest.builtAt,
    sizeBytes: manifest.sizeBytes,
    sha256: manifest.sha256,
    minSdk: manifest.minSdk,
    selection: exactMatch?.available ? "matching-source" : "latest",
    downloadUrl: `/api/mobile/android/release/download?revision=${encodeURIComponent(manifest.sourceRevision)}`,
  } satisfies AndroidReleaseAvailable;
}

export function getAndroidDownloadHeaders(
  manifest: AndroidReleaseManifest,
  size: number,
): Record<string, string | number> {
  return {
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Length": size,
    "Content-Disposition": `attachment; filename="${manifest.fileName}"`,
    "X-Content-Type-Options": "nosniff",
  };
}

export function parseAndroidReleaseManifest(
  value: unknown,
  expectedRevision: string,
): AndroidReleaseManifest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<AndroidReleaseManifest>;
  const expectedPrefix = `${MOBILE_RELEASES_PREFIX}/${expectedRevision}/`;

  if (
    candidate.schemaVersion !== 1 ||
    candidate.platform !== "android" ||
    typeof candidate.sourceRevision !== "string" ||
    !isSourceRevision(candidate.sourceRevision) ||
    typeof candidate.versionName !== "string" ||
    !candidate.versionName.trim() ||
    !isPositiveInteger(candidate.versionCode) ||
    !isPositiveInteger(candidate.sizeBytes) ||
    (candidate.sizeBytes > MAX_ANDROID_APK_BYTES && candidate.oversizeApproved !== true) ||
    !isPositiveInteger(candidate.minSdk) ||
    !isIsoDate(candidate.builtAt) ||
    !isSha256(candidate.sha256) ||
    !isSha256(candidate.signingCertificateSha256) ||
    typeof candidate.oversizeApproved !== "boolean" ||
    typeof candidate.fileName !== "string" ||
    !/^[a-zA-Z0-9._-]+\.apk$/u.test(candidate.fileName) ||
    candidate.objectKey !== `${expectedPrefix}${candidate.fileName}`
  ) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    platform: "android",
    sourceRevision: candidate.sourceRevision.toLowerCase(),
    versionName: candidate.versionName.trim(),
    versionCode: candidate.versionCode,
    builtAt: candidate.builtAt,
    sizeBytes: candidate.sizeBytes,
    sha256: candidate.sha256.toLowerCase(),
    minSdk: candidate.minSdk,
    objectKey: candidate.objectKey,
    fileName: candidate.fileName,
    signingCertificateSha256: candidate.signingCertificateSha256.toLowerCase(),
    oversizeApproved: candidate.oversizeApproved,
  };
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/iu.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
