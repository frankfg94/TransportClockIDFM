import type {
  GlobalMapLine,
  GlobalMapStation,
} from "../contracts/manifest";

export interface GlobalMapStationSearchGroup extends GlobalMapStation {
  /** Physical station records represented by this one search result. */
  memberStationIds: string[];
}

export interface GlobalMapSearchMatches {
  stations: GlobalMapStationSearchGroup[];
  lines: GlobalMapLine[];
}

export interface GlobalMapSearchOptions {
  stationLimit?: number;
  lineLimit?: number;
  /** Maximum distance for records that can represent one physical station. */
  sameNameMergeMaxDistanceM?: number;
  /** Minimum number of distinct heavy-transport lines in a cross-district cluster. */
  sameNameMergeMinHeavyLines?: number;
}

export interface GlobalMapIndexedStationSearchEntry {
  station: GlobalMapStation;
  normalizedValues: string[];
}

export interface GlobalMapIndexedLineSearchEntry {
  line: GlobalMapLine;
  normalizedValues: string[];
}

export interface GlobalMapSearchIndex {
  groups: GlobalMapStationSearchGroup[];
  groupsByMemberId: Map<string, GlobalMapStationSearchGroup>;
  groupEntries: Array<{
    group: GlobalMapStationSearchGroup;
    members: GlobalMapIndexedStationSearchEntry[];
  }>;
  stationEntriesById: Map<string, GlobalMapIndexedStationSearchEntry>;
  lineEntries: GlobalMapIndexedLineSearchEntry[];
  lineById: Map<string, GlobalMapLine>;
  stationLimit: number;
  lineLimit: number;
  queryCache: Map<string, GlobalMapSearchMatches>;
}

const NO_MATCH = Number.POSITIVE_INFINITY;
const MAX_SEARCH_CACHE_ENTRIES = 32;
export const GLOBAL_MAP_SEARCH_SAME_NAME_MERGE_MAX_DISTANCE_M = 200;
export const GLOBAL_MAP_SEARCH_SAME_NAME_MERGE_MIN_HEAVY_LINES = 2;

const HEAVY_TRANSPORT_MODES = new Set<GlobalMapLine["mode"]>([
  "METRO",
  "RER",
  "TRAIN",
  "TRANSILIEN",
  "TRAM",
]);

/**
 * Search normalization shared by the offline map search and its tests.
 * It deliberately stays local and deterministic so the Capacitor build never
 * needs a network geocoder or a runtime NeTEx parser.
 */
export function normalizeGlobalMapSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/giu, " ")
    .trim()
    // After accent/punctuation removal only ASCII (and Unicode case-fold
    // equivalents matched by /iu) remains; French locale casing adds no value.
    .toLowerCase();
}

/**
 * Builds the physical station groups used by every search surface.
 *
 * The catalogue contains one record per platform or stop. Records with the
 * same name and city are merged only when their coordinates are close. A
 * different Paris district is not enough to merge two homonyms: in that case
 * we additionally require a close cluster with at least two heavy-transport
 * lines. This handles Châtelet while keeping similarly named bus stops apart.
 */
export function groupGlobalMapStations(
  stations: GlobalMapStation[],
  lines: GlobalMapLine[],
  options: Pick<GlobalMapSearchOptions, "sameNameMergeMaxDistanceM" | "sameNameMergeMinHeavyLines"> = {},
): GlobalMapStationSearchGroup[] {
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const maxDistanceM = normaliseMergeDistance(options.sameNameMergeMaxDistanceM);
  const minHeavyLines = normaliseMinimumHeavyLines(options.sameNameMergeMinHeavyLines);
  const groupsByName = new Map<string, StationCluster[]>();

  for (const station of [...stations].sort(compareStationSourceOrder)) {
    const nameKey = normalizeGlobalMapSearchText(station.name || station.normalizedName);
    if (!nameKey) continue;

    const clusters = groupsByName.get(nameKey) ?? [];
    const cityKey = stationCityKey(station);
    const existing = maxDistanceM > 0
      ? clusters
        .filter((cluster) => cluster.cityKeys.size === 1 && cluster.cityKeys.has(cityKey))
        .filter((cluster) => stationsWithinDistance(cluster.members, [station], maxDistanceM))
        .sort((left, right) => distanceToCluster(left, station) - distanceToCluster(right, station))[0]
      : undefined;

    if (existing) {
      existing.members.push(station);
      existing.heavyLineIds = collectHeavyLineIds(existing.members, lineById);
      continue;
    }

    clusters.push(createStationCluster(station, lineById));
    groupsByName.set(nameKey, clusters);
  }

  for (const clusters of groupsByName.values()) {
    if (maxDistanceM <= 0) continue;
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex += 1) {
          const left = clusters[leftIndex];
          const right = clusters[rightIndex];
          if (!canMergeParisClusters(left, right, maxDistanceM, minHeavyLines)) continue;

          clusters[leftIndex] = mergeStationClusters(left, right, lineById);
          clusters.splice(rightIndex, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  return [...groupsByName.values()]
    .flat()
    .map((cluster) => toStationSearchGroup(cluster.members, lineById))
    .sort(compareStationSourceOrder);
}

/**
 * Precomputes all catalogue work that is independent from the user's query.
 * The returned index is intentionally local to one catalogue snapshot: when
 * the static data changes, Vue creates a new index and its small query cache.
 */
export function createGlobalMapSearchIndex(
  stations: GlobalMapStation[],
  lines: GlobalMapLine[],
  options: GlobalMapSearchOptions = {},
): GlobalMapSearchIndex {
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const groups = groupGlobalMapStations(stations, lines, options);
  const stationEntriesById = new Map(
    stations.map((station) => [station.id, {
      station,
      normalizedValues: normalizeSearchValues([
        station.name,
        station.normalizedName,
        station.city,
        ...station.aliases,
      ]),
    } satisfies GlobalMapIndexedStationSearchEntry]),
  );
  const groupsByMemberId = new Map<string, GlobalMapStationSearchGroup>();
  const groupEntries = groups.map((group) => {
    for (const stationId of group.memberStationIds) groupsByMemberId.set(stationId, group);
    return {
      group,
      members: group.memberStationIds
        .map((stationId) => stationEntriesById.get(stationId))
        .filter((entry): entry is GlobalMapIndexedStationSearchEntry => Boolean(entry)),
    };
  });
  const lineEntries = lines.map((line) => ({
    line,
    normalizedValues: normalizeSearchValues([
      line.code,
      line.label,
      line.id,
      line.mode,
      `${line.mode} ${line.code}`,
      `${line.mode} ${line.label}`,
      ...line.aliases,
    ]),
  } satisfies GlobalMapIndexedLineSearchEntry));

  return {
    groups,
    groupsByMemberId,
    groupEntries,
    stationEntriesById,
    lineEntries,
    lineById,
    stationLimit: options.stationLimit ?? 8,
    lineLimit: options.lineLimit ?? 8,
    queryCache: new Map(),
  };
}

export function searchGlobalMapIndex(
  index: GlobalMapSearchIndex,
  query: string,
): GlobalMapSearchMatches {
  const normalizedQuery = normalizeGlobalMapSearchText(query);
  if (!normalizedQuery) return { stations: [], lines: [] };

  const cached = index.queryCache.get(normalizedQuery);
  if (cached) {
    index.queryCache.delete(normalizedQuery);
    index.queryCache.set(normalizedQuery, cached);
    return cached;
  }

  const scoreByStationId = new Map(
    [...index.stationEntriesById.values()]
      .map((entry) => [entry.station.id, scoreNormalizedSearchMatch(normalizedQuery, entry.normalizedValues)] as const)
      .filter((entry) => entry[1] !== NO_MATCH),
  );
  const stationMatches = index.groupEntries
    .map((entry) => ({
      station: entry.group,
      score: Math.min(...entry.members.map((member) => scoreByStationId.get(member.station.id) ?? NO_MATCH)),
    }))
    .filter((entry) => entry.score !== NO_MATCH)
    .map((entry) => {
      return {
        ...entry,
        station: {
          ...entry.station,
          lineIds: [...entry.station.lineIds].sort((left, right) => compareLineIds(left, right, index.lineById)),
        },
      };
    })
    .sort((left, right) =>
      left.score - right.score ||
      Number(right.station.isHub) - Number(left.station.isHub) ||
      right.station.lineIds.length - left.station.lineIds.length ||
      left.station.name.localeCompare(right.station.name, "fr-FR", { sensitivity: "base" }) ||
      left.station.id.localeCompare(right.station.id),
    )
    .slice(0, index.stationLimit)
    .map((entry) => entry.station);

  const lineMatches = index.lineEntries
    .map((entry) => ({
      line: entry.line,
      score: scoreNormalizedSearchMatch(normalizedQuery, entry.normalizedValues),
    }))
    .filter((entry) => entry.score !== NO_MATCH)
    .sort((left, right) =>
      left.score - right.score ||
      compareLineIds(left.line.id, right.line.id, index.lineById) ||
      left.line.code.localeCompare(right.line.code, "fr-FR", { numeric: true, sensitivity: "base" }) ||
      left.line.label.localeCompare(right.line.label, "fr-FR", { sensitivity: "base" }),
    )
    .slice(0, index.lineLimit)
    .map((entry) => entry.line);

  const result = { stations: stationMatches, lines: lineMatches };
  index.queryCache.set(normalizedQuery, result);
  while (index.queryCache.size > MAX_SEARCH_CACHE_ENTRIES) {
    const oldest = index.queryCache.keys().next().value;
    if (oldest === undefined) break;
    index.queryCache.delete(oldest);
  }
  return result;
}

/**
 * Compatibility facade for existing callers and tests. New reactive search
 * surfaces should create one index and call searchGlobalMapIndex directly.
 */
export function searchGlobalMapNetwork(
  stations: GlobalMapStation[],
  lines: GlobalMapLine[],
  query: string,
  options: GlobalMapSearchOptions = {},
): GlobalMapSearchMatches {
  if (!normalizeGlobalMapSearchText(query)) return { stations: [], lines: [] };
  return searchGlobalMapIndex(createGlobalMapSearchIndex(stations, lines, options), query);
}

interface StationCluster {
  members: GlobalMapStation[];
  cityKeys: Set<string>;
  heavyLineIds: Set<string>;
}

function createStationCluster(station: GlobalMapStation, lineById: Map<string, GlobalMapLine>): StationCluster {
  return {
    members: [station],
    cityKeys: new Set([stationCityKey(station)]),
    heavyLineIds: collectHeavyLineIds([station], lineById),
  };
}

function mergeStationClusters(
  left: StationCluster,
  right: StationCluster,
  lineById: Map<string, GlobalMapLine>,
): StationCluster {
  const members = [...new Map(
    [...left.members, ...right.members].map((station) => [station.id, station]),
  ).values()];
  return {
    members,
    cityKeys: new Set([...left.cityKeys, ...right.cityKeys]),
    heavyLineIds: collectHeavyLineIds(members, lineById),
  };
}

function toStationSearchGroup(
  members: GlobalMapStation[],
  lineById: Map<string, GlobalMapLine>,
): GlobalMapStationSearchGroup {
  const uniqueMembers = [...new Map(members.map((station) => [station.id, station])).values()];
  const representative = uniqueMembers.reduce((current, candidate) =>
    compareStationRepresentatives(candidate, current, lineById) < 0 ? candidate : current,
  );
  const lineIds = uniqueValues(uniqueMembers.flatMap((station) => station.lineIds));

  return {
    ...representative,
    memberStationIds: uniqueMembers.map((station) => station.id).sort(),
    lineIds,
    aliases: uniqueValues(uniqueMembers.flatMap((station) => station.aliases)).sort((left, right) => left.localeCompare(right, "fr-FR")),
    rawRefs: uniqueValues(uniqueMembers.flatMap((station) => station.rawRefs)).sort(),
    isHub: uniqueMembers.some((station) => station.isHub) || lineIds.length > 1,
  };
}

function canMergeParisClusters(
  left: StationCluster,
  right: StationCluster,
  maxDistanceM: number,
  minHeavyLines: number,
): boolean {
  const cityKeys = new Set([...left.cityKeys, ...right.cityKeys]);
  if (cityKeys.size < 2 || ![...cityKeys].every(isParisCityKey)) return false;
  if (!stationsWithinDistance(left.members, right.members, maxDistanceM)) return false;

  const heavyLineIds = new Set([...left.heavyLineIds, ...right.heavyLineIds]);
  return heavyLineIds.size >= minHeavyLines;
}

function stationsWithinDistance(
  left: GlobalMapStation[],
  right: GlobalMapStation[],
  maxDistanceM: number,
): boolean {
  return left.every((leftStation) => right.every((rightStation) => {
    const distance = distanceMeters(leftStation, rightStation);
    return distance !== undefined && distance <= maxDistanceM;
  }));
}

function distanceToCluster(cluster: StationCluster, station: GlobalMapStation): number {
  return Math.min(...cluster.members.map((member) => distanceMeters(member, station) ?? Number.POSITIVE_INFINITY));
}

function distanceMeters(left: GlobalMapStation, right: GlobalMapStation): number | undefined {
  if (![left.lon, left.lat, right.lon, right.lat].every(Number.isFinite)) return undefined;

  const earthRadiusM = 6_371_008.8;
  const latitudeDelta = (right.lat - left.lat) * Math.PI / 180;
  const longitudeDelta = (right.lon - left.lon) * Math.PI / 180;
  const leftLatitude = left.lat * Math.PI / 180;
  const rightLatitude = right.lat * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function collectHeavyLineIds(
  stations: GlobalMapStation[],
  lineById: Map<string, GlobalMapLine>,
): Set<string> {
  return new Set(stations.flatMap((station) => station.lineIds.filter((lineId) => {
    const mode = lineById.get(lineId)?.mode;
    return mode ? HEAVY_TRANSPORT_MODES.has(mode) : false;
  })));
}

function stationCityKey(station: GlobalMapStation): string {
  return normalizeGlobalMapSearchText(station.city ?? "");
}

function isParisCityKey(cityKey: string): boolean {
  return /^paris(?:\s+\d{1,2}(?:e|er|eme)?)?$/u.test(cityKey);
}

function normaliseMergeDistance(value: number | undefined): number {
  if (value === 0) return 0;
  return Number.isFinite(value) && (value ?? 0) > 0
    ? value as number
    : GLOBAL_MAP_SEARCH_SAME_NAME_MERGE_MAX_DISTANCE_M;
}

function normaliseMinimumHeavyLines(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0
    ? Math.max(1, Math.floor(value as number))
    : GLOBAL_MAP_SEARCH_SAME_NAME_MERGE_MIN_HEAVY_LINES;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}

function compareStationSourceOrder(left: GlobalMapStationSearchGroup | GlobalMapStation, right: GlobalMapStationSearchGroup | GlobalMapStation): number {
  return left.index - right.index || left.id.localeCompare(right.id);
}

function compareStationRepresentatives(
  left: GlobalMapStation,
  right: GlobalMapStation,
  lineById?: Map<string, GlobalMapLine>,
): number {
  const leftHeavyLines = lineById ? collectHeavyLineIds([left], lineById).size : 0;
  const rightHeavyLines = lineById ? collectHeavyLineIds([right], lineById).size : 0;
  return rightHeavyLines - leftHeavyLines ||
    Number(right.isHub) - Number(left.isHub) ||
    right.lineIds.length - left.lineIds.length ||
    left.id.localeCompare(right.id);
}

function compareLineIds(
  leftId: string,
  rightId: string,
  lineById: Map<string, GlobalMapLine>,
): number {
  const left = lineById.get(leftId);
  const right = lineById.get(rightId);
  const leftRank = left ? modeRank(left.mode) : Number.MAX_SAFE_INTEGER;
  const rightRank = right ? modeRank(right.mode) : Number.MAX_SAFE_INTEGER;
  return leftRank - rightRank ||
    (left?.code ?? leftId).localeCompare(right?.code ?? rightId, "fr-FR", { numeric: true, sensitivity: "base" });
}

export function modeRank(mode: GlobalMapLine["mode"]): number {
  if (mode === "RER") return 0;
  if (mode === "TRANSILIEN" || mode === "TRAIN") return 1;
  if (mode === "METRO") return 2;
  if (mode === "TRAM") return 3;
  if (mode === "BUS" || mode === "NOCTILIEN") return 4;
  return 5;
}

function normalizeSearchValues(values: Array<string | undefined>): string[] {
  return values
    .map((value) => normalizeGlobalMapSearchText(value ?? ""))
    .filter(Boolean);
}

function scoreNormalizedSearchMatch(query: string, values: string[]): number {
  const queryVariants = [
    query,
    query.replace(/^(?:ligne|line)\s+/u, ""),
  ].filter(Boolean);

  let bestScore = NO_MATCH;
  for (const normalizedValue of values) {
    if (!normalizedValue) continue;

    for (const variant of queryVariants) {
      if (normalizedValue === variant) bestScore = Math.min(bestScore, 0);
      else if (normalizedValue.startsWith(variant)) bestScore = Math.min(bestScore, 10);
      else if (normalizedValue.includes(variant)) bestScore = Math.min(bestScore, 20);
      else if (compact(normalizedValue).includes(compact(variant))) bestScore = Math.min(bestScore, 30);
    }
  }

  return bestScore;
}

function compact(value: string): string {
  return value.replace(/\s+/gu, "");
}
