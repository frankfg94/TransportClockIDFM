import type {
  DepartureCall,
  DepartureCallingPattern,
  LineRouteStop,
  TransferLineOption,
  TransitBoardConfig,
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
  requestConcurrency?: number;
  transferResolverMode?: EffectiveTransferResolverMode;
  transfersByStopAreaRef: Record<string, TransferLineOption[]>;
}

export interface TransferBundleRecord extends Omit<TransferBundleResponse, "transferResolverMode"> {
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

const TRANSFER_BUNDLE_STORAGE_KEY = "transport-clock.transfer-bundles.v12";
const LEGACY_TRANSFER_BUNDLE_STORAGE_KEYS = [
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
const DAY_MS = 24 * 60 * 60 * 1000;
const pendingTransferBundleRequests = new Map<
  string,
  Promise<TransferBundleResponse>
>();

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
): Promise<Record<string, TransferLineOption[]>> {
  const result = await loadTransferBundleResultForPattern(
    board,
    pattern,
    retentionDays,
  );

  return result.transfersByStopAreaRef;
}

export async function loadTransferBundleResultForPattern(
  board: TransitBoardConfig,
  pattern: DepartureCallingPattern,
  retentionDays: number,
  options: {
    onProgress?: (progress: TransferBundleLoadProgress) => void;
    requestConcurrency?: number;
    requestSpacingMs?: number;
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
  const transfersByStopAreaRef: Record<string, TransferLineOption[]> = {};
  reportBundleProgress(targets, transfersByStopAreaRef, options.onProgress);

  try {
    const response = await fetchTransferBundle({
      lineId,
      lineLabel,
      requestConcurrency,
      requestSpacingMs,
      targets,
      transferResolverMode,
      retentionDays,
    }).catch(() => undefined);

    if (!response || !transferBundleResponseHasRequestedTarget(targets, response)) {
      return createBundleLoadResult(transfersByStopAreaRef, targets);
    }

    Object.assign(transfersByStopAreaRef, response.transfersByStopAreaRef);
    reportBundleProgress(targets, transfersByStopAreaRef, options.onProgress);
  } catch {
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

function fetchTransferBundle(payload: {
  lineId: string;
  lineLabel: string;
  requestConcurrency: number;
  requestSpacingMs: number;
  retentionDays: number;
  targets: TransferBundleTarget[];
  transferResolverMode: EffectiveTransferResolverMode;
}): Promise<TransferBundleResponse> {
  const requestKey = createTransferBundleRequestKey(payload);
  const pendingRequest = pendingTransferBundleRequests.get(requestKey);

  if (pendingRequest) {
    return pendingRequest;
  }

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

      return {
        ...transferBundle,
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
  requestConcurrency: number;
  requestSpacingMs: number;
  retentionDays: number;
  targets: TransferBundleTarget[];
  transferResolverMode: EffectiveTransferResolverMode;
}): string {
  return JSON.stringify({
    lineId: payload.lineId,
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
  });
}

export function clearPendingTransferBundleRequestsForTests(): void {
  pendingTransferBundleRequests.clear();
}

function readTransferBundleStore(storage: TransferBundleStorage): TransferBundleStore {
  try {
    const rawValue = storage.getItem(TRANSFER_BUNDLE_STORAGE_KEY);

    if (!rawValue) {
      return createEmptyStore();
    }

    const parsed = JSON.parse(rawValue) as Partial<TransferBundleStore>;

    if (!Array.isArray(parsed.bundles)) {
      return createEmptyStore();
    }

    return {
      version: 1,
      bundles: parsed.bundles.filter(isTransferBundleRecord),
    };
  } catch {
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

  if (!storage) {
    return [];
  }

  pruneExpiredTransferBundles(storage);

  return readTransferBundleStore(storage).bundles
    .map((bundle) => ({
      id: bundle.id,
      lineId: bundle.lineId,
      lineLabel: bundle.lineLabel,
      updatedAt: bundle.updatedAt,
      expiresAt: bundle.expiresAt,
      retentionDays: bundle.retentionDays,
      requestConcurrency: bundle.requestConcurrency,
      stopAreaCount: Object.keys(bundle.transfersByStopAreaRef).length,
      transferCount: Object.values(bundle.transfersByStopAreaRef).reduce(
        (count, transfers) => count + transfers.length,
        0,
      ),
      transferResolverMode: bundle.transferResolverMode,
    }))
    .sort((left, right) => left.lineLabel.localeCompare(right.lineLabel, "fr"));
}

export function clearTransferBundles(storage: TransferBundleStorage): void;
export function clearTransferBundles(): Promise<void>;
export function clearTransferBundles(
  storage?: TransferBundleStorage,
): void | Promise<void> {
  if (!storage) {
    return requestTransferBundleCacheDelete();
  }

  if (!storage) {
    return;
  }

  TRANSFER_BUNDLE_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
}

export function deleteTransferBundle(
  id: string,
  storage: TransferBundleStorage,
): void;
export function deleteTransferBundle(id: string): Promise<void>;
export function deleteTransferBundle(
  id: string,
  storage?: TransferBundleStorage,
): void | Promise<void> {
  if (!storage) {
    return requestTransferBundleCacheDelete({ id });
  }

  if (!storage) {
    return;
  }

  const store = readTransferBundleStore(storage);

  writeTransferBundleStore(
    {
      ...store,
      bundles: store.bundles.filter((bundle) => bundle.id !== id),
    },
    storage,
  );
}

export function clearTransferBundleForBoard(
  board: TransitBoardConfig,
  storage: TransferBundleStorage,
): void;
export function clearTransferBundleForBoard(
  board: TransitBoardConfig,
): Promise<void>;
export function clearTransferBundleForBoard(
  board: TransitBoardConfig,
  storage?: TransferBundleStorage,
): void | Promise<void> {
  const lineId = getBundleLineId(board);

  if (!storage) {
    return requestTransferBundleCacheDelete({ lineId });
  }

  if (!storage) {
    return;
  }

  const store = readTransferBundleStore(storage);

  writeTransferBundleStore(
    {
      ...store,
      bundles: store.bundles.filter((bundle) => bundle.lineId !== lineId),
    },
    storage,
  );
}

export function pruneExpiredTransferBundles(
  storage = getBrowserStorage(),
  now = Date.now(),
): void {
  if (!storage) {
    return;
  }

  const store = readTransferBundleStore(storage);
  const bundles = store.bundles.filter(
    (bundle) => Date.parse(bundle.expiresAt) > now,
  );

  if (bundles.length !== store.bundles.length) {
    writeTransferBundleStore({ ...store, bundles }, storage);
  }
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
  const id = createTransferBundleId(
    response.lineId,
    transferResolverMode,
    requestConcurrency,
  );
  const store = storage ? readTransferBundleStore(storage) : createEmptyStore();
  const existing = store.bundles.find((bundle) => bundle.id === id);
  const createdAt = existing?.createdAt ?? new Date(now).toISOString();
  const record: TransferBundleRecord = {
    ...response,
    requestConcurrency,
    transferResolverMode,
    id,
    createdAt,
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + retentionDays * DAY_MS).toISOString(),
    retentionDays,
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

  storage.setItem(TRANSFER_BUNDLE_STORAGE_KEY, JSON.stringify(store));
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
  requestConcurrency: number,
): string {
  return `${lineId.trim().toLowerCase()}::${transferResolverMode}::c${requestConcurrency}`;
}

function getBundleLineId(board: TransitBoardConfig): string {
  return board.schedule?.lineRef ?? board.line.ref ?? board.line.shortName;
}

function getBundleLineLabel(board: TransitBoardConfig): string {
  return `${board.line.mode === "metro" ? "Ligne" : board.line.longName} ${
    board.line.mode === "metro" ? board.line.shortName : ""
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
    Boolean(candidate.transfersByStopAreaRef) &&
    typeof candidate.transfersByStopAreaRef === "object"
  );
}

function getBrowserStorage(): TransferBundleStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
