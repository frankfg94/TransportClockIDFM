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
    options?: { transferScope?: "connected" | "direct" },
  ): Promise<TransferLineOption[]>;
}

interface TransferTarget {
  key: string;
  label: string;
  city?: string;
  stopAreaRef?: string;
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
): Promise<DepartureCallingPattern> {
  const line = await resolveLineOption(board, client);

  if (!line) {
    return pattern;
  }

  const stations = await resolveLineStations(line, client);
  const targets = createTransferTargets(pattern).slice(0, MAX_TRANSFER_STATIONS);

  if (targets.length === 0 || stations.length === 0) {
    return pattern;
  }

  const transfersByKey = new Map<string, TransferLineOption[]>();

  for (let index = 0; index < targets.length; index += TRANSFER_BATCH_SIZE) {
    const batch = targets.slice(index, index + TRANSFER_BATCH_SIZE);
    const entries = await Promise.all(
      batch.map(async (target) => {
        const station = findMatchingStation(target, stations);

        if (!station) {
          return [target.key, [] as TransferLineOption[]] as const;
        }

        // Pattern maps can contain dozens of stations. Direct stop-area transfers
        // are the fast pass; structural hubs get a second connected pass because
        // Navitia can split a single interchange across several nearby stop areas.
        const directTransfers = await fetchCachedTransfers(
          station,
          line.id,
          client,
          "direct",
        ).catch((): TransferLineOption[] => []);
        const transfers = shouldHydrateConnectedTransfers(directTransfers)
          ? mergeTransferOptions(
              directTransfers,
              await fetchCachedTransfers(
                station,
                line.id,
                client,
                "connected",
              ).catch((): TransferLineOption[] => []),
            )
          : directTransfers;

        return [target.key, transfers] as const;
      }),
    );

    entries.forEach(([key, transfers]) => {
      transfersByKey.set(key, transfers);
    });
  }

  return {
    ...pattern,
    calls: pattern.calls.map((call) =>
      enrichCallTransfers(call, transfersByKey),
    ),
    lineTopology: pattern.lineTopology?.map((sequence) => ({
      ...sequence,
      stops: sequence.stops.map((stop) =>
        enrichStopTransfers(stop, transfersByKey),
      ),
    })),
  };
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

function shouldHydrateConnectedTransfers(
  transfers: TransferLineOption[],
): boolean {
  return transfers.some((transfer) => !isBusLikeTransfer(transfer));
}

function isBusLikeTransfer(transfer: TransferLineOption): boolean {
  const normalizedValues = [transfer.family, transfer.mode, transfer.label]
    .filter((value): value is string => Boolean(value))
    .map(normalizePatternStationName);

  return normalizedValues.some(
    (value) =>
      value.includes("bus") ||
      value.includes("noctilien") ||
      /^n\d+/u.test(value),
  );
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
