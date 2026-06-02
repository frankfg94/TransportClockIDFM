import { createError, defineEventHandler, readBody } from "h3";
import { getServerIdfmApiKey } from "../services/idfm/resolveStopArea";
import { fetchStationTransfers, searchLineStations } from "../../src/services/idfm";
import type {
  LineSearchOption,
  StationSearchOption,
  TransitFamily,
  TransferLineOption,
} from "../../src/types/transit";
import type {
  TransferBundleResponse,
  TransferBundleTarget,
} from "../../src/features/service-pattern/transferBundles";

interface TransferBundleRequestBody {
  lineId?: string;
  lineLabel?: string;
  retentionDays?: number;
  targets?: TransferBundleTarget[];
}

type CachedTransferRequest = {
  expiresAt: number;
  promise: Promise<TransferLineOption[]>;
};

type CachedLineStationsRequest = {
  expiresAt: number;
  promise: Promise<StationSearchOption[]>;
};

const MARKETPLACE_NAVITIA_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia";
const MAX_TRANSFER_TARGETS = 96;
const SERVER_BATCH_SIZE = 4;
const DEFAULT_RETENTION_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

const transferCache = new Map<string, CachedTransferRequest>();
const lineStationsCache = new Map<string, CachedLineStationsRequest>();

export default defineEventHandler(async (event): Promise<TransferBundleResponse> => {
  const apiKey = getServerIdfmApiKey(event);

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: "IDFM_API_KEY is not configured on this deployment.",
    });
  }

  const body = normalizeRequestBody(await readBody<TransferBundleRequestBody>(event));
  const fetcher = createServerNavitiaFetcher(apiKey);
  const transfersByStopAreaRef: Record<string, TransferLineOption[]> = {};

  for (let index = 0; index < body.targets.length; index += SERVER_BATCH_SIZE) {
    const batch = body.targets.slice(index, index + SERVER_BATCH_SIZE);
    const entries = await Promise.all(
      batch.map(async (target) => [
        target.stopAreaRef,
        await getCachedTransfers(
          target,
          body.lineId,
          body.lineLabel,
          body.retentionDays,
          fetcher,
        ),
      ] as const),
    );

    entries.forEach(([stopAreaRef, transfers]) => {
      transfersByStopAreaRef[stopAreaRef] = transfers;
    });
  }

  trimTransferCache();

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    lineId: body.lineId,
    lineLabel: body.lineLabel,
    transfersByStopAreaRef,
  };
});

function normalizeRequestBody(body: TransferBundleRequestBody): Required<TransferBundleRequestBody> {
  const lineId = typeof body.lineId === "string" ? body.lineId.trim() : "";
  const lineLabel =
    typeof body.lineLabel === "string" && body.lineLabel.trim()
      ? body.lineLabel.trim()
      : lineId;
  const retentionDays = normalizeRetentionDays(body.retentionDays);
  const targets = (Array.isArray(body.targets) ? body.targets : [])
    .map(normalizeTarget)
    .filter((target): target is TransferBundleTarget => Boolean(target))
    .slice(0, MAX_TRANSFER_TARGETS);

  if (!lineId || targets.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "lineId and targets are required.",
    });
  }

  return {
    lineId,
    lineLabel,
    retentionDays,
    targets,
  };
}

function normalizeTarget(target: unknown): TransferBundleTarget | undefined {
  if (!target || typeof target !== "object") {
    return undefined;
  }

  const value = target as Partial<TransferBundleTarget>;
  const stopAreaRef =
    typeof value.stopAreaRef === "string" ? value.stopAreaRef.trim() : "";
  const label = typeof value.label === "string" ? value.label.trim() : stopAreaRef;

  if (!isSupportedTransferTargetRef(stopAreaRef)) {
    return undefined;
  }

  return {
    stopAreaRef,
    label,
    city: typeof value.city === "string" ? value.city : undefined,
  };
}

function normalizeRetentionDays(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  return [1, 3, 7, 15, 30, 60].includes(numericValue)
    ? numericValue
    : DEFAULT_RETENTION_DAYS;
}

function getCachedTransfers(
  target: TransferBundleTarget,
  currentLineId: string,
  currentLineLabel: string,
  retentionDays: number,
  fetcher: typeof fetch,
): Promise<TransferLineOption[]> {
  const now = Date.now();
  const cacheKey = `${currentLineId}:${target.stopAreaRef}`;
  const cached = transferCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const request = fetchTransfersForTarget(
    target,
    currentLineId,
    currentLineLabel,
    retentionDays,
    fetcher,
  ).catch((): TransferLineOption[] => []);

  transferCache.set(cacheKey, {
    expiresAt: now + retentionDays * DAY_MS,
    promise: request,
  });

  return request;
}

function fetchTransfersForTarget(
  target: TransferBundleTarget,
  currentLineId: string,
  currentLineLabel: string,
  retentionDays: number,
  fetcher: typeof fetch,
): Promise<TransferLineOption[]> {
  const station = resolveStationForTarget(
    target,
    currentLineId,
    currentLineLabel,
    retentionDays,
    fetcher,
  );

  return station.then((resolvedStation) =>
    fetchStationTransfers(resolvedStation, currentLineId, {
      apiBase: MARKETPLACE_NAVITIA_BASE,
      fetcher,
      transferScope: "connected",
    }),
  );
}

async function resolveStationForTarget(
  target: TransferBundleTarget,
  currentLineId: string,
  currentLineLabel: string,
  retentionDays: number,
  fetcher: typeof fetch,
): Promise<StationSearchOption> {
  if (target.stopAreaRef.startsWith("stop_area:")) {
    return createStationOptionForTarget(target, target.stopAreaRef);
  }

  const stations = await getCachedLineStations(
    currentLineId,
    currentLineLabel,
    retentionDays,
    fetcher,
  );
  const station = findMatchingLineStation(target, stations);

  if (station) {
    return station;
  }

  return createStationOptionForTarget(target, target.stopAreaRef);
}

function createStationOptionForTarget(
  target: TransferBundleTarget,
  scheduleStopAreaRef: string,
): StationSearchOption {
  return {
    id: scheduleStopAreaRef,
    label: target.label,
    city: target.city,
    monitoringRef: "",
    scheduleStopAreaRef,
  };
}

function getCachedLineStations(
  currentLineId: string,
  currentLineLabel: string,
  retentionDays: number,
  fetcher: typeof fetch,
): Promise<StationSearchOption[]> {
  const now = Date.now();
  const cacheKey = `line-stations:${currentLineId}`;
  const cached = lineStationsCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const line = createLineOption(currentLineId, currentLineLabel);
  const request = searchLineStations(line, "", {
    apiBase: MARKETPLACE_NAVITIA_BASE,
    fetcher,
  }).catch((): StationSearchOption[] => []);

  lineStationsCache.set(cacheKey, {
    expiresAt: now + retentionDays * DAY_MS,
    promise: request,
  });

  return request;
}

function createLineOption(lineId: string, lineLabel: string): LineSearchOption {
  return {
    family: inferTransitFamily(lineLabel),
    id: lineId,
    label: lineLabel,
    navitiaId: lineId,
    ref: lineId,
  };
}

function inferTransitFamily(lineLabel: string): TransitFamily {
  const normalizedLabel = normalizeBundleStationName(lineLabel);

  if (normalizedLabel.startsWith("metro")) {
    return "METRO";
  }

  if (normalizedLabel.startsWith("rer")) {
    return "RER";
  }

  if (normalizedLabel.startsWith("tram")) {
    return "TRAM";
  }

  if (
    normalizedLabel.startsWith("train") ||
    normalizedLabel.startsWith("transilien")
  ) {
    return "TRANSILIEN";
  }

  return "BUS";
}

function findMatchingLineStation(
  target: TransferBundleTarget,
  stations: StationSearchOption[],
): StationSearchOption | undefined {
  const normalizedTarget = normalizeBundleStationName(target.label);

  return (
    stations.find(
      (station) => normalizeBundleStationName(station.label) === normalizedTarget,
    ) ??
    stations.find((station) => {
      const normalizedStation = normalizeBundleStationName(station.label);

      return (
        normalizedStation.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedStation)
      );
    })
  );
}

function normalizeBundleStationName(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\u2019']/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function isSupportedTransferTargetRef(value: string): boolean {
  return /^(stop_area:|FR::(?:Quay|StopPlace):)/u.test(value);
}

function createServerNavitiaFetcher(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);

    headers.set("accept", "application/json");
    headers.set("apikey", apiKey);

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

function trimTransferCache(): void {
  const now = Date.now();

  Array.from(transferCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      transferCache.delete(key);
    }
  });
  Array.from(lineStationsCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      lineStationsCache.delete(key);
    }
  });
}
