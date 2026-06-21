export type AndroidReleaseUnavailableReason =
  | "not-configured"
  | "not-found"
  | "source-revision-mismatch"
  | "invalid-release";

export interface AndroidReleaseAvailable {
  available: true;
  sourceRevision: string;
  versionName: string;
  versionCode: number;
  builtAt: string;
  sizeBytes: number;
  sha256: string;
  minSdk: number;
  downloadUrl: string;
}

export interface AndroidReleaseUnavailable {
  available: false;
  reason: AndroidReleaseUnavailableReason;
}

export type AndroidReleaseStatus =
  | AndroidReleaseAvailable
  | AndroidReleaseUnavailable;
