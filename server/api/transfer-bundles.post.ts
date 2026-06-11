import { createError, defineEventHandler, readBody } from "h3";
import { getServerIdfmApiKey } from "../services/idfm/resolveStopArea";
import {
  createTransferLineOption,
  dedupeTransferLineOptions,
  getTransferLineId,
  mergeTransferLineOptionPresentation,
} from "../../src/services/transferLineOptions";
import {
  type EffectiveTransferResolverMode,
} from "../../src/features/service-pattern/transferResolverMode";
import type {
  LineSearchOption,
  StationSearchOption,
  TransitFamily,
  TransferLineOption,
} from "../../src/types/transit";
import type {
  TransferBundleResponse,
  TransferBundleSummary,
  TransferBundleTarget,
} from "../../src/features/service-pattern/transferBundles";

declare const useStorage: typeof import("nitropack/runtime/internal/storage").useStorage;

export interface TransferBundleRequestBody {
  /** Legacy clients may still send this; server-side bundle results are no longer cached by version. */
  cacheBust?: string;
  lineId?: string;
  lineLabel?: string;
  nearbyDistanceMeters?: number;
  requestConcurrency?: number;
  requestSpacingMs?: number;
  retentionDays?: number;
  targets?: TransferBundleTarget[];
  transferResolverMode?: EffectiveTransferResolverMode;
}

interface TransferResolverContext {
  currentLineId: string;
  currentLineLabel: string;
  fetcher?: typeof fetch;
  logger?: TransferBundleDebugLogger;
  requestSpacingMs: number;
  retentionDays: number;
}

type CachedTransferRequest = {
  bundleId: string;
  expiresAt: number;
  promise: Promise<TransferLineOption[] | undefined>;
};

type CachedLineStopAreasRequest = {
  expiresAt: number;
  promise: Promise<StationSearchOption[]>;
};

type CachedNearbyStopAreasRequest = {
  expiresAt: number;
  promise: Promise<NearbyStopAreaCandidate[]>;
};

type CachedStopAreaLinesRequest = {
  expiresAt: number;
  promise: Promise<NavitiaLineForTransfer[] | undefined>;
};

type CachedStopPointStructuralRequest = {
  expiresAt: number;
  promise: Promise<boolean>;
};

type CachedLinePresentationRequest = {
  expiresAt: number;
  promise: Promise<NavitiaLineForTransfer | undefined>;
};

type NavitiaStopAreaSearchObject = {
  embedded_type?: string;
  line?: NavitiaLineForTransfer;
  stop_area?: {
    administrative_regions?: Array<{ name?: string }>;
    id?: string;
    label?: string;
    name?: string;
  };
};

type NavitiaStopAreaSearchResponse = {
  pt_objects?: NavitiaStopAreaSearchObject[];
};

type NavitiaStopAreasResponse = {
  stop_areas?: Array<NonNullable<NavitiaStopAreaSearchObject["stop_area"]>>;
  pagination?: NavitiaPagination;
};

type NavitiaConnectionStopPoint = {
  id?: string;
  label?: string;
  name?: string;
};

type NavitiaConnection = {
  destination?: NavitiaConnectionStopPoint;
  origin?: NavitiaConnectionStopPoint;
};

type NavitiaConnectionsResponse = {
  connections?: NavitiaConnection[];
  pagination?: NavitiaPagination;
};

type NavitiaNearbyPlace = {
  distance?: number | string;
  embedded_type?: string;
  stop_area?: NavitiaStopAreaSearchObject["stop_area"];
};

type NavitiaPlacesNearbyResponse = {
  places_nearby?: NavitiaNearbyPlace[];
  pagination?: NavitiaPagination;
};

type NavitiaLinePhysicalMode = {
  id?: string;
  name?: string;
};

type NavitiaLineForTransfer = {
  code?: string;
  color?: string;
  commercial_mode?: {
    id?: string;
    name?: string;
  };
  id?: string;
  name?: string;
  physical_modes?: NavitiaLinePhysicalMode[];
  text_color?: string;
};

type NavitiaLinesResponse = {
  lines?: NavitiaLineForTransfer[];
  pagination?: NavitiaPagination;
};

type NavitiaPagination = {
  items_on_page?: number;
  items_per_page?: number;
  start_page?: number;
  total_result?: number;
};

type OfficialConnectionStopNameCandidate = {
  name: string;
  stopPointId: string;
};

type TransferBundleDebugLogLevel = "debug" | "info" | "warn" | "error";

type TransferBundleDebugLogger = {
  requestId: string;
  startedAt: number;
};

type NormalizedTransferBundleRequestBody = Required<
  Omit<TransferBundleRequestBody, "cacheBust">
>;

type ServerTransferBundleRecord = TransferBundleSummary & {
  createdAt: string;
  generatedAt: string;
  transfersByStopAreaRef: Record<string, TransferLineOption[]>;
};

type TransferBundleStorageDriver = {
  clear(): Promise<void>;
  getItem(key: string): Promise<ServerTransferBundleRecord | null>;
  getKeys(): Promise<string[]>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: ServerTransferBundleRecord): Promise<void>;
};

type NearbyStopAreaCandidate = {
  distance: number;
  stopArea: NonNullable<NavitiaNearbyPlace["stop_area"]>;
};

const MARKETPLACE_NAVITIA_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia";
const MAX_TRANSFER_TARGETS = 96;
const MAX_SERVER_TRANSFER_TARGETS_PER_INVOCATION = 4;
const DEFAULT_SERVER_TARGET_CONCURRENCY = 1;
const DEFAULT_SERVER_REQUEST_SPACING_MS = 0;
const MAX_SERVER_REQUEST_SPACING_MS = 2_000;
const DEFAULT_INTERNAL_NAVITIA_SPACING_MS = 120;
const STOP_POINT_LINE_BATCH_SIZE = 4;
const NEARBY_STOP_AREA_LINE_BATCH_SIZE = 4;
const LINE_PRESENTATION_CONCURRENCY = 2;
const DEFAULT_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS = 300;
const MIN_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS = 50;
const MAX_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS = 1_200;
const MAX_TRANSFER_BUNDLE_NEARBY_STOP_AREAS = 100;
const MAX_LINE_STOP_AREAS = 500;
const MAX_STOP_AREA_LINES = 160;
const COMPATIBLE_STOP_AREA_NEARBY_DISTANCE_METERS = 650;
const MAX_COMPATIBLE_NEARBY_STOP_AREAS = 24;
const MAX_COMPATIBLE_CONNECTIONS = 1000;
const STRUCTURAL_LINE_CACHE_VERSION = "v3";
const DEFAULT_RETENTION_DAYS = 30;
const MAX_SERVER_RETRY_AFTER_DELAY_MS = 5_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Nitro storage gives us a read-through bundle cache that can survive page reloads
// and, when a persistent driver is configured, serverless cold starts as well.
const TRANSFER_BUNDLE_STORAGE_BASE = "transfer-bundles";

const transferCache = new Map<string, CachedTransferRequest>();
const serverTransferBundles = new Map<string, ServerTransferBundleRecord>();
const serverTransferBundleWriteQueues = new Map<string, Promise<void>>();
const lineStopAreasCache = new Map<string, CachedLineStopAreasRequest>();
const nearbyStopAreasCache = new Map<string, CachedNearbyStopAreasRequest>();
const stopAreaLinesCache = new Map<string, CachedStopAreaLinesRequest>();
const stopPointStructuralCache = new Map<string, CachedStopPointStructuralRequest>();
const linePresentationCache = new Map<string, CachedLinePresentationRequest>();
const fallbackTransferBundleStorage = new Map<
  string,
  ServerTransferBundleRecord
>();

const bundleTransferFamilyPriority: Record<TransitFamily, number> = {
  METRO: 0,
  RER: 1,
  TRANSILIEN: 2,
  TRAM: 3,
  CABLE: 4,
  BUS: 5,
  NOCTILIEN: 6,
};

export default defineEventHandler(async (event): Promise<TransferBundleResponse> => {
  const apiKey = getServerIdfmApiKey(event);
  const fetcher = apiKey ? createServerNavitiaFetcher(apiKey) : undefined;

  return createTransferBundleResponse(
    await readBody<TransferBundleRequestBody>(event),
    { fetcher },
  );
});

export async function createTransferBundleResponse(
  rawBody: TransferBundleRequestBody,
  options: { fetcher?: typeof fetch } = {},
): Promise<TransferBundleResponse> {
  const logger = createTransferBundleDebugLogger();

  try {
    const body = normalizeRequestBody(rawBody);
    const fetcher = options.fetcher;
    const bundleId = createServerTransferBundleId(
      body.lineId,
      body.transferResolverMode,
      body.nearbyDistanceMeters,
    );

    logTransferBundleDebug(logger, "info", "request:start", {
      bundleId,
      hasFetcher: Boolean(fetcher),
      lineId: body.lineId,
      lineLabel: body.lineLabel,
      nearbyDistanceMeters: body.nearbyDistanceMeters,
      requestConcurrency: body.requestConcurrency,
      requestSpacingMs: body.requestSpacingMs,
      retentionDays: body.retentionDays,
      resolverMode: body.transferResolverMode,
      targetCount: body.targets.length,
      targets: body.targets.map((target) => summarizeTransferTarget(target)),
    });

    trimTransferCache();

    const existingBundle = await readServerTransferBundle(bundleId, logger);
    const reusableTransfersByStopAreaRef = getReusableTransferBundleEntries(
      existingBundle,
      body.targets,
    );
    const missingTargets = body.targets.filter(
      (target) =>
        !Object.prototype.hasOwnProperty.call(
          reusableTransfersByStopAreaRef,
          target.stopAreaRef,
        ),
    );

    if (existingBundle && missingTargets.length === 0) {
      logTransferBundleDebug(logger, "info", "bundle:hit-complete", {
        bundleId,
        durationMs: Date.now() - logger.startedAt,
        targetCount: body.targets.length,
        transferCount: countTransferLines(reusableTransfersByStopAreaRef),
      });

      return createTransferBundleResponseFromStoredBundle(
        body,
        existingBundle,
        reusableTransfersByStopAreaRef,
      );
    }

    logTransferBundleDebug(logger, existingBundle ? "info" : "debug", existingBundle ? "bundle:hit-partial" : "bundle:miss", {
      bundleId,
      missingTargetCount: missingTargets.length,
      reusableTargetCount: Object.keys(reusableTransfersByStopAreaRef).length,
      targetCount: body.targets.length,
    });

    if (!fetcher) {
      logTransferBundleDebug(logger, "error", "request:missing-api-key", {
        missingTargetCount: missingTargets.length,
        resolverMode: body.transferResolverMode,
      });

      throw createError({
        statusCode: 500,
        statusMessage: "IDFM_API_KEY is not configured on this deployment.",
      });
    }

    const invocationTargets = missingTargets.slice(
      0,
      MAX_SERVER_TRANSFER_TARGETS_PER_INVOCATION,
    );
    let savedBundle = existingBundle;

    logTransferBundleDebug(logger, "info", "bundle:batch", {
      batchTargetCount: invocationTargets.length,
      bundleId,
      deferredTargetCount: Math.max(
        0,
        missingTargets.length - invocationTargets.length,
      ),
      missingTargetCount: missingTargets.length,
    });

    for (const [index, target] of invocationTargets.entries()) {
      if (index > 0 && body.requestSpacingMs > 0) {
        await waitForTransferBundleRetry(body.requestSpacingMs);
      }

      logTransferBundleDebug(logger, "info", "target:queued", {
        index,
        target: summarizeTransferTarget(target),
      });

      const transfers = await getCachedTransfers(
        target,
        body.lineId,
        body.lineLabel,
        body.nearbyDistanceMeters,
        body.requestConcurrency,
        body.requestSpacingMs,
        body.retentionDays,
        bundleId,
        fetcher,
        logger,
      );

      logTransferBundleDebug(
        logger,
        transfers === undefined ? "warn" : "info",
        "target:resolved",
        {
          index,
          target: summarizeTransferTarget(target),
          transfers: summarizeTransferLines(transfers),
        },
      );

      // undefined means that the target was not reliably resolved, usually due to
      // a transient upstream failure. [] is different: it means "resolved, but no transfers".
      if (transfers !== undefined) {
        savedBundle = await saveServerTransferBundle(
          body,
          body.transferResolverMode,
          bundleId,
          {
            [target.stopAreaRef]: transfers,
          },
        );

        logTransferBundleDebug(logger, "info", "target:persisted", {
          bundleId,
          persistedTargetCount: savedBundle.stopAreaCount,
          target: summarizeTransferTarget(target),
        });
      }
    }

    savedBundle ??= await saveServerTransferBundle(
      body,
      body.transferResolverMode,
      bundleId,
      {},
    );
    trimTransferCache();

    logTransferBundleDebug(logger, "info", "request:done", {
      durationMs: Date.now() - logger.startedAt,
      bundleId,
      deferredTargetCount: Math.max(
        0,
        missingTargets.length - invocationTargets.length,
      ),
      missingTargetCount: missingTargets.length,
      resolvedTargetCount: savedBundle.stopAreaCount,
      targetCount: body.targets.length,
      transferCount: savedBundle.transferCount,
    });

    return createTransferBundleResponseFromStoredBundle(
      body,
      savedBundle,
      getReusableTransferBundleEntries(savedBundle, body.targets),
    );
  } catch (error) {
    logTransferBundleDebug(logger, "error", "request:error", {
      durationMs: Date.now() - logger.startedAt,
      error: formatTransferBundleError(error),
    });

    throw error;
  }
}

function normalizeRequestBody(
  body: TransferBundleRequestBody,
): NormalizedTransferBundleRequestBody {
  const lineId = typeof body.lineId === "string" ? body.lineId.trim() : "";
  const lineLabel =
    typeof body.lineLabel === "string" && body.lineLabel.trim()
      ? body.lineLabel.trim()
      : lineId;
  const retentionDays = normalizeRetentionDays(body.retentionDays);
  const requestConcurrency = normalizeRequestConcurrency(body.requestConcurrency);
  const requestSpacingMs = normalizeRequestSpacingMs(body.requestSpacingMs);
  const nearbyDistanceMeters = normalizeNearbyDistanceMeters(
    body.nearbyDistanceMeters,
  );
  const transferResolverMode: EffectiveTransferResolverMode = "nearby";
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
    nearbyDistanceMeters,
    requestConcurrency,
    requestSpacingMs,
    retentionDays,
    targets,
    transferResolverMode,
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

function normalizeRequestConcurrency(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  return [1, 2, 3, 4].includes(numericValue)
    ? numericValue
    : DEFAULT_SERVER_TARGET_CONCURRENCY;
}

function normalizeRequestSpacingMs(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue)
    ? Math.min(
      MAX_SERVER_REQUEST_SPACING_MS,
      Math.max(DEFAULT_SERVER_REQUEST_SPACING_MS, Math.trunc(numericValue)),
    )
    : DEFAULT_SERVER_REQUEST_SPACING_MS;
}

function normalizeNearbyDistanceMeters(value: unknown): number {
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

async function getCachedTransfers(
  target: TransferBundleTarget,
  currentLineId: string,
  currentLineLabel: string,
  nearbyDistanceMeters: number,
  requestConcurrency: number,
  requestSpacingMs: number,
  retentionDays: number,
  bundleId: string,
  fetcher: typeof fetch | undefined,
  logger: TransferBundleDebugLogger,
): Promise<TransferLineOption[] | undefined> {
  const now = Date.now();
  const targetStartedAt = Date.now();
  const cacheKey = [
    "nearby",
    currentLineId,
    target.stopAreaRef,
    target.label,
    `concurrency:${requestConcurrency}`,
    `distance:${nearbyDistanceMeters}`,
  ].join(":");
  const cached = transferCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    const transfers = await cached.promise;

    if (transfers !== undefined) {
      logTransferBundleDebug(logger, "info", "cache:hit", {
        bundleId: cached.bundleId,
        expiresInMs: cached.expiresAt - now,
        resolverMode: "nearby",
        target: summarizeTransferTarget(target),
      });

      return transfers;
    }

    logTransferBundleDebug(logger, "warn", "cache:hit-undefined-evicted", {
      bundleId: cached.bundleId,
      expiresInMs: cached.expiresAt - now,
      resolverMode: "nearby",
      target: summarizeTransferTarget(target),
    });
    if (transferCache.get(cacheKey) === cached) {
      transferCache.delete(cacheKey);
    }
  }

  logTransferBundleDebug(logger, "info", "cache:miss", {
    bundleId,
    resolverMode: "nearby",
    target: summarizeTransferTarget(target),
  });

  const request = resolveNearbyTransfersForTarget(
    target,
    currentLineId,
    currentLineLabel,
    nearbyDistanceMeters,
    requestConcurrency,
    requestSpacingMs,
    retentionDays,
    fetcher,
    logger,
  )
    .then(async (transfers) => {
      logTransferBundleDebug(logger, transfers === undefined ? "warn" : "info", "resolver:done", {
        durationMs: Date.now() - targetStartedAt,
        resolverMode: "nearby",
        target: summarizeTransferTarget(target),
        transfers: summarizeTransferLines(transfers),
      });

      if (transfers === undefined) {
        if (transferCache.get(cacheKey)?.promise === request) {
          transferCache.delete(cacheKey);
        }
      }

      return transfers;
    })
    .catch((error) => {
      logTransferBundleDebug(logger, "error", "target:error", {
        durationMs: Date.now() - targetStartedAt,
        error: formatTransferBundleError(error),
        resolverMode: "nearby",
        target: summarizeTransferTarget(target),
      });
      if (transferCache.get(cacheKey)?.promise === request) {
        transferCache.delete(cacheKey);
      }

      return undefined;
    });

  logTransferBundleDebug(logger, "debug", "cache:store-promise", {
    bundleId,
    expiresInMs: retentionDays * DAY_MS,
    resolverMode: "nearby",
    target: summarizeTransferTarget(target),
  });

  transferCache.set(cacheKey, {
    bundleId,
    expiresAt: now + retentionDays * DAY_MS,
    promise: request,
  });

  return request;
}

export async function enrichTransferLineOptionsWithNavitia(
  transfers: TransferLineOption[],
  fetcher: typeof fetch,
  retentionDays = DEFAULT_RETENTION_DAYS,
  requestSpacingMs = 0,
  logger?: TransferBundleDebugLogger,
): Promise<TransferLineOption[]> {
  const startedAt = Date.now();
  let requestedPresentationCount = 0;
  let resolvedPresentationCount = 0;
  const presentationSpacingMs = Math.max(
    normalizeRequestSpacingMs(requestSpacingMs),
    DEFAULT_INTERNAL_NAVITIA_SPACING_MS,
  );
  const enrichedTransfers = await mapBundleItemsWithConcurrency(
    transfers,
    LINE_PRESENTATION_CONCURRENCY,
    presentationSpacingMs,
    async (transfer) => {
      const lineId = getTransferLineId(transfer);

      if (!lineId || !shouldEnrichTransferLineOption(transfer)) {
        return transfer;
      }

      requestedPresentationCount += 1;
      const line = await getCachedNavitiaLinePresentation(
        lineId,
        retentionDays,
        fetcher,
        logger,
      );

      if (!line) {
        return transfer;
      }

      resolvedPresentationCount += 1;
      return mergeTransferLineOptionPresentation(transfer, {
        code: line.code,
        color: line.color,
        family: inferTransitFamilyFromNavitiaLine(line) ?? transfer.family,
        id: line.id ?? lineId,
        mode: line.commercial_mode?.name ?? line.physical_modes?.[0]?.name,
        name: line.name,
        ref: line.id ?? lineId,
        textColor: line.text_color,
      });
    },
  );

  const result = dedupeTransferLineOptions(enrichedTransfers).sort(compareBundleTransfers);

  if (logger) {
    logTransferBundleDebug(logger, "debug", "enrichment:line-presentations", {
      durationMs: Date.now() - startedAt,
      inputTransferCount: transfers.length,
      outputTransferCount: result.length,
      requestedPresentationCount,
      resolvedPresentationCount,
    });
  }

  return result;
}

function shouldEnrichTransferLineOption(transfer: TransferLineOption): boolean {
  const lineId = getTransferLineId(transfer);

  if (!lineId) {
    return false;
  }

  return (
    !transfer.family ||
    !transfer.color ||
    !transfer.textColor ||
    normalizeBundleStationName(transfer.label) === "ter" ||
    normalizeBundleColor(transfer.color) === "#0064ff"
  );
}

async function getCachedNavitiaLinePresentation(
  lineId: string,
  retentionDays: number,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<NavitiaLineForTransfer | undefined> {
  const now = Date.now();
  const normalizedLineId = normalizeIdfmLineId(lineId) ?? lineId;
  const cacheKey = `line-presentation:${normalizedLineId}`;
  const cached = linePresentationCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    if (logger) {
      logTransferBundleDebug(logger, "debug", "line-presentation:cache-hit", {
        lineId: normalizedLineId,
      });
    }

    return cached.promise;
  }

  if (logger) {
    logTransferBundleDebug(logger, "debug", "line-presentation:fetch", {
      lineId: normalizedLineId,
    });
  }

  const request = fetchNavitiaLinePresentation(
    normalizedLineId,
    fetcher,
    logger,
  ).catch((error) => {
    if (logger) {
      logTransferBundleDebug(logger, "warn", "line-presentation:error", {
        error: formatTransferBundleError(error),
        lineId: normalizedLineId,
      });
    }

    return undefined;
  });

  linePresentationCache.set(cacheKey, {
    expiresAt: now + retentionDays * DAY_MS,
    promise: request,
  });

  return request;
}

async function fetchNavitiaLinePresentation(
  lineId: string,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<NavitiaLineForTransfer | undefined> {
  const searchParams = new URLSearchParams({
    disable_disruption: "true",
    disable_geojson: "true",
  });
  const response = await fetcher(
    `${MARKETPLACE_NAVITIA_BASE}/lines/${encodeURIComponent(lineId)}?${searchParams}`,
  );

  if (!response.ok) {
    if (logger) {
      logTransferBundleDebug(logger, "warn", "line-presentation:non-ok", {
        lineId,
        status: response.status,
        statusText: response.statusText,
      });
    }

    return undefined;
  }

  const payload = (await response.json().catch(
    (): NavitiaLinesResponse => ({}),
  )) as NavitiaLinesResponse;

  return payload.lines?.[0];
}

async function resolveNearbyTransfersForTarget(
  target: TransferBundleTarget,
  currentLineId: string,
  currentLineLabel: string,
  nearbyDistanceMeters: number,
  requestConcurrency: number,
  requestSpacingMs: number,
  retentionDays: number,
  fetcher: typeof fetch | undefined,
  logger?: TransferBundleDebugLogger,
): Promise<TransferLineOption[] | undefined> {
  logTransferBundleDebug(logger, "info", "resolver:nearby:start", {
    target: summarizeTransferTarget(target),
  });

  if (!fetcher) {
    logTransferBundleDebug(logger, "warn", "resolver:nearby:no-fetcher", {
      target: summarizeTransferTarget(target),
    });

    return undefined;
  }

  const lineStopAreas = await getCachedLineStopAreas(
    currentLineId,
    currentLineLabel,
    retentionDays,
    fetcher,
    logger,
  );
  const station = resolveTargetStopAreaFromLine(target, lineStopAreas);
  const stopAreaRef = station?.scheduleStopAreaRef ?? station?.id;

  if (!station || !stopAreaRef?.startsWith("stop_area:")) {
    logTransferBundleDebug(logger, "warn", "resolver:nearby:no-station", {
      lineStopAreaCount: lineStopAreas.length,
      target: summarizeTransferTarget(target),
    });

    return undefined;
  }

  logTransferBundleDebug(logger, "info", "resolver:nearby:station", {
    station: summarizeStationOption(station),
    target: summarizeTransferTarget(target),
  });

  const nearbyStopAreas = await getCachedNearbyStopAreas(
    stopAreaRef,
    nearbyDistanceMeters,
    retentionDays,
    fetcher,
    logger,
  );
  const candidateStopAreas = [
    createCurrentStopAreaCandidate(station, stopAreaRef),
    ...nearbyStopAreas,
  ];
  const transfers = await resolveTransferLinesForNearbyStopAreas(
    candidateStopAreas,
    currentLineId,
    requestConcurrency,
    requestSpacingMs,
    retentionDays,
    fetcher,
    logger,
  );

  logTransferBundleDebug(logger, "info", "resolver:nearby:transfers", {
    nearbyStopAreaCount: nearbyStopAreas.length,
    stopAreaLookupCount: candidateStopAreas.length,
    station: summarizeStationOption(station),
    target: summarizeTransferTarget(target),
    transfers: summarizeTransferLines(transfers),
  });

  return transfers;
}

function createCurrentStopAreaCandidate(
  station: StationSearchOption,
  stopAreaRef: string,
): NearbyStopAreaCandidate {
  return {
    distance: 0,
    stopArea: {
      id: stopAreaRef,
      label: station.label,
      name: station.label,
      administrative_regions: station.city ? [{ name: station.city }] : undefined,
    },
  };
}

function resolveTargetStopAreaFromLine(
  target: TransferBundleTarget,
  stations: StationSearchOption[],
): StationSearchOption | undefined {
  const directStopAreaRef =
    convertNetexStopPlaceRefToNavitiaStopAreaRef(target.stopAreaRef) ??
    (target.stopAreaRef.startsWith("stop_area:") ? target.stopAreaRef : undefined);

  if (directStopAreaRef) {
    const directStation = stations.find(
      (station) =>
        station.id === directStopAreaRef ||
        station.scheduleStopAreaRef === directStopAreaRef,
    );

    if (directStation) {
      return directStation;
    }
  }

  const targetNumericId = extractNetexNumericId(target.stopAreaRef);

  if (targetNumericId) {
    const stationByNumericId = stations.find((station) =>
      [station.id, station.scheduleStopAreaRef]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.includes(targetNumericId)),
    );

    if (stationByNumericId) {
      return stationByNumericId;
    }
  }

  return findMatchingLineStation(target, stations);
}

function extractNetexNumericId(value: string): string | undefined {
  const match = value.trim().match(/^FR::[^:]+:(\d+):FR1$/u);

  return match?.[1];
}

async function resolveTransferLinesForNearbyStopAreas(
  nearbyStopAreas: NearbyStopAreaCandidate[],
  currentLineId: string,
  requestConcurrency: number,
  requestSpacingMs: number,
  retentionDays: number,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<TransferLineOption[] | undefined> {
  const linesByStopArea = await mapBundleItemsWithConcurrency(
    nearbyStopAreas,
    Math.min(
      NEARBY_STOP_AREA_LINE_BATCH_SIZE,
      normalizeRequestConcurrency(requestConcurrency),
    ),
    Math.max(
      normalizeRequestSpacingMs(requestSpacingMs),
      DEFAULT_INTERNAL_NAVITIA_SPACING_MS,
    ),
    async ({ stopArea }) =>
      getCachedStopAreaLines(stopArea.id ?? "", retentionDays, fetcher, logger),
  );

  if (linesByStopArea.some((lines) => lines === undefined)) {
    logTransferBundleDebug(logger, "warn", "nearby-lines:incomplete", {
      currentLineId,
      stopAreaLookupCount: nearbyStopAreas.length,
    });

    return undefined;
  }

  const currentLineKey = normalizeBundleLineId(currentLineId);
  const transfers = linesByStopArea
    .flatMap((lines) => lines ?? [])
    .filter((line) => normalizeBundleLineId(line.id) !== currentLineKey)
    .map(mapNavitiaLineToTransferOption);

  return dedupeTransferLineOptions(transfers).sort(compareBundleTransfers);
}

async function resolveStationForTarget(
  target: TransferBundleTarget,
  currentLineId: string,
  currentLineLabel: string,
  retentionDays: number,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<StationSearchOption | undefined> {
  logTransferBundleDebug(logger, "debug", "station-resolve:start", {
    lineId: currentLineId,
    lineLabel: currentLineLabel,
    target: summarizeTransferTarget(target),
  });

  const directStopAreaRef = convertNetexStopPlaceRefToNavitiaStopAreaRef(
    target.stopAreaRef,
  );

  if (directStopAreaRef) {
    logTransferBundleDebug(logger, "info", "station-resolve:netex-direct", {
      stopAreaRef: directStopAreaRef,
      target: summarizeTransferTarget(target),
    });

    return createStationOptionForTarget(target, directStopAreaRef);
  }

  if (target.stopAreaRef.startsWith("stop_area:")) {
    logTransferBundleDebug(logger, "info", "station-resolve:already-navitia", {
      stopAreaRef: target.stopAreaRef,
      target: summarizeTransferTarget(target),
    });

    return createStationOptionForTarget(target, target.stopAreaRef);
  }

  const stations = await getCachedLineStations(
    currentLineId,
    currentLineLabel,
    retentionDays,
    fetcher,
    logger,
  );
  const lineStation = findMatchingLineStation(target, stations);

  if (lineStation) {
    logTransferBundleDebug(logger, "info", "station-resolve:line-station-match", {
      station: summarizeStationOption(lineStation),
      target: summarizeTransferTarget(target),
    });

    return lineStation;
  }

  const searchedStation = await searchStopAreaForTarget(target, fetcher, logger);

  logTransferBundleDebug(logger, searchedStation ? "info" : "warn", "station-resolve:search-fallback", {
    station: searchedStation ? summarizeStationOption(searchedStation) : undefined,
    target: summarizeTransferTarget(target),
  });

  return searchedStation;
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

function convertNetexStopPlaceRefToNavitiaStopAreaRef(
  stopAreaRef: string,
): string | undefined {
  const normalized = stopAreaRef.trim();

  const match = normalized.match(
    /^FR::(?:(?:mono|multi)(?:modal)?StopPlace|StopPlace):(\d+):FR1$/u,
  );

  return match?.[1] ? `stop_area:IDFM:${match[1]}` : undefined;
}

async function getCachedLineStopAreas(
  currentLineId: string,
  currentLineLabel: string,
  retentionDays: number,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<StationSearchOption[]> {
  const now = Date.now();
  const cacheKey = `line-stop-areas:${currentLineId}`;
  const cached = lineStopAreasCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    logTransferBundleDebug(logger, "debug", "line-stop-areas:cache-hit", {
      lineId: currentLineId,
    });

    const stations = await cached.promise;

    if (stations.length > 0) {
      logTransferBundleDebug(logger, "debug", "line-stop-areas:cache-hit-result", {
        lineId: currentLineId,
        stationCount: stations.length,
      });

      return stations;
    }

    logTransferBundleDebug(logger, "warn", "line-stop-areas:cache-empty-evicted", {
      lineId: currentLineId,
    });
    lineStopAreasCache.delete(cacheKey);
  }

  logTransferBundleDebug(logger, "info", "line-stop-areas:fetch", {
    lineId: currentLineId,
    lineLabel: currentLineLabel,
  });

  const request = fetchLineStopAreas(currentLineId, currentLineLabel, fetcher, logger)
    .then((stations) => {
      if (stations.length === 0) {
        logTransferBundleDebug(logger, "error", "line-stop-areas:empty", {
          lineId: currentLineId,
          lineLabel: currentLineLabel,
        });
        lineStopAreasCache.delete(cacheKey);

        throw new Error(`No Navitia stations found for ${currentLineId}`);
      }

      logTransferBundleDebug(logger, "info", "line-stop-areas:done", {
        lineId: currentLineId,
        sample: stations.slice(0, 6).map((station) => summarizeStationOption(station)),
        stationCount: stations.length,
      });

      return stations;
    })
    .catch((error: unknown): StationSearchOption[] => {
      logTransferBundleDebug(logger, "error", "line-stop-areas:error", {
        error: formatTransferBundleError(error),
        lineId: currentLineId,
        lineLabel: currentLineLabel,
      });
      lineStopAreasCache.delete(cacheKey);

      throw error;
    });

  lineStopAreasCache.set(cacheKey, {
    expiresAt: now + retentionDays * DAY_MS,
    promise: request,
  });

  return request;
}

async function getCachedLineStations(
  currentLineId: string,
  currentLineLabel: string,
  retentionDays: number,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<StationSearchOption[]> {
  return getCachedLineStopAreas(
    currentLineId,
    currentLineLabel,
    retentionDays,
    fetcher,
    logger,
  );
}

async function fetchLineStopAreas(
  currentLineId: string,
  currentLineLabel: string,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<StationSearchOption[]> {
  const navitiaLineId = await resolveNavitiaLineId(
    currentLineId,
    currentLineLabel,
    fetcher,
    logger,
  );
  const searchParams = new URLSearchParams({
    count: "200",
    depth: "2",
    disable_disruption: "true",
    disable_geojson: "true",
  });
  const stopAreas = await fetchPaginatedNavitiaCollection<
    NavitiaStopAreasResponse,
    NonNullable<NavitiaStopAreaSearchObject["stop_area"]>
  >(
    `${MARKETPLACE_NAVITIA_BASE}/lines/${encodeURIComponent(
      navitiaLineId,
    )}/stop_areas`,
    searchParams,
    "stop_areas",
    MAX_LINE_STOP_AREAS,
    fetcher,
    logger,
  );

  return dedupeStations(stopAreas.map(mapSearchedStopAreaToStation));
}

async function resolveNavitiaLineId(
  currentLineId: string,
  currentLineLabel: string,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<string> {
  const trimmedLineId = currentLineId.trim();
  const normalizedLineId = normalizeIdfmLineId(trimmedLineId);

  if (normalizedLineId) {
    return normalizedLineId;
  }

  if (trimmedLineId.startsWith("line:")) {
    return trimmedLineId;
  }

  const query = currentLineLabel || currentLineId;
  const searchParams = new URLSearchParams({
    count: "10",
    disable_disruption: "true",
    disable_geojson: "true",
    q: query,
  });

  searchParams.append("type[]", "line");
  logTransferBundleDebug(logger, "info", "line-resolve:search", {
    lineId: currentLineId,
    query,
  });

  const response = await fetcher(`${MARKETPLACE_NAVITIA_BASE}/pt_objects?${searchParams}`);

  if (!response.ok) {
    logTransferBundleDebug(logger, "warn", "line-resolve:non-ok", {
      lineId: currentLineId,
      status: response.status,
      statusText: response.statusText,
    });

    return currentLineId;
  }

  const payload = (await response.json().catch(
    (): NavitiaStopAreaSearchResponse => ({}),
  )) as NavitiaStopAreaSearchResponse;
  const line = (payload.pt_objects ?? []).find(
    (object) => object.embedded_type === "line" && object.line?.id,
  )?.line;

  return line?.id ?? currentLineId;
}

async function getCachedNearbyStopAreas(
  stopAreaRef: string,
  nearbyDistanceMeters: number,
  retentionDays: number,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<NearbyStopAreaCandidate[]> {
  const now = Date.now();
  const cacheKey = `nearby:${stopAreaRef}:d${nearbyDistanceMeters}`;
  const cached = nearbyStopAreasCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    logTransferBundleDebug(logger, "debug", "nearby:cache-hit", {
      distanceMeters: nearbyDistanceMeters,
      stopAreaRef,
    });

    return cached.promise;
  }

  logTransferBundleDebug(logger, "info", "nearby:fetch", {
    distanceMeters: nearbyDistanceMeters,
    stopAreaRef,
  });

  const request = fetchNearbyStopAreas(
    stopAreaRef,
    nearbyDistanceMeters,
    fetcher,
    logger,
  ).catch((error): NearbyStopAreaCandidate[] => {
    logTransferBundleDebug(logger, "warn", "nearby:error", {
      error: formatTransferBundleError(error),
      stopAreaRef,
    });
    nearbyStopAreasCache.delete(cacheKey);

    return [];
  });

  nearbyStopAreasCache.set(cacheKey, {
    expiresAt: now + retentionDays * DAY_MS,
    promise: request,
  });

  return request;
}

async function fetchNearbyStopAreas(
  stopAreaRef: string,
  nearbyDistanceMeters: number,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<NearbyStopAreaCandidate[]> {
  const searchParams = new URLSearchParams({
    count: String(MAX_TRANSFER_BUNDLE_NEARBY_STOP_AREAS),
    depth: "2",
    disable_disruption: "true",
    disable_geojson: "true",
    distance: String(nearbyDistanceMeters),
  });

  searchParams.append("type[]", "stop_area");

  const places = await fetchPaginatedNavitiaCollection<
    NavitiaPlacesNearbyResponse,
    NavitiaNearbyPlace
  >(
    `${MARKETPLACE_NAVITIA_BASE}/stop_areas/${encodeURIComponent(
      stopAreaRef,
    )}/places_nearby`,
    searchParams,
    "places_nearby",
    MAX_TRANSFER_BUNDLE_NEARBY_STOP_AREAS,
    fetcher,
    logger,
  );
  const normalizedCurrentStopArea = normalizeBundleStationName(stopAreaRef);
  const deduped = new Map<string, NearbyStopAreaCandidate>();

  places
    .filter((place) => place.embedded_type === "stop_area")
    .map((place) => ({
      distance: parseBundleDistance(place.distance),
      stopArea: place.stop_area,
    }))
    .filter(
      (place): place is NearbyStopAreaCandidate =>
        Boolean(place.stopArea?.id) &&
        normalizeBundleStationName(place.stopArea?.id) !== normalizedCurrentStopArea,
    )
    .sort((left, right) => left.distance - right.distance)
    .forEach((place) => {
      const stopAreaId = place.stopArea.id ?? "";
      const existing = deduped.get(stopAreaId);

      if (!existing || place.distance < existing.distance) {
        deduped.set(stopAreaId, place);
      }
    });

  const result = Array.from(deduped.values());

  logTransferBundleDebug(logger, "info", "nearby:done", {
    nearbyStopAreaCount: result.length,
    sample: result.slice(0, 8).map((place) => ({
      distance: place.distance,
      id: place.stopArea.id,
      name: cleanBundleStopAreaLabel(
        place.stopArea.name ?? place.stopArea.label ?? "",
      ),
    })),
    stopAreaRef,
  });

  return result;
}

async function getCachedStopAreaLines(
  stopAreaRef: string,
  retentionDays: number,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<NavitiaLineForTransfer[] | undefined> {
  if (!stopAreaRef) {
    return [];
  }

  const now = Date.now();
  const cacheKey = `stop-area-lines:${stopAreaRef}`;
  const cached = stopAreaLinesCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    logTransferBundleDebug(logger, "debug", "stop-area-lines:cache-hit", {
      stopAreaRef,
    });

    return cached.promise;
  }

  logTransferBundleDebug(logger, "debug", "stop-area-lines:fetch", {
    stopAreaRef,
  });

  const request = fetchStopAreaLines(stopAreaRef, fetcher, logger).catch(
    (error): NavitiaLineForTransfer[] | undefined => {
      logTransferBundleDebug(logger, "warn", "stop-area-lines:error", {
        error: formatTransferBundleError(error),
        stopAreaRef,
      });
      stopAreaLinesCache.delete(cacheKey);

      // 404 is the only case where an empty array is a reliable answer. For 429,
      // 5xx or network errors, return undefined so the bundle is not poisoned by
      // a fake "no transfer" result.
      return isTransferBundleHttpStatus(error, 404) ? [] : undefined;
    },
  );

  stopAreaLinesCache.set(cacheKey, {
    expiresAt: now + retentionDays * DAY_MS,
    promise: request,
  });

  return request;
}

async function fetchStopAreaLines(
  stopAreaRef: string,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<NavitiaLineForTransfer[]> {
  const searchParams = new URLSearchParams({
    count: "100",
    depth: "2",
    disable_disruption: "true",
    disable_geojson: "true",
  });

  return fetchPaginatedNavitiaCollection<NavitiaLinesResponse, NavitiaLineForTransfer>(
    `${MARKETPLACE_NAVITIA_BASE}/stop_areas/${encodeURIComponent(
      stopAreaRef,
    )}/lines`,
    searchParams,
    "lines",
    MAX_STOP_AREA_LINES,
    fetcher,
    logger,
  );
}

function mapNavitiaLineToTransferOption(
  line: NavitiaLineForTransfer,
): TransferLineOption {
  return createTransferLineOption({
    code: line.code,
    color: line.color,
    family: inferTransitFamilyFromNavitiaLine(line),
    id: line.id,
    mode: line.commercial_mode?.name ?? line.physical_modes?.[0]?.name,
    name: line.name,
    ref: line.id,
    textColor: line.text_color,
  });
}

function dedupeStations(stations: StationSearchOption[]): StationSearchOption[] {
  const deduped = new Map<string, StationSearchOption>();

  stations.forEach((station) => deduped.set(station.id, station));

  return Array.from(deduped.values());
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

export function findMatchingLineStation(
  target: TransferBundleTarget,
  stations: StationSearchOption[],
): StationSearchOption | undefined {
  const normalizedTarget = normalizeBundleStationName(target.label);
  const targetTokens = createBundleStationTokens(normalizedTarget);

  return (
    stations.find(
      (station) => normalizeBundleStationName(station.label) === normalizedTarget,
    ) ??
    stations
      .map((station) => ({
        score: scoreStationNameMatch(
          normalizedTarget,
          targetTokens,
          normalizeBundleStationName(`${station.label} ${station.city ?? ""}`),
        ),
        station,
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)[0]?.station
  );
}

async function searchStopAreaForTarget(
  target: TransferBundleTarget,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<StationSearchOption | undefined> {
  const query = target.label.trim();

  if (!query) {
    logTransferBundleDebug(logger, "warn", "station-search:empty-query", {
      target: summarizeTransferTarget(target),
    });

    return undefined;
  }

  const searchParams = new URLSearchParams({
    count: "12",
    disable_disruption: "true",
    disable_geojson: "true",
    q: query,
  });

  searchParams.append("type[]", "stop_area");

  const response = await fetcher(
    `${MARKETPLACE_NAVITIA_BASE}/pt_objects?${searchParams}`,
  ).catch(() => undefined);

  if (!response?.ok) {
    logTransferBundleDebug(logger, "warn", "station-search:non-ok", {
      status: response?.status,
      statusText: response?.statusText,
      target: summarizeTransferTarget(target),
    });

    return undefined;
  }

  const payload = (await response.json().catch(
    (): NavitiaStopAreaSearchResponse => ({}),
  )) as NavitiaStopAreaSearchResponse;
  const stations = (payload.pt_objects ?? [])
    .filter((object) => object.embedded_type === "stop_area")
    .map((object) => object.stop_area)
    .filter((stopArea): stopArea is NonNullable<NavitiaStopAreaSearchObject["stop_area"]> =>
      Boolean(stopArea?.id),
    )
    .map(mapSearchedStopAreaToStation);

  const matchedStation = findMatchingLineStation(target, stations);

  logTransferBundleDebug(logger, matchedStation ? "info" : "warn", "station-search:done", {
    candidateCount: stations.length,
    matchedStation: matchedStation ? summarizeStationOption(matchedStation) : undefined,
    sample: stations.slice(0, 6).map((station) => summarizeStationOption(station)),
    target: summarizeTransferTarget(target),
  });

  return matchedStation;
}

export async function resolveOfficialConnectionStopNames(
  target: TransferBundleTarget,
  context: TransferResolverContext,
): Promise<string[]> {
  if (!context.fetcher) {
    logTransferBundleDebug(context.logger, "warn", "official-connections:no-fetcher", {
      target: summarizeTransferTarget(target),
    });

    return [];
  }

  logTransferBundleDebug(context.logger, "info", "official-connections:start", {
    target: summarizeTransferTarget(target),
  });

  const station = await resolveStationForTarget(
    target,
    context.currentLineId,
    context.currentLineLabel,
    context.retentionDays,
    context.fetcher,
    context.logger,
  );
  const stopAreaRef = station?.scheduleStopAreaRef ?? station?.id;

  if (!stopAreaRef?.startsWith("stop_area:")) {
    logTransferBundleDebug(context.logger, "warn", "official-connections:no-stop-area", {
      station: station ? summarizeStationOption(station) : undefined,
      target: summarizeTransferTarget(target),
    });

    return [];
  }

  let names = await fetchOfficialConnectionStopNamesWithSearchFallback(
    target,
    stopAreaRef,
    context,
  );

  logTransferBundleDebug(context.logger, "info", "official-connections:done", {
    names: summarizeStringList(names),
    station: station ? summarizeStationOption(station) : undefined,
    stopAreaRef,
    target: summarizeTransferTarget(target),
  });

  return names;
}

async function fetchOfficialConnectionStopNamesWithSearchFallback(
  target: TransferBundleTarget,
  stopAreaRef: string,
  context: TransferResolverContext,
): Promise<string[]> {
  try {
    return await fetchOfficialConnectionStopNames(
      stopAreaRef,
      context.currentLineId,
      context.fetcher!,
      context.logger,
      context.requestSpacingMs,
    );
  } catch (error) {
    if (!isTransferBundleHttpStatus(error, 404)) {
      throw error;
    }

    logTransferBundleDebug(context.logger, "warn", "official-connections:direct-stop-area-not-found", {
      error: formatTransferBundleError(error),
      stopAreaRef,
      target: summarizeTransferTarget(target),
    });
  }

  const searchedStation = await searchStopAreaForTarget(
    target,
    context.fetcher!,
    context.logger,
  );
  const fallbackStopAreaRef = searchedStation?.scheduleStopAreaRef ?? searchedStation?.id;

  if (!fallbackStopAreaRef?.startsWith("stop_area:")) {
    logTransferBundleDebug(context.logger, "warn", "official-connections:fallback-search-empty", {
      target: summarizeTransferTarget(target),
    });

    return [];
  }

  if (fallbackStopAreaRef === stopAreaRef) {
    logTransferBundleDebug(context.logger, "warn", "official-connections:fallback-same-stop-area", {
      fallbackStopAreaRef,
      target: summarizeTransferTarget(target),
    });

    return [];
  }

  logTransferBundleDebug(context.logger, "info", "official-connections:fallback-search-match", {
    fallbackStation: searchedStation
      ? summarizeStationOption(searchedStation)
      : undefined,
    originalStopAreaRef: stopAreaRef,
    target: summarizeTransferTarget(target),
  });

  try {
    return await fetchOfficialConnectionStopNames(
      fallbackStopAreaRef,
      context.currentLineId,
      context.fetcher!,
      context.logger,
      context.requestSpacingMs,
    );
  } catch (error) {
    if (!isTransferBundleHttpStatus(error, 404)) {
      throw error;
    }

    logTransferBundleDebug(context.logger, "warn", "official-connections:fallback-stop-area-not-found", {
      error: formatTransferBundleError(error),
      fallbackStopAreaRef,
      target: summarizeTransferTarget(target),
    });

    return [];
  }
}

export async function fetchOfficialConnectionStopNames(
  stopAreaRef: string,
  currentLineId: string,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
  requestSpacingMs = 0,
): Promise<string[]> {
  const startedAt = Date.now();
  const searchParams = new URLSearchParams({
    count: "80",
    disable_disruption: "true",
    disable_geojson: "true",
  });
  logTransferBundleDebug(logger, "info", "official-connections:fetch-navitia", {
    currentLineId,
    stopAreaRef,
  });

  const connections = await fetchPaginatedNavitiaCollection<
    NavitiaConnectionsResponse,
    NavitiaConnection
  >(
    `${MARKETPLACE_NAVITIA_BASE}/stop_areas/${encodeURIComponent(
      stopAreaRef,
    )}/connections`,
    searchParams,
    "connections",
    MAX_COMPATIBLE_CONNECTIONS,
    fetcher,
    logger,
  );
  const candidates = collectOfficialConnectionStopNameCandidates(
    connections,
  );
  const officialConnectionNames = candidates.map((candidate) => candidate.name);
  const names = new Set<string>();

  logTransferBundleDebug(logger, "info", "official-connections:navitia-candidates", {
    candidateCount: candidates.length,
    connectionCount: connections.length,
    currentLineId,
    durationMs: Date.now() - startedAt,
    sample: candidates.slice(0, 8).map((candidate) => ({
      name: candidate.name,
      stopPointId: candidate.stopPointId,
    })),
    stopAreaRef,
  });

  const nearbyNames = await fetchNearbyStructuralStopAreaNames(
    stopAreaRef,
    currentLineId,
    fetcher,
    officialConnectionNames,
    logger,
    requestSpacingMs,
  );

  nearbyNames.forEach((name) => names.add(name));

  const unresolvedCandidates = candidates.filter(
    (candidate) => !bundleStationNameMatchesNameSet(candidate.name, names),
  );
  const shouldResolveStopPoints = nearbyNames.length < 2;
  const stopPointNames = shouldResolveStopPoints
    ? await fetchStructuralConnectionStopPointNames(
      unresolvedCandidates,
      currentLineId,
      fetcher,
      logger,
      requestSpacingMs,
    )
    : [];

  if (!shouldResolveStopPoints) {
    logTransferBundleDebug(logger, "info", "official-connections:skip-stop-point-structural", {
      nearbyNameCount: nearbyNames.length,
      skippedCandidateCount: unresolvedCandidates.length,
      stopAreaRef,
    });
  }

  stopPointNames.forEach((name) => names.add(name));

  const result = Array.from(names);

  logTransferBundleDebug(logger, "info", "official-connections:structural-names", {
    nearbyNameCount: nearbyNames.length,
    resultNames: summarizeStringList(result),
    stopAreaRef,
    stopPointNameCount: stopPointNames.length,
    unresolvedCandidateCount: unresolvedCandidates.length,
  });

  return result;
}

async function fetchStructuralConnectionStopPointNames(
  candidates: OfficialConnectionStopNameCandidate[],
  currentLineId: string,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
  requestSpacingMs = 0,
): Promise<string[]> {
  logTransferBundleDebug(logger, "debug", "structural-stop-points:start", {
    candidateCount: candidates.length,
    currentLineId,
  });

  const accepted = await mapBundleItemsWithConcurrency(
    candidates,
    STOP_POINT_LINE_BATCH_SIZE,
    Math.max(
      normalizeRequestSpacingMs(requestSpacingMs),
      DEFAULT_INTERNAL_NAVITIA_SPACING_MS,
    ),
    async (candidate) =>
      [
        candidate.name,
        await stopPointHasNonCurrentStructuralLine(
          candidate.stopPointId,
          currentLineId,
          fetcher,
          logger,
        ),
      ] as const,
  );

  const result = accepted
    .filter(([, hasStructuralLine]) => hasStructuralLine)
    .map(([name]) => name);

  logTransferBundleDebug(logger, "debug", "structural-stop-points:done", {
    acceptedCount: result.length,
    currentLineId,
    names: summarizeStringList(result),
    rejectedCount: Math.max(0, candidates.length - result.length),
  });

  return result;
}

async function fetchPaginatedNavitiaCollection<
  TPayload extends { pagination?: NavitiaPagination },
  TItem,
>(
  endpoint: string,
  baseSearchParams: URLSearchParams,
  collectionKey: keyof TPayload,
  maxResults: number,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<TItem[]> {
  const items: TItem[] = [];
  let page = 0;
  let totalResult: number | undefined;

  while (items.length < maxResults) {
    const searchParams = new URLSearchParams(baseSearchParams);

    searchParams.set("start_page", String(page));

    const url = `${endpoint}?${searchParams}`;
    logTransferBundleDebug(logger, "debug", "navitia-page:fetch", {
      collectionKey: String(collectionKey),
      page,
      url: sanitizeTransferBundleUrl(url),
    });

    const response = await fetcher(url);

    if (!response.ok) {
      logTransferBundleDebug(logger, "error", "navitia-page:non-ok", {
        collectionKey: String(collectionKey),
        page,
        status: response.status,
        statusText: response.statusText,
        url: sanitizeTransferBundleUrl(url),
      });

      throw createTransferBundleHttpStatusError(response.status, response.statusText);
    }

    const payload = (await response.json().catch(
      (): TPayload => ({} as TPayload),
    )) as TPayload;
    const pageItems = ((payload[collectionKey] as TItem[] | undefined) ?? []);
    const pagination = payload.pagination;

    items.push(...pageItems);
    totalResult = pagination?.total_result ?? totalResult;

    logTransferBundleDebug(logger, "debug", "navitia-page:done", {
      collectionKey: String(collectionKey),
      itemCount: pageItems.length,
      loadedCount: items.length,
      page,
      totalResult,
    });

    if (!pagination) {
      break;
    }

    const loadedCount =
      (pagination?.start_page ?? page) *
      (pagination?.items_per_page ?? pageItems.length) +
      (pagination?.items_on_page ?? pageItems.length);

    if (
      pageItems.length === 0 ||
      (typeof totalResult === "number" && loadedCount >= totalResult)
    ) {
      break;
    }

    page += 1;
  }

  return items.slice(0, maxResults);
}

async function mapBundleItemsWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  spacingMs: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  let nextStartAt = Date.now();
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const normalizedSpacingMs = normalizeRequestSpacingMs(spacingMs);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;

        nextIndex += 1;
        await waitForBundleLaunchSlot(
          normalizedSpacingMs,
          () => nextStartAt,
          (value) => {
            nextStartAt = value;
          },
        );
        results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
      }
    }),
  );

  return results;
}

async function waitForBundleLaunchSlot(
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

async function fetchNearbyStructuralStopAreaNames(
  stopAreaRef: string,
  currentLineId: string,
  fetcher: typeof fetch,
  officialConnectionNames: string[] = [],
  logger?: TransferBundleDebugLogger,
  requestSpacingMs = 0,
): Promise<string[]> {
  const officialConnectionKeys = new Set(
    officialConnectionNames.flatMap(createCompatibleBundleStationNameKeys),
  );
  const searchParams = new URLSearchParams({
    count: String(MAX_COMPATIBLE_NEARBY_STOP_AREAS),
    disable_disruption: "true",
    disable_geojson: "true",
    distance: String(COMPATIBLE_STOP_AREA_NEARBY_DISTANCE_METERS),
  });

  searchParams.append("type[]", "stop_area");

  const url = `${MARKETPLACE_NAVITIA_BASE}/stop_areas/${encodeURIComponent(
    stopAreaRef,
  )}/places_nearby?${searchParams}`;
  logTransferBundleDebug(logger, "info", "nearby-structural:fetch", {
    officialConnectionNameCount: officialConnectionNames.length,
    stopAreaRef,
    url: sanitizeTransferBundleUrl(url),
  });

  const response = await fetcher(url).catch((error) => {
    logTransferBundleDebug(logger, "warn", "nearby-structural:fetch-error", {
      error: formatTransferBundleError(error),
      stopAreaRef,
    });

    return undefined;
  });

  if (!response?.ok) {
    logTransferBundleDebug(logger, "warn", "nearby-structural:non-ok", {
      status: response?.status,
      statusText: response?.statusText,
      stopAreaRef,
    });

    return [];
  }

  const payload = (await response.json().catch(
    (): NavitiaPlacesNearbyResponse => ({}),
  )) as NavitiaPlacesNearbyResponse;
  const nearbyStopAreas = (payload.places_nearby ?? [])
    .filter((place) => place.embedded_type === "stop_area")
    .map((place) => ({
      distance: parseBundleDistance(place.distance),
      stopArea: place.stop_area,
    }))
    .filter(
      (place): place is {
        distance: number;
        stopArea: NonNullable<NavitiaNearbyPlace["stop_area"]>;
      } => Boolean(place.stopArea?.id),
    )
    .filter((place) => normalizeBundleStationName(place.stopArea.id) !== normalizeBundleStationName(stopAreaRef))
    .filter((place) =>
      officialConnectionNames.length === 0 ||
      bundleStopAreaNameMatchesOfficialConnection(
        cleanBundleStopAreaLabel(place.stopArea.name ?? place.stopArea.label ?? ""),
        officialConnectionNames,
        officialConnectionKeys,
      ),
    )
    .sort((left, right) => left.distance - right.distance);
  const names = new Set<string>();

  logTransferBundleDebug(logger, "info", "nearby-structural:candidates", {
    candidateCount: nearbyStopAreas.length,
    sample: nearbyStopAreas.slice(0, 8).map((place) => ({
      distance: place.distance,
      id: place.stopArea.id,
      name: cleanBundleStopAreaLabel(
        place.stopArea.name ?? place.stopArea.label ?? "",
      ),
    })),
    stopAreaRef,
  });

  const accepted = await mapBundleItemsWithConcurrency(
    nearbyStopAreas,
    STOP_POINT_LINE_BATCH_SIZE,
    Math.max(
      normalizeRequestSpacingMs(requestSpacingMs),
      DEFAULT_INTERNAL_NAVITIA_SPACING_MS,
    ),
    async ({ stopArea }) =>
      [
        cleanBundleStopAreaLabel(stopArea.name ?? stopArea.label ?? ""),
        await stopAreaHasNonCurrentStructuralLine(
          stopArea.id ?? "",
          currentLineId,
          fetcher,
          logger,
        ),
      ] as const,
  );

  accepted.forEach(([name, hasStructuralLine]) => {
    if (name && hasStructuralLine) {
      names.add(name);
    }
  });

  logTransferBundleDebug(logger, "debug", "nearby-structural:validated", {
    accepted: accepted
      .filter(([, hasStructuralLine]) => hasStructuralLine)
      .map(([name]) => name),
    candidateCount: nearbyStopAreas.length,
    rejectedCount: accepted.filter(([, hasStructuralLine]) => !hasStructuralLine).length,
    stopAreaRef,
  });

  const result = Array.from(names);

  logTransferBundleDebug(logger, "info", "nearby-structural:done", {
    names: summarizeStringList(result),
    stopAreaRef,
  });

  return result;
}

function collectOfficialConnectionStopNameCandidates(
  connections: NavitiaConnection[],
): OfficialConnectionStopNameCandidate[] {
  const candidates = new Map<string, OfficialConnectionStopNameCandidate>();

  connections.forEach((connection) => {
    [connection.origin, connection.destination].forEach((stopPoint) => {
      const name = cleanBundleConnectionStopName(stopPoint?.name ?? "");
      const stopPointId = stopPoint?.id?.trim() ?? "";

      if (!name || !stopPointId.startsWith("stop_point:")) {
        return;
      }

      candidates.set(`${stopPointId}:${normalizeBundleStationName(name)}`, {
        name,
        stopPointId,
      });
    });
  });

  return Array.from(candidates.values());
}

function bundleStationNameMatchesKeySet(
  name: string,
  acceptedKeys: Set<string>,
): boolean {
  return createCompatibleBundleStationNameKeys(name).some((key) =>
    acceptedKeys.has(key),
  );
}

function bundleStopAreaNameMatchesOfficialConnection(
  name: string,
  officialNames: string[],
  officialKeys: Set<string>,
): boolean {
  if (bundleStationNameMatchesKeySet(name, officialKeys)) {
    return true;
  }

  const nameTokens = createBundleStationTokens(normalizeBundleStationName(name));

  if (nameTokens.length < 2) {
    return false;
  }

  return officialNames.some((officialName) => {
    const officialTokens = createBundleStationTokens(
      normalizeBundleStationName(officialName),
    );
    const sharedTokenCount = nameTokens.filter((token) =>
      officialTokens.includes(token),
    ).length;

    return sharedTokenCount >= Math.min(nameTokens.length, officialTokens.length, 2);
  });
}

function bundleStationNameMatchesNameSet(
  name: string,
  acceptedNames: Set<string>,
): boolean {
  const acceptedKeys = new Set(
    Array.from(acceptedNames).flatMap(createCompatibleBundleStationNameKeys),
  );

  return bundleStationNameMatchesKeySet(name, acceptedKeys);
}

function createCompatibleBundleStationNameKeys(value: string): string[] {
  const normalized = normalizeBundleStationName(value);
  const withoutParentheses = normalizeBundleStationName(
    value.replace(/\([^)]*\)/gu, " "),
  );
  const withoutGarePrefix = normalized.replace(
    /^gare\s+(?!d(?:e|u|es)?\b)(.+)$/u,
    "$1",
  );
  const hyphenCompacted = normalized.replace(/\s*-\s*/gu, "-");
  const hyphenSpaced = normalized.replace(/\s*-\s*/gu, " - ");
  const safeComponents = createSafeBundleStationNameComponents(value);

  return Array.from(
    new Set(
      [
        normalized,
        withoutParentheses,
        withoutGarePrefix,
        hyphenCompacted,
        hyphenSpaced,
        ...safeComponents,
      ]
        .map(normalizeBundleStationName)
        .filter((key) => key.length > 0),
    ),
  );
}

function createSafeBundleStationNameComponents(value: string): string[] {
  const trimmed = value.trim();

  if (!trimmed || !/\s[-/]\s/u.test(trimmed)) {
    return [];
  }

  const parts = trimmed
    .split(/\s[-/]\s/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const candidates: string[] = [];

  parts.forEach((part) => {
    pushSafeBundleStationComponent(candidates, part);
  });

  for (let index = 1; index < parts.length; index += 1) {
    pushSafeBundleStationComponent(candidates, parts.slice(0, index + 1).join(" - "));
  }

  return candidates;
}

function pushSafeBundleStationComponent(target: string[], value: string): void {
  const normalized = normalizeBundleStationName(value);
  const tokens = createBundleStationTokens(normalized);

  if (tokens.length >= 2) {
    target.push(value);
  }

  const withoutNonGenericGarePrefix = normalized.replace(
    /^gare\s+(?!d(?:e|u|es)?\b)(.+)$/u,
    "$1",
  );

  if (
    withoutNonGenericGarePrefix !== normalized &&
    createBundleStationTokens(withoutNonGenericGarePrefix).length >= 2
  ) {
    target.push(withoutNonGenericGarePrefix);
  }
}

async function stopPointHasNonCurrentStructuralLine(
  stopPointId: string,
  currentLineId: string,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<boolean> {
  const now = Date.now();
  const cacheKey = `${STRUCTURAL_LINE_CACHE_VERSION}:stop-point-structural:${currentLineId}:${stopPointId}`;
  const cached = stopPointStructuralCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    logTransferBundleDebug(logger, "debug", "structural-stop-point:cache-hit", {
      currentLineId,
      stopPointId,
    });

    return cached.promise;
  }

  logTransferBundleDebug(logger, "debug", "structural-stop-point:fetch", {
    currentLineId,
    stopPointId,
  });

  const request = fetchStopPointHasNonCurrentStructuralLine(
    stopPointId,
    currentLineId,
    fetcher,
    logger,
  )
    .then((hasStructuralLine) => {
      if (!hasStructuralLine) {
        logTransferBundleDebug(logger, "debug", "structural-stop-point:rejected", {
          currentLineId,
          stopPointId,
        });
        stopPointStructuralCache.delete(cacheKey);
      } else {
        logTransferBundleDebug(logger, "debug", "structural-stop-point:accepted", {
          currentLineId,
          stopPointId,
        });
      }

      return hasStructuralLine;
    })
    .catch((error) => {
      logTransferBundleDebug(logger, "warn", "structural-stop-point:error", {
        currentLineId,
        error: formatTransferBundleError(error),
        stopPointId,
      });
      stopPointStructuralCache.delete(cacheKey);

      return false;
    });

  stopPointStructuralCache.set(cacheKey, {
    expiresAt: now + DEFAULT_RETENTION_DAYS * DAY_MS,
    promise: request,
  });

  return request;
}

async function stopAreaHasNonCurrentStructuralLine(
  stopAreaId: string,
  currentLineId: string,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<boolean> {
  const now = Date.now();
  const cacheKey = `${STRUCTURAL_LINE_CACHE_VERSION}:stop-area-structural:${currentLineId}:${stopAreaId}`;
  const cached = stopPointStructuralCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    logTransferBundleDebug(logger, "debug", "structural-stop-area:cache-hit", {
      currentLineId,
      stopAreaId,
    });

    return cached.promise;
  }

  logTransferBundleDebug(logger, "debug", "structural-stop-area:fetch", {
    currentLineId,
    stopAreaId,
  });

  const request = fetchStopAreaHasNonCurrentStructuralLine(
    stopAreaId,
    currentLineId,
    fetcher,
    logger,
  )
    .then((hasStructuralLine) => {
      if (!hasStructuralLine) {
        logTransferBundleDebug(logger, "debug", "structural-stop-area:rejected", {
          currentLineId,
          stopAreaId,
        });
        stopPointStructuralCache.delete(cacheKey);
      } else {
        logTransferBundleDebug(logger, "debug", "structural-stop-area:accepted", {
          currentLineId,
          stopAreaId,
        });
      }

      return hasStructuralLine;
    })
    .catch((error) => {
      logTransferBundleDebug(logger, "warn", "structural-stop-area:error", {
        currentLineId,
        error: formatTransferBundleError(error),
        stopAreaId,
      });
      stopPointStructuralCache.delete(cacheKey);

      return false;
    });

  stopPointStructuralCache.set(cacheKey, {
    expiresAt: now + DEFAULT_RETENTION_DAYS * DAY_MS,
    promise: request,
  });

  return request;
}

async function fetchStopPointHasNonCurrentStructuralLine(
  stopPointId: string,
  currentLineId: string,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<boolean> {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true",
  });
  const response = await fetcher(
    `${MARKETPLACE_NAVITIA_BASE}/stop_points/${encodeURIComponent(
      stopPointId,
    )}/lines?${searchParams}`,
  ).catch(() => undefined);

  if (!response?.ok) {
    logTransferBundleDebug(logger, "warn", "structural-stop-point:non-ok", {
      currentLineId,
      status: response?.status,
      statusText: response?.statusText,
      stopPointId,
    });

    return false;
  }

  const payload = (await response.json().catch(
    (): NavitiaLinesResponse => ({}),
  )) as NavitiaLinesResponse;

  const hasStructuralLine = (payload.lines ?? []).some(
    (line) =>
      normalizeBundleLineId(line.id) !== normalizeBundleLineId(currentLineId) &&
      navitiaLineHasStructuralMode(line),
  );

  logTransferBundleDebug(logger, "debug", "structural-stop-point:lines", {
    currentLineId,
    hasStructuralLine,
    lineCount: payload.lines?.length ?? 0,
    lines: (payload.lines ?? []).slice(0, 8).map(summarizeNavitiaLine),
    stopPointId,
  });

  return hasStructuralLine;
}

async function fetchStopAreaHasNonCurrentStructuralLine(
  stopAreaId: string,
  currentLineId: string,
  fetcher: typeof fetch,
  logger?: TransferBundleDebugLogger,
): Promise<boolean> {
  if (!stopAreaId) {
    return false;
  }

  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true",
  });
  const response = await fetcher(
    `${MARKETPLACE_NAVITIA_BASE}/stop_areas/${encodeURIComponent(
      stopAreaId,
    )}/lines?${searchParams}`,
  ).catch(() => undefined);

  if (!response?.ok) {
    logTransferBundleDebug(logger, "warn", "structural-stop-area:non-ok", {
      currentLineId,
      status: response?.status,
      statusText: response?.statusText,
      stopAreaId,
    });

    return false;
  }

  const payload = (await response.json().catch(
    (): NavitiaLinesResponse => ({}),
  )) as NavitiaLinesResponse;

  const hasStructuralLine = (payload.lines ?? []).some(
    (line) =>
      normalizeBundleLineId(line.id) !== normalizeBundleLineId(currentLineId) &&
      navitiaLineHasStructuralMode(line),
  );

  logTransferBundleDebug(logger, "debug", "structural-stop-area:lines", {
    currentLineId,
    hasStructuralLine,
    lineCount: payload.lines?.length ?? 0,
    lines: (payload.lines ?? []).slice(0, 8).map(summarizeNavitiaLine),
    stopAreaId,
  });

  return hasStructuralLine;
}

function navitiaLineHasStructuralMode(line: NavitiaLineForTransfer): boolean {
  const modeText = [
    line.commercial_mode?.id,
    line.commercial_mode?.name,
    ...(line.physical_modes ?? []).flatMap((mode) => [mode.id, mode.name]),
  ]
    .map(normalizeBundleStationName)
    .filter(Boolean)
    .join(" ");

  return (
    /\bmetro\b/u.test(modeText) ||
    /\btram\b/u.test(modeText) ||
    /\btramway\b/u.test(modeText) ||
    /\brapidtransit\b/u.test(modeText) ||
    /\blocaltrain\b/u.test(modeText) ||
    /\btrain\b/u.test(modeText) ||
    /\brail\b/u.test(modeText) ||
    /\bcable\b/u.test(modeText) ||
    /\bfunicular\b/u.test(modeText)
  );
}

function inferTransitFamilyFromNavitiaLine(
  line: NavitiaLineForTransfer,
): TransitFamily | undefined {
  const modeText = [
    line.commercial_mode?.id,
    line.commercial_mode?.name,
    ...(line.physical_modes ?? []).flatMap((mode) => [mode.id, mode.name]),
    line.name,
    line.code,
  ]
    .map(normalizeBundleStationName)
    .filter(Boolean)
    .join(" ");

  if (/\bmetro\b/u.test(modeText)) return "METRO";
  if (/\brer\b/u.test(modeText) || /\brapidtransit\b/u.test(modeText)) {
    return "RER";
  }
  if (/\btram\b/u.test(modeText) || /\btramway\b/u.test(modeText)) return "TRAM";
  if (/\bnoctilien\b/u.test(modeText)) return "NOCTILIEN";
  if (/\bbus\b/u.test(modeText)) return "BUS";
  if (
    /\blocaltrain\b/u.test(modeText) ||
    /\btrain\b/u.test(modeText) ||
    /\brail\b/u.test(modeText)
  ) {
    return "TRANSILIEN";
  }
  if (/\bcable\b/u.test(modeText) || /\bfunicular\b/u.test(modeText)) {
    return "CABLE";
  }

  return undefined;
}

function normalizeBundleLineId(value: string | undefined): string {
  return (normalizeIdfmLineId(value) ?? value ?? "").trim().toLowerCase();
}

function normalizeIdfmLineId(value?: string): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  if (/^line:IDFM:C\d{5}$/iu.test(trimmed)) {
    const idfmMatch = trimmed.match(/C\d{5}/iu)?.[0];

    return idfmMatch ? `line:IDFM:${idfmMatch.toUpperCase()}` : undefined;
  }

  const idfmMatch = trimmed.match(/C\d{5}/iu)?.[0];

  return idfmMatch ? `line:IDFM:${idfmMatch.toUpperCase()}` : undefined;
}

function mapSearchedStopAreaToStation(
  stopArea: NonNullable<NavitiaStopAreaSearchObject["stop_area"]>,
): StationSearchOption {
  const id = stopArea.id?.startsWith("stop_area:")
    ? stopArea.id
    : `stop_area:IDFM:${stopArea.id}`;

  return {
    id,
    label: cleanBundleStopAreaLabel(stopArea.name ?? stopArea.label ?? id),
    city:
      stopArea.administrative_regions?.[0]?.name ??
      extractBundleStopAreaCity(stopArea.label),
    monitoringRef: "",
    scheduleStopAreaRef: id,
  };
}

function cleanBundleStopAreaLabel(value: string): string {
  return value.replace(/\s+\([^)]*\)$/u, "").trim();
}

function cleanBundleConnectionStopName(value: string): string {
  return value.trim();
}

function extractBundleStopAreaCity(value: string | undefined): string | undefined {
  return value?.match(/\(([^)]+)\)\s*$/u)?.[1];
}

function parseBundleDistance(value: string | number | undefined): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : Number.POSITIVE_INFINITY;
}

function scoreStationNameMatch(
  normalizedTarget: string,
  targetTokens: string[],
  normalizedStation: string,
): number {
  if (!normalizedTarget || !normalizedStation) {
    return 0;
  }

  if (
    normalizedStation.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedStation)
  ) {
    return Math.min(normalizedTarget.length, normalizedStation.length) >= 6 ? 80 : 0;
  }

  const stationTokens = new Set(createBundleStationTokens(normalizedStation));
  const sharedTokenCount = targetTokens.filter((token) =>
    stationTokens.has(token),
  ).length;

  if (sharedTokenCount === 0) {
    return 0;
  }

  return sharedTokenCount >= Math.min(targetTokens.length, 2)
    ? 40 + sharedTokenCount
    : 0;
}

function createBundleStationTokens(value: string): string[] {
  return value
    .split(/\s+/u)
    .filter((token) => token.length >= 3)
    .filter(
      (token) =>
        ![
          "gare",
          "station",
          "metro",
          "rer",
          "tram",
          "bus",
          "sur",
          "sous",
          "les",
          "des",
          "aux",
        ].includes(token),
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

function normalizeBundleColor(value?: string): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.startsWith("#")
    ? trimmed.toLowerCase()
    : `#${trimmed.toLowerCase()}`;
}

function compareBundleTransfers(
  left: TransferLineOption,
  right: TransferLineOption,
): number {
  const familyDelta =
    bundleTransferFamilyPriority[left.family ?? "BUS"] -
    bundleTransferFamilyPriority[right.family ?? "BUS"];

  if (familyDelta !== 0) {
    return familyDelta;
  }

  return left.label.localeCompare(right.label, "fr", {
    numeric: true,
    sensitivity: "base",
  });
}

export function isSupportedTransferTargetRef(value: string): boolean {
  return isDirectTransferTargetRef(value) || isResolvableTransferTargetRef(value);
}

function isDirectTransferTargetRef(value: string): boolean {
  return /^stop_area:/u.test(value.trim());
}

function isResolvableTransferTargetRef(value: string): boolean {
  return /^FR::(?:Quay|StopPlace|mono(?:modal)?StopPlace|multi(?:modal)?StopPlace):/u.test(
    value.trim(),
  );
}

export function createEmptyTransferBundleMap(
  targets: TransferBundleTarget[],
): Record<string, TransferLineOption[]> {
  return Object.fromEntries(
    targets.map((target) => [target.stopAreaRef, [] as TransferLineOption[]]),
  );
}

export async function listServerTransferBundles(): Promise<TransferBundleSummary[]> {
  trimTransferCache();
  await hydrateServerTransferBundlesFromStorage();

  return Array.from(serverTransferBundles.values())
    .map((bundle) => ({
      id: bundle.id,
      lineId: bundle.lineId,
      lineLabel: bundle.lineLabel,
      updatedAt: bundle.updatedAt,
      expiresAt: bundle.expiresAt,
      retentionDays: bundle.retentionDays,
      requestConcurrency: bundle.requestConcurrency,
      nearbyDistanceMeters: bundle.nearbyDistanceMeters,
      stopAreaCount: bundle.stopAreaCount,
      transferCount: bundle.transferCount,
      transferResolverMode: bundle.transferResolverMode,
    }))
    .sort((left, right) => left.lineLabel.localeCompare(right.lineLabel, "fr"));
}

export async function clearServerTransferBundles(): Promise<void> {
  transferCache.clear();
  serverTransferBundles.clear();
  lineStopAreasCache.clear();
  nearbyStopAreasCache.clear();
  stopAreaLinesCache.clear();
  stopPointStructuralCache.clear();
  linePresentationCache.clear();

  const storage = getTransferBundleStorage();

  await storage.clear().catch(() => undefined);
}

export async function deleteServerTransferBundle(id: string): Promise<void> {
  serverTransferBundles.delete(id);
  await getTransferBundleStorage()
    .removeItem(createStoredTransferBundleKey(id))
    .catch(() => undefined);

  Array.from(transferCache.entries()).forEach(([key, cached]) => {
    if (cached.bundleId === id) {
      transferCache.delete(key);
    }
  });
}

export async function deleteServerTransferBundlesForLine(lineId: string): Promise<void> {
  const normalizedLineId = lineId.trim().toLowerCase();
  const deletedBundleIds = new Set<string>();

  await hydrateServerTransferBundlesFromStorage();

  Array.from(serverTransferBundles.entries()).forEach(([id, bundle]) => {
    if (bundle.lineId.trim().toLowerCase() === normalizedLineId) {
      deletedBundleIds.add(id);
      serverTransferBundles.delete(id);
    }
  });

  await Promise.all(
    Array.from(deletedBundleIds).map((id) =>
      getTransferBundleStorage()
        .removeItem(createStoredTransferBundleKey(id))
        .catch(() => undefined),
    ),
  );

  Array.from(transferCache.entries()).forEach(([key, cached]) => {
    if (deletedBundleIds.has(cached.bundleId)) {
      transferCache.delete(key);
    }
  });
}

async function saveServerTransferBundle(
  body: NormalizedTransferBundleRequestBody,
  transferResolverMode: EffectiveTransferResolverMode,
  bundleId: string,
  transfersByStopAreaRef: Record<string, TransferLineOption[]>,
): Promise<ServerTransferBundleRecord> {
  return queueServerTransferBundleWrite(bundleId, async () => {
    const existing = await readServerTransferBundle(bundleId);
    const mergedTransfers = {
      ...(existing?.transfersByStopAreaRef ?? {}),
      ...transfersByStopAreaRef,
    };
    const now = Date.now();
    const updatedAt = new Date(now).toISOString();
    const bundle: ServerTransferBundleRecord = {
      id: bundleId,
      lineId: body.lineId,
      lineLabel: body.lineLabel,
      generatedAt: existing?.generatedAt ?? updatedAt,
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
      expiresAt: new Date(now + body.retentionDays * DAY_MS).toISOString(),
      retentionDays: body.retentionDays,
      requestConcurrency: body.requestConcurrency,
      nearbyDistanceMeters: body.nearbyDistanceMeters,
      stopAreaCount: Object.keys(mergedTransfers).length,
      transferCount: countTransferLines(mergedTransfers),
      transferResolverMode,
      transfersByStopAreaRef: mergedTransfers,
    };

    serverTransferBundles.set(bundleId, bundle);
    await writeServerTransferBundle(bundle);

    return bundle;
  });
}

async function queueServerTransferBundleWrite<TResult>(
  bundleId: string,
  write: () => Promise<TResult>,
): Promise<TResult> {
  const previousWrite =
    serverTransferBundleWriteQueues.get(bundleId) ?? Promise.resolve();
  let result!: TResult;
  const currentWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      result = await write();
    });

  serverTransferBundleWriteQueues.set(bundleId, currentWrite);

  try {
    await currentWrite;
    return result;
  } finally {
    if (serverTransferBundleWriteQueues.get(bundleId) === currentWrite) {
      serverTransferBundleWriteQueues.delete(bundleId);
    }
  }
}

function createServerTransferBundleId(
  lineId: string,
  transferResolverMode: EffectiveTransferResolverMode,
  nearbyDistanceMeters: number,
): string {
  // Concurrency and spacing only affect how the bundle is built. They should not
  // create a different cache key because the expected transfer content is identical.
  return `${lineId.trim().toLowerCase()}::${transferResolverMode}::d${nearbyDistanceMeters}`;
}

function createTransferBundleResponseFromStoredBundle(
  body: NormalizedTransferBundleRequestBody,
  bundle: ServerTransferBundleRecord,
  transfersByStopAreaRef: Record<string, TransferLineOption[]>,
): TransferBundleResponse {
  return {
    version: 1,
    generatedAt: bundle.generatedAt,
    lineId: body.lineId,
    lineLabel: body.lineLabel,
    nearbyDistanceMeters: body.nearbyDistanceMeters,
    requestConcurrency: body.requestConcurrency,
    transferResolverMode: body.transferResolverMode,
    transfersByStopAreaRef,
  };
}

function getReusableTransferBundleEntries(
  bundle: ServerTransferBundleRecord | undefined,
  targets: TransferBundleTarget[],
): Record<string, TransferLineOption[]> {
  if (!bundle) {
    return {};
  }

  return Object.fromEntries(
    targets.flatMap((target) =>
      Object.prototype.hasOwnProperty.call(
        bundle.transfersByStopAreaRef,
        target.stopAreaRef,
      )
        ? [[target.stopAreaRef, bundle.transfersByStopAreaRef[target.stopAreaRef] ?? []]]
        : [],
    ),
  );
}

async function readServerTransferBundle(
  bundleId: string,
  logger?: TransferBundleDebugLogger,
): Promise<ServerTransferBundleRecord | undefined> {
  const memoryBundle = serverTransferBundles.get(bundleId);

  if (memoryBundle && !serverTransferBundleIsExpired(memoryBundle)) {
    return memoryBundle;
  }

  if (memoryBundle) {
    serverTransferBundles.delete(bundleId);
  }

  const storage = getTransferBundleStorage();
  const storedBundle = await storage
    .getItem(createStoredTransferBundleKey(bundleId))
    .catch((error): ServerTransferBundleRecord | null => {
      logTransferBundleDebug(logger, "warn", "storage:read-error", {
        bundleId,
        error: formatTransferBundleError(error),
      });

      return null;
    });

  if (!storedBundle) {
    return undefined;
  }

  if (serverTransferBundleIsExpired(storedBundle)) {
    await storage.removeItem(createStoredTransferBundleKey(bundleId)).catch(() => undefined);
    return undefined;
  }

  serverTransferBundles.set(bundleId, storedBundle);

  return storedBundle;
}

async function writeServerTransferBundle(
  bundle: ServerTransferBundleRecord,
): Promise<void> {
  await getTransferBundleStorage()
    .setItem(createStoredTransferBundleKey(bundle.id), bundle)
    .catch((error) => {
      console.warn("[transfer-bundles] storage:write-error", {
        bundleId: bundle.id,
        error: formatTransferBundleError(error),
      });
    });
}

async function hydrateServerTransferBundlesFromStorage(): Promise<void> {
  const storage = getTransferBundleStorage();
  const keys = await storage.getKeys().catch((): string[] => []);

  await Promise.all(
    keys.map(async (key) => {
      const bundle = await storage.getItem(key).catch(() => null);

      if (!bundle) {
        return;
      }

      if (serverTransferBundleIsExpired(bundle)) {
        await storage.removeItem(key).catch(() => undefined);
        return;
      }

      serverTransferBundles.set(bundle.id, bundle);
    }),
  );
}

function getTransferBundleStorage(): TransferBundleStorageDriver {
  if (typeof useStorage === "function") {
    return useStorage<ServerTransferBundleRecord>(
      TRANSFER_BUNDLE_STORAGE_BASE,
    ) as TransferBundleStorageDriver;
  }

  return {
    async clear() {
      fallbackTransferBundleStorage.clear();
    },
    async getItem(key) {
      return fallbackTransferBundleStorage.get(key) ?? null;
    },
    async getKeys() {
      return Array.from(fallbackTransferBundleStorage.keys());
    },
    async removeItem(key) {
      fallbackTransferBundleStorage.delete(key);
    },
    async setItem(key, value) {
      fallbackTransferBundleStorage.set(key, value);
    },
  };
}

function createStoredTransferBundleKey(bundleId: string): string {
  return encodeURIComponent(bundleId);
}

function serverTransferBundleIsExpired(bundle: ServerTransferBundleRecord): boolean {
  return Date.parse(bundle.expiresAt) <= Date.now();
}

function createTransferBundleDebugLogger(): TransferBundleDebugLogger {
  return {
    requestId: `tb-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    startedAt: Date.now(),
  };
}

function logTransferBundleDebug(
  logger: TransferBundleDebugLogger | undefined,
  level: TransferBundleDebugLogLevel,
  step: string,
  details: Record<string, unknown> = {},
): void {
  if (!logger) {
    return;
  }

  const payload = {
    elapsedMs: Date.now() - logger.startedAt,
    requestId: logger.requestId,
    step,
    ...details,
  };
  const message = `[transfer-bundles] ${logger.requestId} ${step}`;

  if (level === "error") {
    console.error(message, payload);
    return;
  }

  if (level === "warn") {
    console.warn(message, payload);
    return;
  }

  if (level === "debug") {
    console.debug(message, payload);
    return;
  }

  console.info(message, payload);
}

function summarizeTransferTarget(target: TransferBundleTarget): Record<string, unknown> {
  return {
    city: target.city,
    label: target.label,
    stopAreaRef: target.stopAreaRef,
  };
}

function summarizeStationOption(station: StationSearchOption): Record<string, unknown> {
  return {
    city: station.city,
    id: station.id,
    label: station.label,
    scheduleStopAreaRef: station.scheduleStopAreaRef,
  };
}

function summarizeTransferLines(
  transfers: TransferLineOption[] | undefined,
): Record<string, unknown> {
  if (!transfers) {
    return {
      count: "undefined",
      labels: [],
    };
  }

  const families = transfers.reduce<Record<string, number>>((counts, transfer) => {
    const family = transfer.family ?? "UNKNOWN";

    counts[family] = (counts[family] ?? 0) + 1;

    return counts;
  }, {});

  return {
    count: transfers.length,
    families,
    labels: transfers.map((transfer) => transfer.label),
  };
}

function summarizeNavitiaLine(line: NavitiaLineForTransfer): Record<string, unknown> {
  return {
    code: line.code,
    commercialMode: line.commercial_mode?.name ?? line.commercial_mode?.id,
    id: line.id,
    name: line.name,
    physicalModes: (line.physical_modes ?? []).map((mode) => mode.name ?? mode.id),
  };
}

function summarizeStringList(values: string[], limit = 16): Record<string, unknown> {
  return {
    count: values.length,
    omittedCount: Math.max(0, values.length - limit),
    sample: values.slice(0, limit),
  };
}

function countTransferLines(
  transfersByStopAreaRef: Record<string, TransferLineOption[]>,
): number {
  return Object.values(transfersByStopAreaRef).reduce(
    (count, transfers) => count + transfers.length,
    0,
  );
}

function formatTransferBundleError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      status:
        "status" in error && typeof error.status === "number"
          ? error.status
          : undefined,
      stack: error.stack?.split("\n").slice(0, 4),
    };
  }

  return {
    message: String(error),
  };
}

function createTransferBundleHttpStatusError(
  status: number,
  statusText: string,
): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), {
    status,
    statusText,
  });
}

function isTransferBundleHttpStatus(error: unknown, status: number): boolean {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status === status
  );
}

function sanitizeTransferBundleUrl(value: string): string {
  try {
    const url = new URL(value);

    url.searchParams.delete("apikey");

    return url.toString();
  } catch {
    return value.replace(/apikey=[^&]+/giu, "apikey=<redacted>");
  }
}

function createServerNavitiaFetcher(apiKey: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);

    headers.set("accept", "application/json");
    headers.set("apikey", apiKey);

    const delays = [220, 680, 1500];

    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      const response = await fetch(input, {
        ...init,
        headers,
      });

      if (!responseShouldRetry(response) || attempt === delays.length) {
        return response;
      }

      const retryDelayMs = getRetryAfterDelayMs(response) ?? delays[attempt];

      console.warn("[transfer-bundles] navitia-fetch:retry", {
        attempt: attempt + 1,
        delayMs: retryDelayMs,
        status: response.status,
        statusText: response.statusText,
        url: sanitizeTransferBundleUrl(String(input)),
      });

      await waitForTransferBundleRetry(
        retryDelayMs,
      );
    }

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

function responseShouldRetry(response: Response): boolean {
  return response.status === 429 || response.status >= 500;
}

function getRetryAfterDelayMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after")?.trim();

  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.min(MAX_SERVER_RETRY_AFTER_DELAY_MS, Math.max(0, seconds * 1000));
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp)
    ? Math.min(MAX_SERVER_RETRY_AFTER_DELAY_MS, Math.max(0, timestamp - Date.now()))
    : undefined;
}

function waitForTransferBundleRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function trimTransferCache(): void {
  const now = Date.now();

  Array.from(serverTransferBundles.entries()).forEach(([key, bundle]) => {
    if (Date.parse(bundle.expiresAt) <= now) {
      serverTransferBundles.delete(key);
    }
  });
  Array.from(transferCache.entries()).forEach(([key, cached]) => {
    if (
      cached.expiresAt <= now ||
      !serverTransferBundles.has(cached.bundleId)
    ) {
      transferCache.delete(key);
    }
  });
  Array.from(lineStopAreasCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      lineStopAreasCache.delete(key);
    }
  });
  Array.from(nearbyStopAreasCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      nearbyStopAreasCache.delete(key);
    }
  });
  Array.from(stopAreaLinesCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      stopAreaLinesCache.delete(key);
    }
  });
  Array.from(stopPointStructuralCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      stopPointStructuralCache.delete(key);
    }
  });
  Array.from(linePresentationCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      linePresentationCache.delete(key);
    }
  });
}
