import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { basename } from "node:path";

export const MOBILE_RELEASES_PREFIX = "mobile-releases/android";
export const MAX_ANDROID_APK_BYTES = 25 * 1024 * 1024;
export const ANDROID_MIN_SDK = 24;

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

export function isSourceRevision(value: string): boolean {
  return /^[a-f0-9]{40}$/iu.test(value);
}

export function normalizeSha256(value: string): string {
  const normalized = value.replace(/[:\s]/gu, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) {
    throw new Error("Une empreinte SHA-256 doit contenir exactement 64 caractères hexadécimaux.");
  }
  return normalized;
}

export async function sha256File(path: string): Promise<string> {
  const bytes = await import("node:fs/promises").then(({ readFile }) => readFile(path));
  return createHash("sha256").update(bytes).digest("hex");
}

export async function createAndroidReleaseManifest(input: {
  apkPath: string;
  sourceRevision: string;
  versionName: string;
  versionCode: number;
  signingCertificateSha256: string;
  oversizeApproved: boolean;
  builtAt?: string;
}): Promise<AndroidReleaseManifest> {
  const sourceRevision = input.sourceRevision.toLowerCase();
  if (!isSourceRevision(sourceRevision)) throw new Error("SHA de commit Git invalide.");
  if (!Number.isSafeInteger(input.versionCode) || input.versionCode < 1) {
    throw new Error("MOBILE_RELEASE_VERSION_CODE doit être un entier positif.");
  }

  const fileName = basename(input.apkPath);
  if (!/^[a-zA-Z0-9._-]+\.apk$/u.test(fileName)) {
    throw new Error("Le nom de fichier APK contient des caractères non autorisés.");
  }

  const sizeBytes = (await stat(input.apkPath)).size;
  return {
    schemaVersion: 1,
    platform: "android",
    sourceRevision,
    versionName: input.versionName.trim(),
    versionCode: input.versionCode,
    builtAt: input.builtAt ?? new Date().toISOString(),
    sizeBytes,
    sha256: await sha256File(input.apkPath),
    minSdk: ANDROID_MIN_SDK,
    objectKey: `${MOBILE_RELEASES_PREFIX}/${sourceRevision}/${fileName}`,
    fileName,
    signingCertificateSha256: normalizeSha256(input.signingCertificateSha256),
    oversizeApproved: input.oversizeApproved,
  };
}
