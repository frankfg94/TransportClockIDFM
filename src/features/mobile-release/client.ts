import { toServerApiUrl } from "../../services/serverApi";
import type { AndroidReleaseStatus } from "./types";

const configuredAppSourceRevision =
  typeof __APP_SOURCE_REVISION__ === "undefined"
    ? ""
    : __APP_SOURCE_REVISION__;

export function getAppSourceRevision(): string {
  return configuredAppSourceRevision.trim().toLowerCase();
}

export async function getAndroidRelease(): Promise<AndroidReleaseStatus> {
  const revision = getAppSourceRevision();

  if (!/^[a-f0-9]{40}$/iu.test(revision)) {
    return { available: false, reason: "not-configured" };
  }

  const url = toServerApiUrl(
    `/api/mobile/android/release?revision=${encodeURIComponent(revision)}`,
  );

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
    return { available: false, reason: "not-found" };
  }
}
