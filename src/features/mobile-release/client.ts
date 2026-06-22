import { toServerApiUrl } from "../../services/serverApi";
import type { AndroidReleaseAvailable, AndroidReleaseStatus } from "./types";

const configuredAppSourceRevision =
  typeof __APP_SOURCE_REVISION__ === "undefined"
    ? ""
    : __APP_SOURCE_REVISION__;
const configuredPublicReleaseBaseUrl =
  typeof __MOBILE_RELEASE_PUBLIC_BASE_URL__ === "undefined"
    ? ""
    : __MOBILE_RELEASE_PUBLIC_BASE_URL__;
const MOBILE_RELEASES_PREFIX = "mobile-releases/android";

export function getAppSourceRevision(): string {
  return configuredAppSourceRevision.trim().toLowerCase();
}

export async function getAndroidRelease(): Promise<AndroidReleaseStatus> {
  const publicRelease = await getPublicAndroidRelease();
  if (publicRelease) return publicRelease;

  const revision = getAppSourceRevision();

  const query = /^[a-f0-9]{40}$/iu.test(revision)
    ? `?revision=${encodeURIComponent(revision)}`
    : "";
  const url = toServerApiUrl(`/api/mobile/android/release${query}`);

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return { available: false, reason: "not-found" };
    }

    const result = (await response.json()) as AndroidReleaseStatus;
    if (!result.available) {
      return result;
    }

    return {
      ...result,
      downloadUrl: toServerApiUrl(result.downloadUrl),
    };
  } catch {
    return { available: false, reason: "request-failed" };
  }
}

async function getPublicAndroidRelease(): Promise<AndroidReleaseAvailable | undefined> {
  const baseUrl = configuredPublicReleaseBaseUrl.trim().replace(/\/+$/u, "");
  if (!baseUrl) return undefined;

  try {
    const response = await fetch(`${baseUrl}/${MOBILE_RELEASES_PREFIX}/latest.json`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;
    return normalizePublicManifest(await response.json(), baseUrl);
  } catch {
    return undefined;
  }
}

function normalizePublicManifest(
  value: unknown,
  baseUrl: string,
): AndroidReleaseAvailable | undefined {
  if (!value || typeof value !== "object") return undefined;
  const manifest = value as Record<string, unknown>;
  const sourceRevision = typeof manifest.sourceRevision === "string"
    ? manifest.sourceRevision.toLowerCase()
    : "";
  const objectKey = typeof manifest.objectKey === "string" ? manifest.objectKey : "";

  if (
    !/^[a-f0-9]{40}$/iu.test(sourceRevision) ||
    !isPositiveInteger(manifest.versionCode) ||
    typeof manifest.versionName !== "string" ||
    typeof manifest.builtAt !== "string" ||
    !isPositiveInteger(manifest.sizeBytes) ||
    !/^[a-f0-9]{64}$/iu.test(String(manifest.sha256 ?? "")) ||
    !isPositiveInteger(manifest.minSdk) ||
    !new RegExp(`^${MOBILE_RELEASES_PREFIX}/[a-f0-9]{40}/[a-zA-Z0-9._-]+\\.apk$`, "iu").test(objectKey)
  ) {
    return undefined;
  }

  return {
    available: true,
    sourceRevision,
    versionName: manifest.versionName.trim(),
    versionCode: manifest.versionCode,
    builtAt: manifest.builtAt,
    sizeBytes: manifest.sizeBytes,
    sha256: String(manifest.sha256).toLowerCase(),
    minSdk: manifest.minSdk,
    selection: "latest",
    downloadUrl: `${baseUrl}/${objectKey}`,
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
