import {
  fetchBoardDepartures,
  fetchDirectionGroupsForStation,
  fetchTransitFamilyOptions,
  searchLineStations,
  searchTransitLines,
  type NavitiaRequestOptions,
} from "../../../src/services/idfm";
import { createBoardFromDraft } from "../../../src/services/boardBuilder";
import { normalizeTrafficLineRef } from "../../../src/features/traffic/trafficNormalization";
import type { TrafficLineReport } from "../../../src/features/traffic/types";
import type {
  DirectionGroupConfig,
  LineSearchOption,
  StationSearchOption,
  TransitFamily,
  TransitFamilyOption,
} from "../../../src/types/transit";
import type {
  HomeAssistantBoard,
  HomeAssistantBoardRequest,
  HomeAssistantBoardsResponse,
  HomeAssistantCatalogResponse,
  HomeAssistantDirection,
  HomeAssistantFamily,
  HomeAssistantLine,
  HomeAssistantStation,
} from "../../../src/types/homeAssistant";

const STRUCTURAL_CACHE_TTL_MS = 6 * 60 * 60_000;
const BOARD_CACHE_TTL_MS = 8_000;
const MAX_BOARDS_PER_REQUEST = 20;
const VALID_FAMILIES = new Set<TransitFamily>([
  "BUS",
  "CABLE",
  "METRO",
  "NOCTILIEN",
  "RER",
  "TRAM",
  "TRANSILIEN",
]);

interface HomeAssistantTransitApiDependencies {
  fetchTraffic: (lineRef: string) => Promise<TrafficLineReport>;
  requestOptions: NavitiaRequestOptions;
}

interface CachedPromise<T> {
  expiresAt: number;
  promise: Promise<T>;
}

export class HomeAssistantTransitApi {
  private readonly boardCache = new Map<
    string,
    CachedPromise<HomeAssistantBoard>
  >();
  private readonly structuralCache = new Map<string, CachedPromise<unknown>>();

  constructor(
    private readonly dependencies: HomeAssistantTransitApiDependencies,
  ) {}

  async listFamilies(): Promise<HomeAssistantCatalogResponse<HomeAssistantFamily>> {
    const items = await this.getFamilies();

    return catalog(items.map(mapFamily));
  }

  async searchLines(
    family: string,
    query: string,
  ): Promise<HomeAssistantCatalogResponse<HomeAssistantLine>> {
    const familyOption = await this.resolveFamily(family);
    const lines = query.trim()
      ? await searchTransitLines(
          familyOption,
          query.trim(),
          this.dependencies.requestOptions,
        )
      : await this.getLines(familyOption);

    return catalog(lines.map((line) => mapLine(line, familyOption.family)));
  }

  async searchStations(
    family: string,
    lineId: string,
    query: string,
  ): Promise<HomeAssistantCatalogResponse<HomeAssistantStation>> {
    const line = await this.resolveLine(family, lineId);
    const stations = query.trim()
      ? await searchLineStations(
          line,
          query.trim(),
          this.dependencies.requestOptions,
        )
      : await this.getStations(line);

    return catalog(stations.map(mapStation));
  }

  async listDirections(
    family: string,
    lineId: string,
    stationId: string,
  ): Promise<HomeAssistantCatalogResponse<HomeAssistantDirection>> {
    const line = await this.resolveLine(family, lineId);
    const station = await this.resolveStation(line, stationId);
    const directions = await this.getDirections(line, station);

    return catalog(directions.map(mapDirection));
  }

  async getBoards(
    requests: HomeAssistantBoardRequest[],
  ): Promise<HomeAssistantBoardsResponse> {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new HomeAssistantApiInputError("At least one board is required.");
    }

    if (requests.length > MAX_BOARDS_PER_REQUEST) {
      throw new HomeAssistantApiInputError(
        `A maximum of ${MAX_BOARDS_PER_REQUEST} boards is allowed.`,
      );
    }

    return {
      boards: await Promise.all(
        requests.map(async (request) => {
          try {
            validateBoardRequest(request);
            return await this.getCachedBoard(request);
          } catch (error) {
            return createErrorBoard(request, error);
          }
        }),
      ),
      generatedAt: new Date().toISOString(),
    };
  }

  private getCachedBoard(
    request: HomeAssistantBoardRequest,
  ): Promise<HomeAssistantBoard> {
    const cacheKey = JSON.stringify({
      directionIds: [...request.directionIds].sort(),
      family: request.family,
      limit: request.limit,
      lineId: request.lineId,
      stationId: request.stationId,
    });

    return this.getCached(
      this.boardCache,
      cacheKey,
      BOARD_CACHE_TTL_MS,
      () => this.buildBoard(request),
    );
  }

  private async buildBoard(
    request: HomeAssistantBoardRequest,
  ): Promise<HomeAssistantBoard> {
    const family = await this.resolveFamily(request.family);
    const line = await this.resolveLine(request.family, request.lineId);
    const station = await this.resolveStation(line, request.stationId);
    const availableDirections = await this.getDirections(line, station);
    const requestedIds = new Set(request.directionIds);
    const directions = availableDirections.filter((direction) =>
      requestedIds.has(direction.id),
    );

    if (directions.length === 0) {
      throw new HomeAssistantApiInputError(
        "None of the requested directions exists for this station.",
      );
    }

    const board = createBoardFromDraft(
      {
        family: family.family,
        line,
        station,
      },
      directions,
    );
    board.maxDepartures = Math.max(
      request.limit * directions.length,
      request.limit,
    );
    board.maxDeparturesPerDirection = request.limit;

    const lineRef = normalizeTrafficLineRef(
      board.schedule?.lineRef ?? board.line.ref,
    );
    const [departures, traffic] = await Promise.all([
      fetchBoardDepartures(board, this.dependencies.requestOptions),
      this.dependencies.fetchTraffic(lineRef),
    ]);

    return {
      city: board.city || undefined,
      color: board.line.color,
      directions: departures.directionGroups.map((direction) => ({
        departures: direction.departures.slice(0, request.limit).map((item) => ({
          aimedTime: item.aimedDepartureTime,
          destination: item.destination,
          expectedTime:
            item.expectedDepartureTime ?? item.expectedArrivalTime,
          id: item.id,
          platform: item.platform,
          status: item.status,
          vehicleAtStop: item.vehicleAtStop,
        })),
        id: direction.id,
        label: direction.label,
        serviceEnded: direction.serviceEnded,
        subtitle: direction.subtitle,
      })),
      family: family.family,
      iconUrl: board.line.iconUrl,
      id: board.id,
      lineId: line.id,
      lineLabel: line.label,
      stationId: station.id,
      stationLabel: station.label,
      textColor: board.line.textColor,
      traffic: {
        disruptions: traffic.disruptions,
        status: traffic.status,
      },
    };
  }

  private getFamilies(): Promise<TransitFamilyOption[]> {
    return this.getStructural("families", () =>
      fetchTransitFamilyOptions(this.dependencies.requestOptions),
    );
  }

  private getLines(family: TransitFamilyOption): Promise<LineSearchOption[]> {
    return this.getStructural(`lines:${family.family}`, () =>
      searchTransitLines(family, "", this.dependencies.requestOptions),
    );
  }

  private getStations(line: LineSearchOption): Promise<StationSearchOption[]> {
    return this.getStructural(`stations:${line.id}`, () =>
      searchLineStations(line, "", this.dependencies.requestOptions),
    );
  }

  private getDirections(
    line: LineSearchOption,
    station: StationSearchOption,
  ): Promise<DirectionGroupConfig[]> {
    return this.getStructural(`directions:${line.id}:${station.id}`, () =>
      fetchDirectionGroupsForStation(
        line,
        station,
        this.dependencies.requestOptions,
      ),
    );
  }

  private async resolveFamily(value: string): Promise<TransitFamilyOption> {
    if (!VALID_FAMILIES.has(value as TransitFamily)) {
      throw new HomeAssistantApiInputError(`Unsupported family: ${value}`);
    }

    const family = (await this.getFamilies()).find(
      (candidate) => candidate.family === value,
    );

    if (!family) {
      throw new HomeAssistantApiNotFoundError(`Family not found: ${value}`);
    }

    return family;
  }

  private async resolveLine(
    familyValue: string,
    lineId: string,
  ): Promise<LineSearchOption> {
    const family = await this.resolveFamily(familyValue);
    const line = (await this.getLines(family)).find(
      (candidate) =>
        candidate.id === lineId || candidate.navitiaId === lineId,
    );

    if (!line) {
      throw new HomeAssistantApiNotFoundError(`Line not found: ${lineId}`);
    }

    return line;
  }

  private async resolveStation(
    line: LineSearchOption,
    stationId: string,
  ): Promise<StationSearchOption> {
    const station = (await this.getStations(line)).find(
      (candidate) => candidate.id === stationId,
    );

    if (!station) {
      throw new HomeAssistantApiNotFoundError(
        `Station not found: ${stationId}`,
      );
    }

    return station;
  }

  private getStructural<T>(key: string, factory: () => Promise<T>): Promise<T> {
    return this.getCached(
      this.structuralCache as Map<string, CachedPromise<T>>,
      key,
      STRUCTURAL_CACHE_TTL_MS,
      factory,
    );
  }

  private getCached<T>(
    cache: Map<string, CachedPromise<T>>,
    key: string,
    ttl: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const existing = cache.get(key);

    if (existing && existing.expiresAt > Date.now()) {
      return existing.promise;
    }

    const promise = factory();
    cache.set(key, {
      expiresAt: Date.now() + ttl,
      promise,
    });
    promise.catch(() => cache.delete(key));

    return promise;
  }
}

export class HomeAssistantApiInputError extends Error {}
export class HomeAssistantApiNotFoundError extends Error {}

function catalog<T>(items: T[]): HomeAssistantCatalogResponse<T> {
  return {
    generatedAt: new Date().toISOString(),
    items,
  };
}

function mapFamily(family: TransitFamilyOption): HomeAssistantFamily {
  return {
    family: family.family,
    id: family.id,
    label: family.label,
  };
}

function mapLine(
  line: LineSearchOption,
  family: TransitFamily,
): HomeAssistantLine {
  return {
    color: line.color,
    displayName: line.displayName,
    family,
    iconUrl: line.iconUrl,
    id: line.id,
    label: line.label,
    textColor: line.textColor,
  };
}

function mapStation(station: StationSearchOption): HomeAssistantStation {
  return {
    city: station.city,
    id: station.id,
    label: station.label,
    latitude: station.lat,
    longitude: station.lon,
  };
}

function mapDirection(
  direction: DirectionGroupConfig,
): HomeAssistantDirection {
  return {
    id: direction.id,
    label: direction.label,
    subtitle: direction.subtitle,
  };
}

function validateBoardRequest(request: HomeAssistantBoardRequest): void {
  if (!request || typeof request !== "object") {
    throw new HomeAssistantApiInputError("Invalid board request.");
  }

  if (!VALID_FAMILIES.has(request.family)) {
    throw new HomeAssistantApiInputError("Invalid transit family.");
  }

  if (!request.lineId?.trim() || !request.stationId?.trim()) {
    throw new HomeAssistantApiInputError(
      "lineId and stationId are required.",
    );
  }

  if (
    !Array.isArray(request.directionIds) ||
    request.directionIds.length === 0
  ) {
    throw new HomeAssistantApiInputError(
      "At least one directionId is required.",
    );
  }

  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 5) {
    throw new HomeAssistantApiInputError("limit must be between 1 and 5.");
  }
}

function createErrorBoard(
  request: Partial<HomeAssistantBoardRequest>,
  error: unknown,
): HomeAssistantBoard {
  return {
    directions: [],
    error: error instanceof Error ? error.message : "Unknown board error.",
    family: VALID_FAMILIES.has(request.family as TransitFamily)
      ? (request.family as TransitFamily)
      : "BUS",
    id: `${request.lineId ?? "unknown"}:${request.stationId ?? "unknown"}`,
    lineId: request.lineId ?? "",
    lineLabel: request.lineId ?? "Unknown line",
    stationId: request.stationId ?? "",
    stationLabel: request.stationId ?? "Unknown station",
    traffic: {
      disruptions: [],
      status: "error",
    },
  };
}
