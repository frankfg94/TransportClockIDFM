import type {
  DepartureCall,
  DepartureCallingPattern,
  LineRouteStop,
  TransferLineOption,
  TransitBoardConfig,
  TransitMode,
} from "../../types/transit";
import {
  resolveEffectiveTransferResolverMode,
  type EffectiveTransferResolverMode,
  type TransferResolverMode,
} from "./transferResolverMode";

export interface TransferBundleTarget {
  stopAreaRef: string;
  label: string;
  city?: string;
}

export interface TransferBundleResponse {
  version: 1;
  generatedAt: string;
  lineId: string;
  lineLabel: string;
  nearbyDistanceMeters?: number;
  requestConcurrency?: number;
  transferResolverMode?: EffectiveTransferResolverMode;
  transfersByStopAreaRef: Record<string, TransferLineOption[]>;
}

export interface TransferBundleRecord
  extends Omit<TransferBundleResponse, "transferResolverMode"> {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  retentionDays: number;
  requestConcurrency: number;
  transferResolverMode: EffectiveTransferResolverMode;
}

export interface TransferBundleSummary {
  id: string;
  lineId: string;
  lineLabel: string;
  updatedAt: string;
  expiresAt: string;
  retentionDays: number;
  requestConcurrency: number;
  stopAreaCount: number;
  transferCount: number;
  transferResolverMode: EffectiveTransferResolverMode;
  nearbyDistanceMeters?: number;
}

export interface TransferBundleLoadResult {
  complete: boolean;
  missingTargetRefs: string[];
  targetCount: number;
  transfersByStopAreaRef: Record<string, TransferLineOption[]>;
}

export interface TransferBundleLoadProgress {
  completed: number;
  failed: number;
  pending: number;
  total: number;
}

interface TransferBundleStore {
  version: 1;
  bundles: TransferBundleRecord[];
}

export interface TransferBundleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TransferBundleLocalCacheOptions {
  /** Enables the browser cache layer before the backend bundle fallback. */
  localCacheEnabled?: boolean;
  /** Injectable storage used by tests. Defaults to window.localStorage in the browser. */
  localCacheStorage?: TransferBundleStorage;
}

export interface TransferBundleClearOptions extends TransferBundleLocalCacheOptions {
  /** Optional filter used only for local cleanup. Remote cleanup still accepts lineId/id. */
  nearbyDistanceMeters?: number;
  requestConcurrency?: number;
  transportType?: TransferBundleNearbyDistanceTransport;
  transferResolverMode?: TransferResolverMode;
}

const TRANSFER_BUNDLE_STORAGE_KEY = "transport-clock.transfer-bundles.v14";
const TRANSFER_BUNDLE_DEBUG_STORAGE_KEY = "transport-clock.debug.transfer-bundles";
const LEGACY_TRANSFER_BUNDLE_STORAGE_KEYS = [
  "transport-clock.transfer-bundles.v13",
  "transport-clock.transfer-bundles.v12",
  "transport-clock.transfer-bundles.v11",
  "transport-clock.transfer-bundles.v10",
  "transport-clock.transfer-bundles.v9",
  "transport-clock.transfer-bundles.v8",
  "transport-clock.transfer-bundles.v7",
  "transport-clock.transfer-bundles.v6",
  "transport-clock.transfer-bundles.v5",
  "transport-clock.transfer-bundles.v4",
  "transport-clock.transfer-bundles.v3",
  "transport-clock.transfer-bundles.v2",
  "transport-clock.transfer-bundles.v1",
];
const LEGACY_TRANSFER_BUNDLE_AUXILIARY_STORAGE_KEYS = [
  "transport-clock.transfer-bundles.resetAt",
];
const TRANSFER_BUNDLE_STORAGE_KEYS = [
  TRANSFER_BUNDLE_STORAGE_KEY,
  ...LEGACY_TRANSFER_BUNDLE_STORAGE_KEYS,
  ...LEGACY_TRANSFER_BUNDLE_AUXILIARY_STORAGE_KEYS,
];
const DEFAULT_TRANSFER_BUNDLE_REQUEST_CONCURRENCY = 1;
const DEFAULT_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS = 300;
const DEFAULT_TRANSFER_BUNDLE_RETENTION_DAYS = 15;
const MIN_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS = 50;
const MAX_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS = 1_200;
const MAX_TRANSFER_BUNDLE_BACKEND_PASSES = 24;
export const TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS = {
  bus: 200,
  cable: 350,
  metro: 450,
  noctilien: 200,
  rer: 600,
  train: 600,
  tram: 350,
  transilien: 600,
} as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const pendingTransferBundleRequests = new Map<
  string,
  Promise<TransferBundleResponse>
>();

type TransferBundleNearbyDistanceTransport =
  | TransitMode
  | keyof typeof TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS
  | string;

export function collectTransferBundleTargets(
  pattern: DepartureCallingPattern,
): TransferBundleTarget[] {
  const targets = new Map<string, TransferBundleTarget>();
  const addTarget = (source: DepartureCall | LineRouteStop): void => {
    const stopAreaRef = getStopAreaRef(source);

    if (!stopAreaRef || targets.has(stopAreaRef)) {
      return;
    }

    targets.set(stopAreaRef, {
      stopAreaRef,
      label: source.label,
      city: source.city,
    });
  };

  pattern.lineTopology?.forEach((sequence) => {
    sequence.stops.forEach(addTarget);
  });
  pattern.calls.forEach(addTarget);

  return Array.from(targets.values());
}

export async function loadTransferBundleForPattern(
  board: TransitBoardConfig,
  pattern: DepartureCallingPattern,
  retentionDays: number,
  options: {
    localCacheEnabled?: boolean;
    localCacheStorage?: TransferBundleStorage;
    nearbyDistanceMeters?: number;
    onProgress?: (progress: TransferBundleLoadProgress) => void;
    requestConcurrency?: number;
    requestSpacingMs?: number;
    transportType?: TransferBundleNearbyDistanceTransport;
    transferResolverMode?: TransferResolverMode;
  } = {},
): Promise<Record<string, TransferLineOption[]>> {
  const result = await loadTransferBundleResultForPattern(
    board,
    pattern,
    retentionDays,
    options,
  );

  return result.transfersByStopAreaRef;
}

function readReusableLocalTransferBundleEntries(params: {
  lineId: string;
  transferResolverMode: EffectiveTransferResolverMode;
  requestConcurrency: number;
  nearbyDistanceMeters: number;
  targets: TransferBundleTarget[];
  storage: TransferBundleStorage;
}): Record<string, TransferLineOption[]> {
  const id = createTransferBundleId(
    params.lineId,
    params.transferResolverMode,
    params.nearbyDistanceMeters,
  );
  const store = readTransferBundleStore(params.storage, {
    removeCorruptedStore: true,
    rewriteSanitizedStore: true,
  });
  const bundle = store.bundles.find((candidate) => candidate.id === id);

  logTransferBundleClientDebug("local-cache:lookup", {
    expectedId: id,
    found: Boolean(bundle),
    lineId: params.lineId,
    nearbyDistanceMeters: params.nearbyDistanceMeters,
    requestConcurrency: params.requestConcurrency,
    storedBundleCount: store.bundles.length,
    storedBundleIds: store.bundles.map((storedBundle) => storedBundle.id),
    targetCount: params.targets.length,
    transferResolverMode: params.transferResolverMode,
  });

  if (!bundle) {
    return {};
  }

  // Only reuse entries explicitly present in the local bundle.
  // An empty array is valid and means "resolved with no transfer".
  // A missing key means "not resolved yet" and must still go through backend/live resolving.
  const entries = Object.fromEntries(
    params.targets.flatMap((target) =>
      Object.prototype.hasOwnProperty.call(
        bundle.transfersByStopAreaRef,
        target.stopAreaRef,
      )
        ? [
          [
            target.stopAreaRef,
            bundle.transfersByStopAreaRef[target.stopAreaRef] ?? [],
          ],
        ]
        : [],
    ),
  );

  const requestedStopAreaRefs = params.targets.map((target) => target.stopAreaRef);
  const storedStopAreaRefs = Object.keys(bundle.transfersByStopAreaRef);
  const missingStopAreaRefs = requestedStopAreaRefs.filter(
    (stopAreaRef) =>
      !Object.prototype.hasOwnProperty.call(
        bundle.transfersByStopAreaRef,
        stopAreaRef,
      ),
  );

  logTransferBundleClientDebug("local-cache:entries", {
    bundleId: bundle.id,
    complete: missingStopAreaRefs.length === 0,
    firstRequestedStopAreaRefs: requestedStopAreaRefs.slice(0, 10),
    firstStoredStopAreaRefs: storedStopAreaRefs.slice(0, 10),
    missingStopAreaRefs: missingStopAreaRefs.slice(0, 20),
    reusableTargetCount: Object.keys(entries).length,
    storedStopAreaCount: storedStopAreaRefs.length,
    targetCount: params.targets.length,
    transferCount: Object.values(entries).reduce(
      (count, transfers) => count + transfers.length,
      0,
    ),
  });

  return entries;
}

function transferBundleMapHasRequestedTargets(
  targets: TransferBundleTarget[],
  transfersByStopAreaRef: Record<string, TransferLineOption[]>,
): boolean {
  return targets.every((target) =>
    Object.prototype.hasOwnProperty.call(
      transfersByStopAreaRef,
      target.stopAreaRef,
    ),
  );
}

export async function loadTransferBundleResultForPattern(
  board: TransitBoardConfig,
  pattern: DepartureCallingPattern,
  retentionDays: number,
  options: {
    localCacheEnabled?: boolean;
    localCacheStorage?: TransferBundleStorage;
    nearbyDistanceMeters?: number;
    onProgress?: (progress: TransferBundleLoadProgress) => void;
    requestConcurrency?: number;
    requestSpacingMs?: number;
    transportType?: TransferBundleNearbyDistanceTransport;
    transferResolverMode?: TransferResolverMode;
  } = {},
): Promise<TransferBundleLoadResult> {
  const lineId = getBundleLineId(board);
  const lineLabel = getBundleLineLabel(board);
  const transferResolverMode = resolveEffectiveTransferResolverMode(
    options.transferResolverMode ?? "auto",
    board.line.mode,
  );
  const targets = collectTransferBundleTargets(pattern);

  if (targets.length === 0) {
    return createBundleLoadResult({}, targets);
  }

  const requestConcurrency = normalizeTransferBundleRequestConcurrency(
    options.requestConcurrency,
  );
  const requestSpacingMs = normalizeTransferBundleRequestSpacingMs(
    options.requestSpacingMs,
  );
  const nearbyDistanceMeters = normalizeTransferBundleNearbyDistanceMeters(
    options.nearbyDistanceMeters ??
    resolveTransferBundleNearbyDistanceMeters(
      options.transportType ?? board.line.mode,
    ),
  );

  const storage =
    options.localCacheEnabled === true
      ? options.localCacheStorage ?? getBrowserStorage()
      : undefined;

  logTransferBundleClientDebug("start", {
    hasStorage: Boolean(storage),
    lineId,
    lineLabel,
    localCacheEnabled: options.localCacheEnabled === true,
    nearbyDistanceMeters,
    requestConcurrency,
    requestSpacingMs,
    retentionDays,
    targetCount: targets.length,
    transferResolverMode,
  });

  const transfersByStopAreaRef: Record<string, TransferLineOption[]> = {};

  if (storage) {
    const expiredBundleIds = pruneExpiredTransferBundles(storage);

    if (expiredBundleIds.length > 0) {
      logTransferBundleClientDebug("local-cache:expired-pruned", {
        expiredBundleIds,
      });
    }

    const localEntries = readReusableLocalTransferBundleEntries({
      lineId,
      transferResolverMode,
      requestConcurrency,
      nearbyDistanceMeters,
      targets,
      storage,
    });

    Object.assign(transfersByStopAreaRef, localEntries);

    logTransferBundleClientDebug("local-cache:read", {
      hit: Object.keys(localEntries).length > 0,
      missingTargetCount: targets.length - Object.keys(localEntries).length,
      reusableTargetCount: Object.keys(localEntries).length,
      targetCount: targets.length,
    });
  } else {
    logTransferBundleClientDebug("local-cache:disabled", {
      localCacheEnabled: options.localCacheEnabled,
      reason:
        options.localCacheEnabled === true
          ? "storage-unavailable"
          : "setting-disabled",
    });
  }

  reportBundleProgress(targets, transfersByStopAreaRef, options.onProgress);

  if (transferBundleMapHasRequestedTargets(targets, transfersByStopAreaRef)) {
    logTransferBundleClientDebug("local-cache:hit-complete", {
      lineId,
      targetCount: targets.length,
      transferCount: Object.values(transfersByStopAreaRef).reduce(
        (count, transfers) => count + transfers.length,
        0,
      ),
    });

    return createBundleLoadResult(transfersByStopAreaRef, targets);
  }

  let missingTargets = targets.filter(
    (target) =>
      !Object.prototype.hasOwnProperty.call(
        transfersByStopAreaRef,
        target.stopAreaRef,
      ),
  );

  try {
    for (
      let pass = 1;
      missingTargets.length > 0 && pass <= MAX_TRANSFER_BUNDLE_BACKEND_PASSES;
      pass += 1
    ) {
      logTransferBundleClientDebug("backend:request", {
        frontendResolvedTargetCount: Object.keys(transfersByStopAreaRef).length,
        lineId,
        missingTargetCount: missingTargets.length,
        missingTargets: missingTargets.slice(0, 20).map((target) => ({
          label: target.label,
          stopAreaRef: target.stopAreaRef,
        })),
        pass,
        targetCount: targets.length,
      });

      const response = await fetchTransferBundle({
        lineId,
        lineLabel,
        nearbyDistanceMeters,
        requestConcurrency,
        requestSpacingMs,
        targets: missingTargets,
        transferResolverMode,
        retentionDays,
      }).catch((error) => {
        logTransferBundleClientDebug("backend:error", {
          error: formatTransferBundleClientDebugError(error),
          lineId,
          missingTargetCount: missingTargets.length,
          pass,
        });

        return undefined;
      });

      if (
        !response ||
        !transferBundleResponseHasRequestedTarget(missingTargets, response)
      ) {
        logTransferBundleClientDebug("backend:no-progress", {
          hasResponse: Boolean(response),
          lineId,
          pass,
          returnedTargetCount: response
            ? Object.keys(response.transfersByStopAreaRef).length
            : 0,
          requestedMissingTargetCount: missingTargets.length,
        });

        break;
      }

      const previousResolvedTargetCount = Object.keys(
        transfersByStopAreaRef,
      ).length;

      Object.assign(transfersByStopAreaRef, response.transfersByStopAreaRef);

      const resolvedTargetCount = Object.keys(transfersByStopAreaRef).length;
      const addedTargetCount =
        resolvedTargetCount - previousResolvedTargetCount;

      logTransferBundleClientDebug("backend:response", {
        addedTargetCount,
        backendTargetCount: Object.keys(response.transfersByStopAreaRef).length,
        complete: transferBundleMapHasRequestedTargets(
          targets,
          transfersByStopAreaRef,
        ),
        lineId,
        pass,
        targetCount: targets.length,
        totalResolvedTargetCount: resolvedTargetCount,
      });

      if (storage) {
        const savedBundle = saveTransferBundle(
          {
            ...response,
            lineId,
            lineLabel,
            nearbyDistanceMeters,
            requestConcurrency,
            transferResolverMode,
            transfersByStopAreaRef,
          },
          retentionDays,
          storage,
        );

        logTransferBundleClientDebug("local-cache:write", {
          bundleId: savedBundle.id,
          expiresAt: savedBundle.expiresAt,
          pass,
          stopAreaCount: Object.keys(savedBundle.transfersByStopAreaRef).length,
          transferCount: Object.values(savedBundle.transfersByStopAreaRef).reduce(
            (count, transfers) => count + transfers.length,
            0,
          ),
        });
      }

      reportBundleProgress(targets, transfersByStopAreaRef, options.onProgress);

      if (addedTargetCount <= 0) {
        logTransferBundleClientDebug("backend:no-progress", {
          lineId,
          missingTargetCount: missingTargets.length,
          pass,
        });
        break;
      }

      missingTargets = targets.filter(
        (target) =>
          !Object.prototype.hasOwnProperty.call(
            transfersByStopAreaRef,
            target.stopAreaRef,
          ),
      );
    }

    if (missingTargets.length > 0) {
      logTransferBundleClientDebug("backend:passes-finished", {
        complete: transferBundleMapHasRequestedTargets(
          targets,
          transfersByStopAreaRef,
        ),
        lineId,
        missingTargetCount: missingTargets.length,
        resolvedTargetCount: Object.keys(transfersByStopAreaRef).length,
      });
    }
  } catch (error) {
    logTransferBundleClientDebug("load:error", {
      error: formatTransferBundleClientDebugError(error),
      lineId,
    });

    return createBundleLoadResult(transfersByStopAreaRef, targets);
  }

  return createBundleLoadResult(transfersByStopAreaRef, targets);
}

function normalizeTransferBundleRequestConcurrency(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(4, Math.max(1, Math.trunc(value)))
    : DEFAULT_TRANSFER_BUNDLE_REQUEST_CONCURRENCY;
}

function normalizeTransferBundleRequestSpacingMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(2_000, Math.max(0, Math.trunc(value)))
    : 0;
}

function normalizeTransferBundleRetentionDays(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue)
    ? Math.min(365, Math.max(1, Math.trunc(numericValue)))
    : DEFAULT_TRANSFER_BUNDLE_RETENTION_DAYS;
}

export function normalizeTransferBundleNearbyDistanceMeters(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue)
    ? Math.min(
      MAX_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS,
      Math.max(
        MIN_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS,
        Math.trunc(numericValue),
      ),
    )
    : DEFAULT_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS;
}

export function resolveTransferBundleNearbyDistanceMeters(
  transportType: TransferBundleNearbyDistanceTransport | undefined,
): number {
  const transportKey = normalizeTransferBundleTransportType(transportType);

  return transportKey
    ? TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS[transportKey]
    : DEFAULT_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS;
}

function normalizeTransferBundleTransportType(
  transportType: TransferBundleNearbyDistanceTransport | undefined,
): keyof typeof TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS | undefined {
  const normalized = String(transportType ?? "").trim().toLowerCase();

  if (!normalized) return undefined;
  if (normalized.includes("metro")) return "metro";
  if (normalized.includes("rer")) return "rer";
  if (normalized.includes("tram")) return "tram";
  if (normalized.includes("noctilien")) return "noctilien";
  if (normalized.includes("bus")) return "bus";
  if (normalized.includes("transilien")) return "transilien";
  if (normalized.includes("train")) return "train";
  if (normalized.includes("cable")) return "cable";

  return undefined;
}

function fetchTransferBundle(payload: {
  lineId: string;
  lineLabel: string;
  nearbyDistanceMeters: number;
  requestConcurrency: number;
  requestSpacingMs: number;
  retentionDays: number;
  targets: TransferBundleTarget[];
  transferResolverMode: EffectiveTransferResolverMode;
}): Promise<TransferBundleResponse> {
  const requestKey = createTransferBundleRequestKey(payload);
  const pendingRequest = pendingTransferBundleRequests.get(requestKey);

  if (pendingRequest) {
    logTransferBundleClientDebug("backend:pending-hit", {
      lineId: payload.lineId,
      targetCount: payload.targets.length,
    });

    return pendingRequest;
  }

  logTransferBundleClientDebug("backend:fetch-start", {
    lineId: payload.lineId,
    nearbyDistanceMeters: payload.nearbyDistanceMeters,
    requestConcurrency: payload.requestConcurrency,
    requestSpacingMs: payload.requestSpacingMs,
    targetCount: payload.targets.length,
    transferResolverMode: payload.transferResolverMode,
  });

  const request = fetch("/api/transfer-bundles", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const transferBundle = (await response.json()) as TransferBundleResponse;

      if (!isTransferBundleResponse(transferBundle)) {
        throw new Error("Invalid transfer bundle response.");
      }

      logTransferBundleClientDebug("backend:fetch-success", {
        lineId: payload.lineId,
        status: response.status,
        targetCount: Object.keys(transferBundle.transfersByStopAreaRef).length,
      });

      return {
        ...transferBundle,
        nearbyDistanceMeters:
          transferBundle.nearbyDistanceMeters ?? payload.nearbyDistanceMeters,
        requestConcurrency:
          transferBundle.requestConcurrency ?? payload.requestConcurrency,
        transferResolverMode:
          transferBundle.transferResolverMode ?? payload.transferResolverMode,
      };
    })
    .finally(() => {
      pendingTransferBundleRequests.delete(requestKey);
    });

  pendingTransferBundleRequests.set(requestKey, request);

  return request;
}

async function mapTransferBundleItemsWithConcurrency<TItem>(
  items: TItem[],
  concurrency: number,
  spacingMs: number,
  mapper: (item: TItem, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  let nextStartAt = Date.now();
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const normalizedSpacingMs = normalizeTransferBundleRequestSpacingMs(spacingMs);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;

        nextIndex += 1;
        await waitForTransferBundleLaunchSlot(
          normalizedSpacingMs,
          () => nextStartAt,
          (value) => {
            nextStartAt = value;
          },
        );
        await mapper(items[currentIndex]!, currentIndex);
      }
    }),
  );
}

async function waitForTransferBundleLaunchSlot(
  spacingMs: number,
  getNextStartAt: () => number,
  setNextStartAt: (value: number) => void,
): Promise<void> {
  if (spacingMs <= 0) {
    return;
  }

  const now = Date.now();
  const scheduledAt = Math.max(now, getNextStartAt());
  const delayMs = Math.max(0, scheduledAt - now);

  setNextStartAt(scheduledAt + spacingMs);

  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function createTransferBundleRequestKey(payload: {
  lineId: string;
  nearbyDistanceMeters: number;
  requestConcurrency: number;
  requestSpacingMs: number;
  retentionDays: number;
  targets: TransferBundleTarget[];
  transferResolverMode: EffectiveTransferResolverMode;
}): string {
  return JSON.stringify({
    lineId: payload.lineId,
    nearbyDistanceMeters: payload.nearbyDistanceMeters,
    requestConcurrency: payload.requestConcurrency,
    requestSpacingMs: payload.requestSpacingMs,
    retentionDays: payload.retentionDays,
    transferResolverMode: payload.transferResolverMode,
    targets: payload.targets.map((target) => target.stopAreaRef).sort(),
  });
}

function transferBundleResponseHasRequestedTarget(
  targets: TransferBundleTarget[],
  response: TransferBundleResponse,
): boolean {
  return targets.some((target) =>
    Object.prototype.hasOwnProperty.call(
      response.transfersByStopAreaRef,
      target.stopAreaRef,
    ),
  );
}

async function fetchTransferBundleSummaries(): Promise<TransferBundleSummary[]> {
  const response = await fetch("/api/transfer-bundles", {
    method: "GET",
  }).catch(() => undefined);

  if (!response?.ok) {
    return [];
  }

  const payload = (await response.json().catch(() => ({}))) as {
    bundles?: TransferBundleSummary[];
  };

  return Array.isArray(payload.bundles) ? payload.bundles : [];
}

async function requestTransferBundleCacheDelete(payload?: {
  id?: string;
  lineId?: string;
}): Promise<void> {
  await fetch("/api/transfer-bundles", {
    body: payload ? JSON.stringify(payload) : undefined,
    headers: payload ? { "content-type": "application/json" } : undefined,
    method: "DELETE",
  }).catch(() => undefined);
}

export function clearPendingTransferBundleRequestsForTests(): void {
  pendingTransferBundleRequests.clear();
}

function readTransferBundleStore(
  storage: TransferBundleStorage,
  options: {
    removeCorruptedStore?: boolean;
    rewriteSanitizedStore?: boolean;
  } = {},
): TransferBundleStore {
  try {
    const rawValue = storage.getItem(TRANSFER_BUNDLE_STORAGE_KEY);

    if (!rawValue) {
      return createEmptyStore();
    }

    const parsed = JSON.parse(rawValue) as Partial<TransferBundleStore>;

    if (!Array.isArray(parsed.bundles)) {
      if (options.removeCorruptedStore) {
        storage.removeItem(TRANSFER_BUNDLE_STORAGE_KEY);
      }

      return createEmptyStore();
    }

    const bundles = parsed.bundles.filter(isTransferBundleRecord);

    if (
      options.rewriteSanitizedStore &&
      bundles.length !== parsed.bundles.length
    ) {
      writeTransferBundleStore({ version: 1, bundles }, storage);
    }

    return {
      version: 1,
      bundles,
    };
  } catch {
    if (options.removeCorruptedStore) {
      storage.removeItem(TRANSFER_BUNDLE_STORAGE_KEY);
    }

    return createEmptyStore();
  }
}

export function listTransferBundles(
  storage: TransferBundleStorage,
): TransferBundleSummary[];
export function listTransferBundles(): Promise<TransferBundleSummary[]>;
export function listTransferBundles(
  storage?: TransferBundleStorage,
): TransferBundleSummary[] | Promise<TransferBundleSummary[]> {
  if (!storage) {
    return fetchTransferBundleSummaries();
  }

  pruneExpiredTransferBundles(storage);

  return readTransferBundleStore(storage).bundles
    .map((bundle) => createTransferBundleSummary(bundle))
    .sort((left, right) => left.lineLabel.localeCompare(right.lineLabel, "fr"));
}

export function clearTransferBundles(storage: TransferBundleStorage): void;
export function clearTransferBundles(options: TransferBundleClearOptions): Promise<void>;
export function clearTransferBundles(): Promise<void>;
export function clearTransferBundles(
  input?: TransferBundleStorage | TransferBundleClearOptions,
): void | Promise<void> {
  if (isTransferBundleStorage(input)) {
    TRANSFER_BUNDLE_STORAGE_KEYS.forEach((key) => input.removeItem(key));
    return;
  }

  const localStorage = resolveLocalTransferBundleStorage(input);

  if (localStorage) {
    TRANSFER_BUNDLE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  }

  return requestTransferBundleCacheDelete();
}

export function deleteTransferBundle(
  id: string,
  storage: TransferBundleStorage,
): void;
export function deleteTransferBundle(
  id: string,
  options: TransferBundleClearOptions,
): Promise<void>;
export function deleteTransferBundle(id: string): Promise<void>;
export function deleteTransferBundle(
  id: string,
  input?: TransferBundleStorage | TransferBundleClearOptions,
): void | Promise<void> {
  if (isTransferBundleStorage(input)) {
    deleteLocalTransferBundleById(id, input);
    return;
  }

  const localStorage = resolveLocalTransferBundleStorage(input);

  if (localStorage) {
    deleteLocalTransferBundleById(id, localStorage);
  }

  return requestTransferBundleCacheDelete({ id });
}

export function clearTransferBundleForBoard(
  board: TransitBoardConfig,
  storage: TransferBundleStorage,
): void;
export function clearTransferBundleForBoard(
  board: TransitBoardConfig,
  options: TransferBundleClearOptions,
): Promise<void>;
export function clearTransferBundleForBoard(
  board: TransitBoardConfig,
): Promise<void>;
export function clearTransferBundleForBoard(
  board: TransitBoardConfig,
  input?: TransferBundleStorage | TransferBundleClearOptions,
): void | Promise<void> {
  const lineId = getBundleLineId(board);

  if (isTransferBundleStorage(input)) {
    deleteLocalTransferBundlesForLine(lineId, input);
    return;
  }

  const localStorage = resolveLocalTransferBundleStorage(input);

  if (localStorage) {
    deleteLocalTransferBundlesForLine(lineId, localStorage, input, board);
  }

  return requestTransferBundleCacheDelete({ lineId });
}

export function pruneExpiredTransferBundles(
  storage = getBrowserStorage(),
  now = Date.now(),
  retentionDays?: number,
): string[] {
  if (!storage) {
    return [];
  }

  const store = readTransferBundleStore(storage, {
    removeCorruptedStore: true,
    rewriteSanitizedStore: true,
  });
  const expiredBundleIds: string[] = [];
  const bundles = store.bundles.filter((bundle) => {
    const fresh = isTransferBundleRecordFresh(bundle, now, retentionDays);

    if (!fresh) {
      expiredBundleIds.push(bundle.id);
    }

    return fresh;
  });

  if (bundles.length !== store.bundles.length) {
    writeTransferBundleStore({ ...store, bundles }, storage);
  }

  return expiredBundleIds;
}

export function saveTransferBundle(
  response: TransferBundleResponse,
  retentionDays: number,
  storage = getBrowserStorage(),
  now = Date.now(),
): TransferBundleRecord {
  const transferResolverMode = response.transferResolverMode ?? "nearby";
  const requestConcurrency = normalizeTransferBundleRequestConcurrency(
    response.requestConcurrency,
  );
  const nearbyDistanceMeters = normalizeTransferBundleNearbyDistanceMeters(
    response.nearbyDistanceMeters,
  );
  const normalizedRetentionDays = normalizeTransferBundleRetentionDays(retentionDays);
  const id = createTransferBundleId(
    response.lineId,
    transferResolverMode,
    nearbyDistanceMeters,
  );
  const store = storage
    ? readTransferBundleStore(storage, {
      removeCorruptedStore: true,
      rewriteSanitizedStore: true,
    })
    : createEmptyStore();
  const existing = store.bundles.find((bundle) => bundle.id === id);
  const createdAt = existing?.createdAt ?? new Date(now).toISOString();
  const record: TransferBundleRecord = {
    ...response,
    nearbyDistanceMeters,
    requestConcurrency,
    transferResolverMode,
    id,
    createdAt,
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + normalizedRetentionDays * DAY_MS).toISOString(),
    retentionDays: normalizedRetentionDays,
    transfersByStopAreaRef: {
      ...(existing?.transfersByStopAreaRef ?? {}),
      ...response.transfersByStopAreaRef,
    },
  };
  const bundles = [
    ...store.bundles.filter((bundle) => bundle.id !== id),
    record,
  ];

  if (storage) {
    writeTransferBundleStore({ version: 1, bundles }, storage);
  }

  return record;
}

export function isCompleteTransferBundleResponse(
  targets: TransferBundleTarget[],
  response: TransferBundleResponse,
): boolean {
  return targets.every((target) =>
    Object.prototype.hasOwnProperty.call(
      response.transfersByStopAreaRef,
      target.stopAreaRef,
    ),
  );
}

function readCompleteLocalTransferBundle(params: {
  bundleId: string;
  lineId: string;
  nearbyDistanceMeters: number;
  requestConcurrency: number;
  retentionDays: number;
  storage: TransferBundleStorage;
  targets: TransferBundleTarget[];
  transferResolverMode: EffectiveTransferResolverMode;
}): TransferBundleRecord | undefined {
  const store = readTransferBundleStore(params.storage, {
    removeCorruptedStore: true,
    rewriteSanitizedStore: true,
  });
  const bundle = store.bundles.find((record) => record.id === params.bundleId);

  if (!bundle) {
    return undefined;
  }

  // A localStorage hit is trusted only if it matches the current resolver inputs
  // and contains an explicit entry for every requested stop area. Empty arrays are
  // valid because they mean "resolved successfully with no transfer".
  if (
    !transferBundleRecordMatchesRequest(bundle, {
      lineId: params.lineId,
      nearbyDistanceMeters: params.nearbyDistanceMeters,
      transferResolverMode: params.transferResolverMode,
    }) ||
    !isTransferBundleRecordFresh(bundle, Date.now(), params.retentionDays) ||
    !isCompleteTransferBundleResponse(params.targets, bundle)
  ) {
    return undefined;
  }

  return bundle;
}

function transferBundleRecordMatchesRequest(
  bundle: TransferBundleRecord,
  request: {
    lineId: string;
    nearbyDistanceMeters: number;
    transferResolverMode: EffectiveTransferResolverMode;
  },
): boolean {
  return (
    normalizeBundleComparableText(bundle.lineId) ===
    normalizeBundleComparableText(request.lineId) &&
    bundle.transferResolverMode === request.transferResolverMode &&
    normalizeTransferBundleNearbyDistanceMeters(bundle.nearbyDistanceMeters) ===
    request.nearbyDistanceMeters
  );
}

function writeTransferBundleStore(
  store: TransferBundleStore,
  storage: TransferBundleStorage,
): void {
  [
    ...LEGACY_TRANSFER_BUNDLE_STORAGE_KEYS,
    ...LEGACY_TRANSFER_BUNDLE_AUXILIARY_STORAGE_KEYS,
  ].forEach((key) => storage.removeItem(key));

  if (store.bundles.length === 0) {
    storage.removeItem(TRANSFER_BUNDLE_STORAGE_KEY);
    return;
  }

  try {
    storage.setItem(TRANSFER_BUNDLE_STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    // localStorage can be unavailable or full. Transfer bundles are only an
    // optimization layer, so the app must continue with backend/live resolving.
    logTransferBundleClientDebug("local-cache:write-error", {
      error: formatTransferBundleClientDebugError(error),
      storageKey: TRANSFER_BUNDLE_STORAGE_KEY,
    });
  }
}

function createEmptyStore(): TransferBundleStore {
  return {
    version: 1,
    bundles: [],
  };
}

function createBundleLoadResult(
  transfersByStopAreaRef: Record<string, TransferLineOption[]>,
  targets: TransferBundleTarget[],
): TransferBundleLoadResult {
  const missingTargetRefs = targets
    .filter(
      (target) =>
        !Object.prototype.hasOwnProperty.call(
          transfersByStopAreaRef,
          target.stopAreaRef,
        ),
    )
    .map((target) => target.stopAreaRef);

  return {
    complete: missingTargetRefs.length === 0,
    missingTargetRefs,
    targetCount: targets.length,
    transfersByStopAreaRef,
  };
}

function reportBundleProgress(
  targets: TransferBundleTarget[],
  transfersByStopAreaRef: Record<string, TransferLineOption[]>,
  onProgress: ((progress: TransferBundleLoadProgress) => void) | undefined,
): void {
  if (!onProgress || targets.length === 0) {
    return;
  }

  const completed = targets.filter((target) =>
    Object.prototype.hasOwnProperty.call(
      transfersByStopAreaRef,
      target.stopAreaRef,
    ),
  ).length;

  onProgress({
    completed,
    failed: 0,
    pending: Math.max(0, targets.length - completed),
    total: targets.length,
  });
}

function createTransferBundleId(
  lineId: string,
  transferResolverMode: EffectiveTransferResolverMode,
  nearbyDistanceMeters: number,
): string {
  // Concurrency and spacing only change how fast the bundle is built. They must
  // not create different cache keys because the expected transfer content is the
  // same for the same line, resolver mode and distance.
  return `${lineId.trim().toLowerCase()}::${transferResolverMode}::d${nearbyDistanceMeters}`;
}

function getBundleLineId(board: TransitBoardConfig): string {
  return board.schedule?.lineRef ?? board.line.ref ?? board.line.shortName;
}

function getBundleLineLabel(board: TransitBoardConfig): string {
  return `${board.line.mode === "metro" ? "Ligne" : board.line.longName} ${board.line.mode === "metro" ? board.line.shortName : ""
    }`
    .replace(/\s+/g, " ")
    .trim();
}

function getStopAreaRef(source: DepartureCall | LineRouteStop): string | undefined {
  return (
    source.stopAreaRef ??
    ("station" in source ? source.station.scheduleStopAreaRef : undefined)
  );
}

function isTransferBundleRecord(value: unknown): value is TransferBundleRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TransferBundleRecord>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.lineId === "string" &&
    typeof candidate.lineLabel === "string" &&
    candidate.transferResolverMode === "nearby" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.expiresAt === "string" &&
    typeof candidate.retentionDays === "number" &&
    typeof candidate.requestConcurrency === "number" &&
    (candidate.nearbyDistanceMeters === undefined ||
      typeof candidate.nearbyDistanceMeters === "number") &&
    isTransferMap(candidate.transfersByStopAreaRef)
  );
}

function isTransferBundleResponse(value: unknown): value is TransferBundleResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TransferBundleResponse>;

  return (
    candidate.version === 1 &&
    typeof candidate.generatedAt === "string" &&
    typeof candidate.lineId === "string" &&
    typeof candidate.lineLabel === "string" &&
    isTransferMap(candidate.transfersByStopAreaRef) &&
    (candidate.nearbyDistanceMeters === undefined ||
      typeof candidate.nearbyDistanceMeters === "number") &&
    (candidate.requestConcurrency === undefined ||
      typeof candidate.requestConcurrency === "number") &&
    (candidate.transferResolverMode === undefined ||
      candidate.transferResolverMode === "nearby")
  );
}

function isTransferMap(value: unknown): value is Record<string, TransferLineOption[]> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(Array.isArray)
  );
}

function isTransferBundleRecordFresh(
  bundle: TransferBundleRecord,
  now: number,
  requestedRetentionDays?: number,
): boolean {
  const expiresAt = Date.parse(bundle.expiresAt);

  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return false;
  }

  if (requestedRetentionDays === undefined) {
    return true;
  }

  const updatedAt = Date.parse(bundle.updatedAt);

  if (!Number.isFinite(updatedAt)) {
    return false;
  }

  return updatedAt + normalizeTransferBundleRetentionDays(requestedRetentionDays) * DAY_MS > now;
}

function createTransferBundleSummary(bundle: TransferBundleRecord): TransferBundleSummary {
  return {
    id: bundle.id,
    lineId: bundle.lineId,
    lineLabel: bundle.lineLabel,
    updatedAt: bundle.updatedAt,
    expiresAt: bundle.expiresAt,
    retentionDays: bundle.retentionDays,
    requestConcurrency: bundle.requestConcurrency,
    nearbyDistanceMeters: bundle.nearbyDistanceMeters,
    stopAreaCount: Object.keys(bundle.transfersByStopAreaRef).length,
    transferCount: Object.values(bundle.transfersByStopAreaRef).reduce(
      (count, transfers) => count + transfers.length,
      0,
    ),
    transferResolverMode: bundle.transferResolverMode,
  };
}

function deleteLocalTransferBundleById(
  id: string,
  storage: TransferBundleStorage,
): void {
  const store = readTransferBundleStore(storage, {
    removeCorruptedStore: true,
    rewriteSanitizedStore: true,
  });

  writeTransferBundleStore(
    {
      ...store,
      bundles: store.bundles.filter((bundle) => bundle.id !== id),
    },
    storage,
  );
}

function deleteLocalTransferBundlesForLine(
  lineId: string,
  storage: TransferBundleStorage,
  options?: TransferBundleClearOptions,
  board?: TransitBoardConfig,
): void {
  const store = readTransferBundleStore(storage, {
    removeCorruptedStore: true,
    rewriteSanitizedStore: true,
  });
  const expectedResolverMode = board
    ? resolveEffectiveTransferResolverMode(
      options?.transferResolverMode ?? "auto",
      board.line.mode,
    )
    : undefined;
  const expectedDistance = board
    ? normalizeTransferBundleNearbyDistanceMeters(
      options?.nearbyDistanceMeters ??
      resolveTransferBundleNearbyDistanceMeters(
        options?.transportType ?? board.line.mode,
      ),
    )
    : undefined;

  writeTransferBundleStore(
    {
      ...store,
      bundles: store.bundles.filter((bundle) => {
        if (
          normalizeBundleComparableText(bundle.lineId) !==
          normalizeBundleComparableText(lineId)
        ) {
          return true;
        }

        if (
          expectedResolverMode !== undefined &&
          bundle.transferResolverMode !== expectedResolverMode
        ) {
          return true;
        }

        if (
          expectedDistance !== undefined &&
          normalizeTransferBundleNearbyDistanceMeters(bundle.nearbyDistanceMeters) !==
          expectedDistance
        ) {
          return true;
        }

        return false;
      }),
    },
    storage,
  );
}

function resolveLocalTransferBundleStorage(
  options?: TransferBundleLocalCacheOptions,
): TransferBundleStorage | undefined {
  if (!options?.localCacheEnabled) {
    return undefined;
  }

  return options.localCacheStorage ?? getBrowserStorage();
}

function isTransferBundleStorage(
  value: unknown,
): value is TransferBundleStorage {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as Partial<TransferBundleStorage>).getItem === "function" &&
    typeof (value as Partial<TransferBundleStorage>).setItem === "function" &&
    typeof (value as Partial<TransferBundleStorage>).removeItem === "function"
  );
}

function normalizeBundleComparableText(value: string): string {
  return value.trim().toLowerCase();
}

function transferBundleClientDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const value = window.localStorage.getItem(TRANSFER_BUNDLE_DEBUG_STORAGE_KEY);
    //  TODO : At the moment, always debug
    return true;
    // return value === "1" || value === "true";
  } catch {
    return false;
  }
}

function logTransferBundleClientDebug(
  step: string,
  details: Record<string, unknown> = {},
): void {
  if (!transferBundleClientDebugEnabled()) {
    return;
  }

  console.info(`[transfer-bundles:client] ${step}`, details);
}

function formatTransferBundleClientDebugError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getBrowserStorage(): TransferBundleStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
