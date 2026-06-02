import type {
  DepartureCall,
  DepartureCallingPattern,
  LineRouteStop,
  TransferLineOption,
  TransitBoardConfig,
} from "../../types/transit";

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
  transfersByStopAreaRef: Record<string, TransferLineOption[]>;
}

export interface TransferBundleRecord extends TransferBundleResponse {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  retentionDays: number;
}

export interface TransferBundleSummary {
  id: string;
  lineId: string;
  lineLabel: string;
  updatedAt: string;
  expiresAt: string;
  retentionDays: number;
  stopAreaCount: number;
  transferCount: number;
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

const TRANSFER_BUNDLE_STORAGE_KEY = "transport-clock.transfer-bundles.v2";
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const storage = getBrowserStorage();
  const lineId = getBundleLineId(board);
  const lineLabel = getBundleLineLabel(board);
  const targets = collectTransferBundleTargets(pattern);

  if (!storage || targets.length === 0) {
    return {};
  }

  pruneExpiredTransferBundles(storage);

  const existing = readTransferBundleRecord(lineId, storage);
  const missingTargets = targets.filter(
    (target) =>
      !existing ||
      !Object.prototype.hasOwnProperty.call(
        existing.transfersByStopAreaRef,
        target.stopAreaRef,
      ),
  );

  if (existing && missingTargets.length === 0 && !isTransferBundleExpired(existing)) {
    return existing.transfersByStopAreaRef;
  }

  try {
    const requestedTargets = missingTargets.length > 0 ? missingTargets : targets;
    const response = await fetchTransferBundle({
      lineId,
      lineLabel,
      targets: requestedTargets,
      retentionDays,
    });

    const merged = saveTransferBundle(response, retentionDays, storage);

    return merged.transfersByStopAreaRef;
  } catch (error) {
    if (existing) {
      return existing.transfersByStopAreaRef;
    }

    return {};
  }
}

export function listTransferBundles(
  storage = getBrowserStorage(),
): TransferBundleSummary[] {
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
      stopAreaCount: Object.keys(bundle.transfersByStopAreaRef).length,
      transferCount: Object.values(bundle.transfersByStopAreaRef).reduce(
        (count, transfers) => count + transfers.length,
        0,
      ),
    }))
    .sort((left, right) => left.lineLabel.localeCompare(right.lineLabel, "fr"));
}

export function clearTransferBundles(storage = getBrowserStorage()): void {
  storage?.removeItem(TRANSFER_BUNDLE_STORAGE_KEY);
}

export function deleteTransferBundle(
  id: string,
  storage = getBrowserStorage(),
): void {
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
  const id = createTransferBundleId(response.lineId);
  const store = storage ? readTransferBundleStore(storage) : createEmptyStore();
  const existing = store.bundles.find((bundle) => bundle.id === id);
  const createdAt = existing?.createdAt ?? new Date(now).toISOString();
  const record: TransferBundleRecord = {
    ...response,
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

function readTransferBundleRecord(
  lineId: string,
  storage: TransferBundleStorage,
): TransferBundleRecord | undefined {
  const id = createTransferBundleId(lineId);

  return readTransferBundleStore(storage).bundles.find(
    (bundle) => bundle.id === id,
  );
}

function fetchTransferBundle(payload: {
  lineId: string;
  lineLabel: string;
  retentionDays: number;
  targets: TransferBundleTarget[];
}): Promise<TransferBundleResponse> {
  return fetch("/api/transfer-bundles", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return (await response.json()) as TransferBundleResponse;
  });
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

function writeTransferBundleStore(
  store: TransferBundleStore,
  storage: TransferBundleStorage,
): void {
  storage.setItem(TRANSFER_BUNDLE_STORAGE_KEY, JSON.stringify(store));
}

function createEmptyStore(): TransferBundleStore {
  return {
    version: 1,
    bundles: [],
  };
}

function createTransferBundleId(lineId: string): string {
  return lineId.trim().toLowerCase();
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

function isTransferBundleExpired(bundle: TransferBundleRecord): boolean {
  return Date.parse(bundle.expiresAt) <= Date.now();
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
    typeof candidate.updatedAt === "string" &&
    typeof candidate.expiresAt === "string" &&
    typeof candidate.retentionDays === "number" &&
    Boolean(candidate.transfersByStopAreaRef) &&
    typeof candidate.transfersByStopAreaRef === "object"
  );
}

function getBrowserStorage(): TransferBundleStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
