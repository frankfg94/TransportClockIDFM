import {
  fetchTransitFamilyOptions,
  fetchStationTransfers,
  searchLineStations,
  searchTransitLines,
} from "../../services/idfm";
import type {
  DepartureCall,
  DepartureCallingPattern,
  LineSearchOption,
  LineRouteStop,
  StationSearchOption,
  TransferLineOption,
  TransitBoardConfig,
  TransitFamily,
  TransitFamilyOption,
  TransitMode,
} from "../../types/transit";
import {
  createPatternStationKey,
  normalizePatternStationName,
  patternStationKeysAreCompatible,
  type PatternStationKeySource,
} from "./stationKeys";
import {
  loadTransferBundleResultForPattern,
  type TransferBundleLoadProgress,
} from "./transferBundles";
import type { TransferResolverMode } from "./transferResolverMode";

interface PatternTransferHydrationClient {
  getTransitFamilies?(): Promise<TransitFamilyOption[]>;
  searchLines(
    network: TransitFamilyOption,
    query: string,
  ): Promise<LineSearchOption[]>;
  searchStations(
    line: LineSearchOption,
    query: string,
  ): Promise<StationSearchOption[]>;
  fetchTransfers(
    station: StationSearchOption,
    currentLineId?: string,
    options?: {
      transferScope?: "connected" | "direct";
    },
  ): Promise<TransferLineOption[]>;
}

interface TransferTarget {
  key: string;
  label: string;
  city?: string;
  stopAreaRef?: string;
}

export interface PatternTransferHydrationProgress {
  completed: number;
  failed: number;
  pending: number;
  total: number;
}

interface PatternTransferHydrationOptions {
  onProgress?: (progress: PatternTransferHydrationProgress) => void;
  preferBundle?: boolean;
  retentionDays?: number;
  transferBundleRequestConcurrency?: number;
  transferBundleRequestSpacingMs?: number;
  transportType?: string;
  transferResolverMode?: TransferResolverMode;
}

const MAX_TRANSFER_STATIONS = 64;
const TRANSFER_BATCH_SIZE = 8;
const liveClient: PatternTransferHydrationClient = {
  getTransitFamilies: fetchTransitFamilyOptions,
  searchLines: searchTransitLines,
  searchStations: searchLineStations,
  fetchTransfers: fetchStationTransfers,
};

const resolvedLineCache = new Map<string, Promise<LineSearchOption | undefined>>();
const lineStationsCache = new Map<string, Promise<StationSearchOption[]>>();
const stationTransferCache = new Map<string, Promise<TransferLineOption[]>>();

export async function hydrateDeparturePatternTransfers(
  board: TransitBoardConfig,
  pattern: DepartureCallingPattern,
  client: PatternTransferHydrationClient = liveClient,
  options: PatternTransferHydrationOptions = {},
): Promise<DepartureCallingPattern> {
  let hydrationBasePattern = pattern;
  let targetFilter: ((target: TransferTarget) => boolean) | undefined;
  let overallTotal = 0;
  let overallCompleted = 0;
  let overallFailed = 0;

  if (options.preferBundle !== false && client === liveClient) {
    const bundledResult = await hydratePatternTransfersFromBundle(
      board,
      pattern,
      options.retentionDays ?? 15,
      options.transferResolverMode ?? "auto",
      options.transferBundleRequestConcurrency,
      options.transferBundleRequestSpacingMs,
      options.transportType,
      (progress) => {
        overallTotal = progress.total;
        overallCompleted = progress.completed;
        overallFailed = progress.failed;
        reportTransferHydrationProgress(options.onProgress, {
          completed: overallCompleted,
          failed: overallFailed,
          total: overallTotal,
        });
      },
    ).catch(() => undefined);

    if (bundledResult?.complete) {
      reportTransferHydrationProgress(options.onProgress, {
        completed: bundledResult.targetCount,
        failed: 0,
        total: bundledResult.targetCount,
      });
      return bundledResult.pattern;
    }

    if (bundledResult) {
      hydrationBasePattern = bundledResult.pattern;
      const missingRefs = new Set(bundledResult.missingTargetRefs);
      overallTotal = bundledResult.targetCount;
      overallCompleted = Math.max(
        0,
        bundledResult.targetCount - bundledResult.missingTargetRefs.length,
      );
      overallFailed = 0;
      reportTransferHydrationProgress(options.onProgress, {
        completed: overallCompleted,
        failed: overallFailed,
        total: overallTotal,
      });

      targetFilter = (target) =>
        Boolean(target.stopAreaRef && missingRefs.has(target.stopAreaRef));
    }
  }

  const line = await resolveLineOption(board, client);

  if (!line) {
    return hydrationBasePattern;
  }

  const stations = await resolveLineStations(line, client);
  const targets = createTransferTargets(hydrationBasePattern)
    .filter((target) => (targetFilter ? targetFilter(target) : true))
    .slice(0, MAX_TRANSFER_STATIONS);

  if (targets.length === 0 || stations.length === 0) {
    return hydrationBasePattern;
  }

  if (overallTotal === 0) {
    overallTotal = targets.length;
    overallCompleted = 0;
    overallFailed = 0;
    reportTransferHydrationProgress(options.onProgress, {
      completed: overallCompleted,
      failed: overallFailed,
      total: overallTotal,
    });
  }

  const transfersByKey = new Map<string, TransferLineOption[]>();

  for (let index = 0; index < targets.length; index += TRANSFER_BATCH_SIZE) {
    const batch = targets.slice(index, index + TRANSFER_BATCH_SIZE);
    const entries = await Promise.all(
      batch.map(async (target) => {
        const station = findMatchingStation(target, stations);

        if (!station) {
          overallFailed += 1;
          overallCompleted += 1;
          reportTransferHydrationProgress(options.onProgress, {
            completed: overallCompleted,
            failed: overallFailed,
            total: overallTotal,
          });

          return [target.key, [] as TransferLineOption[]] as const;
        }

        let failed = false;
        const transfers = await fetchCachedTransfers(
          station,
          line.id,
          client,
          "connected",
        ).catch((): TransferLineOption[] => {
          failed = true;

          return [];
        });

        if (failed) {
          overallFailed += 1;
        }
        overallCompleted += 1;
        reportTransferHydrationProgress(options.onProgress, {
          completed: overallCompleted,
          failed: overallFailed,
          total: overallTotal,
        });

        return [target.key, transfers] as const;
      }),
    );

    entries.forEach(([key, transfers]) => {
      transfersByKey.set(key, transfers);
    });
  }

  return {
    ...hydrationBasePattern,
    calls: hydrationBasePattern.calls.map((call) =>
      enrichCallTransfers(call, transfersByKey),
    ),
    lineTopology: hydrationBasePattern.lineTopology?.map((sequence) => ({
      ...sequence,
      stops: sequence.stops.map((stop) =>
        enrichStopTransfers(stop, transfersByKey),
      ),
    })),
  };
}

async function hydratePatternTransfersFromBundle(
  board: TransitBoardConfig,
  pattern: DepartureCallingPattern,
  retentionDays: number,
  transferResolverMode: TransferResolverMode,
  requestConcurrency?: number,
  requestSpacingMs?: number,
  transportType?: string,
  onProgress?: (progress: TransferBundleLoadProgress) => void,
): Promise<{
  complete: boolean;
  missingTargetRefs: string[];
  targetCount: number;
  pattern: DepartureCallingPattern;
}> {
  const bundleResult = await loadTransferBundleResultForPattern(
    board,
    pattern,
    retentionDays,
    {
      onProgress,
      requestConcurrency,
      requestSpacingMs,
      transportType,
      transferResolverMode,
    },
  );
  const transfersByStopAreaRef = bundleResult.transfersByStopAreaRef;

  if (Object.keys(transfersByStopAreaRef).length === 0) {
    throw new Error("Transfer bundle is empty.");
  }

  return {
    complete: bundleResult.complete,
    missingTargetRefs: bundleResult.missingTargetRefs,
    targetCount: bundleResult.targetCount,
    pattern: {
      ...pattern,
      calls: pattern.calls.map((call) => ({
        ...call,
        transferLines: mergeTransferOptions(
          call.transferLines,
          getBundledTransfers(call, transfersByStopAreaRef),
        ),
      })),
      lineTopology: pattern.lineTopology?.map((sequence) => ({
        ...sequence,
        stops: sequence.stops.map((stop) => ({
          ...stop,
          transferLines: mergeTransferOptions(
            stop.transferLines,
            getBundledTransfers(stop, transfersByStopAreaRef),
          ),
        })),
      })),
    },
  };
}

export function clearPatternTransferRuntimeCaches(): void {
  resolvedLineCache.clear();
  lineStationsCache.clear();
  stationTransferCache.clear();
}

function createTransferTargets(pattern: DepartureCallingPattern): TransferTarget[] {
  const targets = new Map<string, TransferTarget>();
  const addTarget = (source: PatternStationKeySource & { city?: string }): void => {
    const key = createPatternStationKey(source);

    if (!key || targets.has(key)) {
      return;
    }

    targets.set(key, {
      key,
      label: source.label,
      city: source.city,
      stopAreaRef: source.stopAreaRef ?? source.station?.scheduleStopAreaRef,
    });
  };

  pattern.lineTopology?.forEach((sequence) => {
    sequence.stops.forEach(addTarget);
  });
  pattern.calls.forEach(addTarget);

  return Array.from(targets.values());
}

async function resolveLineOption(
  board: TransitBoardConfig,
  client: PatternTransferHydrationClient,
): Promise<LineSearchOption | undefined> {
  const family = transitFamilyFromMode(board.line.mode);
  const query = board.line.shortName || board.line.longName;
  const realLineId = getRealNavitiaLineId(board);
  const cacheKey = `${family}:${realLineId ?? ""}:${query}`;
  const cached = resolvedLineCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = (async () => {
    if (realLineId) {
      return createLineOptionFromBoard(board, family, realLineId);
    }

    const network = await resolveTransitFamilyOption(family, client);
    const lines = await findLineOptions(network, query, client);
    const normalizedQuery = normalizePatternStationName(query);

    return (
      lines.find((line) => normalizePatternStationName(line.label) === normalizedQuery) ??
      lines.find((line) =>
        normalizePatternStationName(line.displayName ?? "").startsWith(
          normalizedQuery,
        ),
      ) ??
      lines[0]
    );
  })();

  resolvedLineCache.set(cacheKey, request);

  return request;
}

async function resolveTransitFamilyOption(
  family: TransitFamily,
  client: PatternTransferHydrationClient,
): Promise<TransitFamilyOption> {
  const options = await client.getTransitFamilies?.().catch(() => []);
  const option = options?.find((candidate) => candidate.family === family);

  return (
    option ?? {
      id: family.toLowerCase(),
      label: family,
      family,
    }
  );
}

async function findLineOptions(
  network: TransitFamilyOption,
  query: string,
  client: PatternTransferHydrationClient,
): Promise<LineSearchOption[]> {
  const queriedLines = await client.searchLines(network, query);

  if (queriedLines.length > 0 || !query.trim()) {
    return queriedLines;
  }

  return client.searchLines(network, "");
}

function createLineOptionFromBoard(
  board: TransitBoardConfig,
  family: TransitFamily,
  lineId: string,
): LineSearchOption {
  return {
    family,
    id: lineId,
    navitiaId: lineId,
    ref: board.line.ref,
    label: board.line.shortName || board.line.longName,
    displayName: board.line.longName,
    color: board.line.color,
    textColor: board.line.textColor,
    iconUrl: board.line.iconUrl,
    iconUrls: board.line.iconUrls,
  };
}

async function resolveLineStations(
  line: LineSearchOption,
  client: PatternTransferHydrationClient,
): Promise<StationSearchOption[]> {
  const cached = lineStationsCache.get(line.id);

  if (cached) {
    return cached;
  }

  const request = client.searchStations(line, "");

  lineStationsCache.set(line.id, request);

  return request;
}

function findMatchingStation(
  target: TransferTarget,
  stations: StationSearchOption[],
): StationSearchOption | undefined {
  const stopAreaRef = target.stopAreaRef;

  if (stopAreaRef?.startsWith("stop_area:")) {
    const exact = stations.find(
      (station) =>
        station.id === stopAreaRef || station.scheduleStopAreaRef === stopAreaRef,
    );

    if (exact) {
      return exact;
    }
  }

  const targetKey = normalizePatternStationName(target.label);
  const targetCityKey = normalizePatternStationName(target.city ?? "");

  return stations.find((station) => {
    const stationKey = normalizePatternStationName(station.label);
    const stationCityKey = normalizePatternStationName(station.city ?? "");

    return (
      patternStationKeysAreCompatible(targetKey, stationKey) &&
      (!targetCityKey || !stationCityKey || targetCityKey === stationCityKey)
    );
  }) ?? findStationByDistinctiveNameToken(target, stations);
}

function findStationByDistinctiveNameToken(
  target: TransferTarget,
  stations: StationSearchOption[],
): StationSearchOption | undefined {
  const targetTokens = createStationNameTokens(target.label);

  if (targetTokens.length === 0) {
    return undefined;
  }

  const stationTokenCounts = new Map<string, number>();
  const stationTokens = new Map<string, Set<string>>();

  stations.forEach((station) => {
    const tokens = new Set(createStationNameTokens(station.label));

    stationTokens.set(station.id, tokens);
    tokens.forEach((token) => {
      stationTokenCounts.set(token, (stationTokenCounts.get(token) ?? 0) + 1);
    });
  });

  return stations
    .map((station) => {
      const tokens = stationTokens.get(station.id) ?? new Set<string>();
      const score = targetTokens.filter(
        (token) => tokens.has(token) && stationTokenCounts.get(token) === 1,
      ).length;

      return { station, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)[0]?.station;
}

function createStationNameTokens(label: string): string[] {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 4);
}

function fetchCachedTransfers(
  station: StationSearchOption,
  lineId: string,
  client: PatternTransferHydrationClient,
  transferScope: "connected" | "direct",
): Promise<TransferLineOption[]> {
  const stationId = station.scheduleStopAreaRef ?? station.id;
  const cacheKey = `${transferScope}:${lineId}:${stationId}`;
  const cached = stationTransferCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const request = client.fetchTransfers(station, lineId, { transferScope });

  stationTransferCache.set(cacheKey, request);

  return request;
}

function reportTransferHydrationProgress(
  onProgress: ((progress: PatternTransferHydrationProgress) => void) | undefined,
  progress: Omit<PatternTransferHydrationProgress, "pending">,
): void {
  if (!onProgress || progress.total <= 0) {
    return;
  }

  const completed = Math.min(progress.total, Math.max(0, progress.completed));
  const failed = Math.min(completed, Math.max(0, progress.failed));

  onProgress({
    completed,
    failed,
    pending: Math.max(0, progress.total - completed),
    total: progress.total,
  });
}

function enrichCallTransfers(
  call: DepartureCall,
  transfersByKey: Map<string, TransferLineOption[]>,
): DepartureCall {
  const transfers = transfersByKey.get(createPatternStationKey(call));

  if (!transfers) {
    return call;
  }

  return {
    ...call,
    transferLines: mergeTransferOptions(call.transferLines, transfers),
  };
}

function enrichStopTransfers(
  stop: LineRouteStop,
  transfersByKey: Map<string, TransferLineOption[]>,
): LineRouteStop {
  const transfers = transfersByKey.get(createPatternStationKey(stop));

  if (!transfers) {
    return stop;
  }

  return {
    ...stop,
    transferLines: mergeTransferOptions(stop.transferLines, transfers),
  };
}

function getBundledTransfers(
  source: DepartureCall | LineRouteStop,
  transfersByStopAreaRef: Record<string, TransferLineOption[]>,
): TransferLineOption[] {
  const stopAreaRef =
    source.stopAreaRef ??
    ("station" in source ? source.station.scheduleStopAreaRef : undefined);

  return stopAreaRef ? transfersByStopAreaRef[stopAreaRef] ?? [] : [];
}

function mergeTransferOptions(
  existing: TransferLineOption[] | undefined,
  fetched: TransferLineOption[],
): TransferLineOption[] {
  const deduped = new Map<string, TransferLineOption>();

  [...(existing ?? []), ...fetched].forEach((transfer) => {
    const key = [
      transfer.id,
      transfer.mode,
      transfer.family,
      normalizePatternStationName(transfer.label),
    ]
      .filter(Boolean)
      .join(":");

    if (!deduped.has(key)) {
      deduped.set(key, transfer);
    }
  });

  return Array.from(deduped.values());
}

function getRealNavitiaLineId(board: TransitBoardConfig): string | undefined {
  const lineRef = board.schedule?.lineRef || board.line.ref;

  if (/^line:IDFM:C\d+$/i.test(lineRef)) {
    return lineRef;
  }

  return undefined;
}

function transitFamilyFromMode(mode: TransitMode): TransitFamily {
  if (mode === "metro") {
    return "METRO";
  }

  if (mode === "rer") {
    return "RER";
  }

  if (mode === "tram") {
    return "TRAM";
  }

  if (mode === "bus") {
    return "BUS";
  }

  return "TRANSILIEN";
}
