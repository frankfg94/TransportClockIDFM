import type {
  StationSearchOption,
  TransferLineOption,
  TransitFamily,
} from "../types/transit";
import {
  createTransferLineOption,
  dedupeTransferLineOptions,
} from "./transferLineOptions";
import { toServerApiUrl } from "./serverApi";

interface ArretsLignesRecord {
  id?: string;
  route_id?: string;
  route_short_name?: string;
  shortname?: string;
  route_long_name?: string;
  route_type?: number | string;
  mode?: string;
  stop_id?: string;
  stop_name?: string;
}

interface ArretsLignesResponse {
  results?: ArretsLignesRecord[];
}

interface OpenDataTransferOptions {
  apiBase?: string;
  compatibleStopNames?: string[];
  currentLineLabel?: string;
  fetcher?: typeof fetch;
}

interface ArretsLignesQueryPlan {
  acceptRow?: (row: ArretsLignesRecord) => boolean;
  acceptRows?: (rows: ArretsLignesRecord[]) => ArretsLignesRecord[];
  where: string;
}

export const ARRETS_LIGNES_RECORDS_URL =
  "https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/arrets-lignes/records";
export const ARRETS_LIGNES_PROXY_RECORDS_URL =
  "/api/opendata/arrets-lignes/records";
export const ARRETS_LIGNES_SELECT_FIELDS =
  "id,shortname,route_long_name,mode,stop_name,stop_id";

const routeTypePriority: Record<TransitFamily, number> = {
  METRO: 0,
  RER: 1,
  TRANSILIEN: 2,
  TRAM: 3,
  CABLE: 4,
  BUS: 5,
  NOCTILIEN: 6,
};
const ARRETS_LIGNES_QUERY_CONCURRENCY = 6;

export async function fetchStationTransfersFromArretsLignes(
  station: StationSearchOption,
  currentLineId?: string,
  options: OpenDataTransferOptions = {},
): Promise<TransferLineOption[]> {
  const stationName = decodeMojibake(station.label).trim();

  if (!stationName) {
    return [];
  }

  const currentLineKeys = createCurrentLineKeys(
    currentLineId,
    options.currentLineLabel,
  );
  const acceptedRows: ArretsLignesRecord[] = [];
  const acceptedStopNames = new Set<string>();
  const compatibleStopNames = normalizeCompatibleStopNames(
    options.compatibleStopNames ?? [],
    stationName,
  );
  let hadSuccessfulResponse = false;
  let lastError: Error | undefined;

  const loadQuery = async (query: ArretsLignesQueryPlan): Promise<void> => {
    const response = await requestArretsLignesRecords(query.where, options).catch(
      (error: Error) => {
        lastError = error;

        return undefined;
      },
    );

    if (!response) {
      return;
    }

    hadSuccessfulResponse = true;
    lastError = undefined;
    appendAcceptedArretsLignesRows(
      acceptedRows,
      acceptedStopNames,
      response.results ?? [],
      query,
    );
  };
  const loadQueries = (queries: ArretsLignesQueryPlan[]): Promise<void> =>
    mapArretsLignesItemsWithConcurrency(
      queries,
      ARRETS_LIGNES_QUERY_CONCURRENCY,
      loadQuery,
    );

  await loadQueries(createBaseArretsLignesQueryPlan(stationName));
  await loadQueries(createCompatibleStopNameQueryPlan(compatibleStopNames));

  if (
    normalizeArretsLignesTransfers(
      acceptedRows,
      stationName,
      currentLineKeys,
      acceptedStopNames,
    ).length === 0
  ) {
    const searchQuery = createSearchArretsLignesQuery(stationName);

    if (searchQuery) {
      await loadQuery(searchQuery);
    }
  }

  if (hadSuccessfulResponse) {
    return normalizeArretsLignesTransfers(
      acceptedRows,
      stationName,
      currentLineKeys,
      acceptedStopNames,
    );
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

async function mapArretsLignesItemsWithConcurrency<TItem>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;

        nextIndex += 1;
        await mapper(items[currentIndex]!, currentIndex);
      }
    }),
  );
}

export function resolveArretsLignesRecordsUrl(apiBase?: string): string {
  const explicitApiBase = apiBase?.trim();

  if (explicitApiBase) {
    return explicitApiBase;
  }

  return isBrowserRuntime()
    ? toServerApiUrl(ARRETS_LIGNES_PROXY_RECORDS_URL)
    : ARRETS_LIGNES_RECORDS_URL;
}

export function createArretsLignesWhereClauses(stationName: string): string[] {
  const exactName = stationName.trim();
  const searchText = createOpendatasoftSearchText(exactName);
  const clauses = [
    `stop_name = "${escapeOpendatasoftStringValue(exactName)}"`,
  ];

  if (searchText && normalizeText(searchText) !== normalizeText(exactName)) {
    clauses.push(
      `search(stop_name, "${escapeOpendatasoftSearchValue(searchText)}")`,
    );
  } else if (searchText) {
    clauses.push(
      `search(stop_name, "${escapeOpendatasoftSearchValue(searchText)}")`,
    );
  }

  return Array.from(new Set(clauses));
}

function createBaseArretsLignesQueryPlan(
  stationName: string,
): ArretsLignesQueryPlan[] {
  const exactName = stationName.trim();
  const queries: ArretsLignesQueryPlan[] = [
    {
      where: `stop_name = "${escapeOpendatasoftStringValue(exactName)}"`,
      acceptRow: (row) => stopNameEquals(row.stop_name, exactName),
    },
  ];

  createCompoundStationParts(exactName).forEach((part) => {
    queries.push({
      where: `stop_name = "${escapeOpendatasoftStringValue(part)}"`,
      acceptRow: (row) => stopNameEquals(row.stop_name, part),
    });
    queries.push({
      where: `search(stop_name, "${escapeOpendatasoftSearchValue(
        createOpendatasoftSearchText(part),
      )}")`,
      acceptRow: (row) => stopNameEquals(row.stop_name, part),
    });
  });

  return dedupeArretsLignesQueries(queries);
}

function createSearchArretsLignesQuery(
  stationName: string,
): ArretsLignesQueryPlan | undefined {
  const exactName = stationName.trim();
  const searchText = createOpendatasoftSearchText(exactName);

  if (!searchText) {
    return undefined;
  }

  return {
    where: `search(stop_name, "${escapeOpendatasoftSearchValue(searchText)}")`,
    acceptRow: (row) => rowMatchesExpandedStationSearchAlias(exactName, row),
  };
}

function appendAcceptedArretsLignesRows(
  targetRows: ArretsLignesRecord[],
  targetStopNames: Set<string>,
  rows: ArretsLignesRecord[],
  query: ArretsLignesQueryPlan,
): void {
  const acceptedRows = query.acceptRows
    ? query.acceptRows(rows)
    : rows.filter(query.acceptRow ?? (() => false));

  acceptedRows.forEach((row) => {
    targetRows.push(row);

    if (row.stop_name) {
      targetStopNames.add(row.stop_name);
    }
  });
}

function dedupeArretsLignesQueries(
  queries: ArretsLignesQueryPlan[],
): ArretsLignesQueryPlan[] {
  const seen = new Set<string>();

  return queries.filter((query) => {
    if (seen.has(query.where)) {
      return false;
    }

    seen.add(query.where);

    return true;
  });
}

async function requestArretsLignesRecords(
  where: string,
  options: OpenDataTransferOptions,
): Promise<ArretsLignesResponse> {
  const searchParams = new URLSearchParams({
    where,
    select: ARRETS_LIGNES_SELECT_FIELDS,
    limit: "100",
  });
  const response = await (options.fetcher ?? fetch)(
    `${resolveArretsLignesRecordsUrl(options.apiBase)}?${searchParams}`,
    {
      headers: createArretsLignesRequestHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(`IDFM arrets-lignes request failed: ${response.status}`);
  }

  return (await response.json()) as ArretsLignesResponse;
}

export function normalizeArretsLignesTransfers(
  rows: ArretsLignesRecord[],
  stationName: string,
  currentLineKeys = new Set<string>(),
  compatibleStopNames: Iterable<string> = [],
): TransferLineOption[] {
  const transfers = new Map<string, TransferLineOption>();
  const compatibleStopNameAliases = new Set(
    Array.from(compatibleStopNames).flatMap(createStationNameAliases),
  );

  rows.forEach((row) => {
    if (
      !stationNamesAreCompatible(stationName, row.stop_name) &&
      !stationNameMatchesAliasSet(row.stop_name, compatibleStopNameAliases)
    ) {
      return;
    }

    const label = normalizeRouteLabel(
      row.route_short_name ?? row.shortname,
      row.route_long_name,
    );

    if (!label) {
      return;
    }

    const family = inferFamilyFromArretsLignesRow(row, label);
    const routeKey = createRouteIdentityKey(row, family, label);

    if (
      currentLineKeys.has(routeKey) ||
      currentLineKeys.has(createRouteLabelOnlyKey(label))
    ) {
      return;
    }

    if (!transfers.has(routeKey)) {
      transfers.set(routeKey, mapArretsLignesRowToTransfer(row, family, label));
    }
  });

  return dedupeTransferLineOptions(Array.from(transfers.values())).sort(
    compareTransferLines,
  );
}

export function createCurrentLineKeys(
  currentLineId?: string,
  currentLineLabel?: string,
): Set<string> {
  const keys = new Set<string>();

  createLineIdKeys(currentLineId).forEach((key) => keys.add(key));

  const label = normalizeRouteLabel(currentLineLabel);

  if (label) {
    keys.add(createRouteLabelOnlyKey(label));
  }

  return keys;
}

function mapArretsLignesRowToTransfer(
  row: ArretsLignesRecord,
  family: TransitFamily,
  label: string,
): TransferLineOption {
  const id =
    getRouteId(row) ??
    `opendata:arrets-lignes:${family.toLowerCase()}:${normalizeRouteKey(label)}`;

  return createTransferLineOption({
    code: label,
    family,
    id,
    label,
    mode: familyToDisplayMode(family),
    ref: getRouteId(row) ?? row.route_id ?? row.id,
  });
}

function createRouteIdentityKey(
  row: ArretsLignesRecord,
  family: TransitFamily,
  label: string,
): string {
  const routeIdKey = getRouteId(row);

  return routeIdKey ? `id:${routeIdKey}` : createRouteKey(family, label);
}

function createLineIdKeys(value?: string): string[] {
  const normalized = normalizeRouteId(value);

  if (!normalized) {
    return [];
  }

  return [`id:${normalized}`];
}

function createRouteKey(family: TransitFamily, label: string): string {
  return `label:${family}:${normalizeRouteKey(label)}`;
}

function createRouteLabelOnlyKey(label: string): string {
  return `label:${normalizeRouteKey(label)}`;
}

function inferFamilyFromArretsLignesRow(
  row: ArretsLignesRecord,
  label: string,
): TransitFamily {
  const routeType = Number(row.route_type);
  const normalizedLabel = normalizeRouteKey(label);
  const mode = normalizeText(row.mode);
  const longName = normalizeText(row.route_long_name);

  if (routeType === 7 || longName.includes("cable")) {
    return "CABLE";
  }

  if (routeType === 0 || mode.includes("tram") || longName.includes("tram")) {
    return "TRAM";
  }

  if (routeType === 1 || mode.includes("metro") || longName.includes("metro")) {
    return "METRO";
  }

  if (
    routeType === 2 ||
    mode.includes("rapidtransit") ||
    mode.includes("rail") ||
    mode.includes("train") ||
    longName.includes("rer") ||
    longName.includes("train")
  ) {
    if (mode.includes("rapidtransit") || longName.includes("rer")) {
      return "RER";
    }

    return "TRANSILIEN";
  }

  return normalizedLabel.startsWith("n") ? "NOCTILIEN" : "BUS";
}

function getRouteId(row: ArretsLignesRecord): string | undefined {
  return normalizeRouteId(row.route_id ?? row.id);
}

function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function createArretsLignesRequestHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (!isBrowserRuntime()) {
    headers["accept-language"] = "fr-FR,fr;q=0.9,en;q=0.8";
    headers["user-agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
  }

  return headers;
}

function stationNamesAreCompatible(
  expectedName: string,
  candidateName?: string,
): boolean {
  const expectedAliases = createStationNameAliases(expectedName);
  const candidateAliases = createStationNameAliases(candidateName ?? "");

  return expectedAliases.some((expected) => candidateAliases.includes(expected));
}

function stationNameMatchesAliasSet(
  candidateName: string | undefined,
  aliases: Set<string>,
): boolean {
  if (aliases.size === 0) {
    return false;
  }

  return createStationNameAliases(candidateName ?? "").some((alias) =>
    aliases.has(alias),
  );
}

function stopNameEquals(left: string | undefined, right: string): boolean {
  return normalizeText(left) === normalizeText(right);
}

function createCompoundStationParts(stationName: string): string[] {
  if (!/\s[-/]\s/u.test(stationName)) {
    return [];
  }

  return stationName
    .split(/\s[-/]\s/u)
    .map((part) => part.trim())
    .filter((part) => createStationNameTokens(part).length > 0);
}

function stopNameIsCoherentExpandedAlias(
  expectedName: string,
  candidateName?: string,
): boolean {
  const expected = normalizeText(expectedName);
  const candidate = normalizeText(candidateName);
  const expectedTokens = createStationNameTokens(expected);
  const candidateTokens = createStationNameTokens(candidate);

  if (!expected || !candidate || expectedTokens.length === 0) {
    return false;
  }

  if (candidate === expected) {
    return true;
  }

  if (
    candidate === `${expected} rer` ||
    candidate === `${expected} train` ||
    candidate === `${expected} metro`
  ) {
    return true;
  }

  if (expectedTokens.every((token) => candidateTokens.includes(token))) {
    return /^(?:gare|chateau|aeroport|terminal|station)\s+(?:de|du|des|d)\s+/u.test(
      candidate,
    );
  }

  return false;
}

function rowMatchesExpandedStationSearchAlias(
  expectedName: string,
  row: ArretsLignesRecord,
): boolean {
  const label = normalizeRouteLabel(row.route_short_name ?? row.shortname, row.route_long_name);

  if (!label) {
    return false;
  }

  const family = inferFamilyFromArretsLignesRow(row, label);
  const structural = transferFamilyIsStructural(family);

  if (stopNameEquals(row.stop_name, expectedName)) {
    return true;
  }

  if (stationNamesAreCompatible(expectedName, row.stop_name)) {
    return structural || stopNameHasFocusedTransportSuffix(expectedName, row.stop_name);
  }

  if (stopNameIsCoherentExpandedAlias(expectedName, row.stop_name)) {
    return structural || stopNameHasFocusedTransportSuffix(expectedName, row.stop_name);
  }

  return false;
}

function transferFamilyIsStructural(family: TransitFamily): boolean {
  return family !== "BUS" && family !== "NOCTILIEN";
}

function stopNameHasFocusedTransportSuffix(
  expectedName: string,
  candidateName?: string,
): boolean {
  const expected = normalizeText(expectedName);
  const candidate = normalizeText(candidateName);

  if (!expected || !candidate) {
    return false;
  }

  return [
    `${expected} rer`,
    `${expected} metro`,
    `${expected} train`,
    `${expected} tram`,
    `${expected} tramway`,
  ].includes(candidate);
}

function createCompatibleStopNameQueryPlan(
  compatibleStopNames: string[],
): ArretsLignesQueryPlan[] {
  return dedupeArretsLignesQueries(
    compatibleStopNames
      .flatMap(createCompatibleStopNameSearchVariants)
      .flatMap((name): ArretsLignesQueryPlan[] => [
        {
          where: `stop_name = "${escapeOpendatasoftStringValue(name)}"`,
          acceptRow: (row) =>
            stopNameEquals(row.stop_name, name) &&
            arretsLignesRowHasStructuralFamily(row),
        },
        {
          where: `search(stop_name, "${escapeOpendatasoftSearchValue(
            createOpendatasoftSearchText(name),
          )}")`,
          acceptRow: (row) =>
            stopNameEquals(row.stop_name, name) &&
            arretsLignesRowHasStructuralFamily(row),
        },
      ]),
  );
}

function createCompatibleStopNameSearchVariants(name: string): string[] {
  const trimmedName = decodeMojibake(name).trim();
  const variants = [trimmedName];
  const withoutNonGenericGarePrefix = trimmedName.match(
    /^gare\s+(?!d(?:e|u|es)?\b|d['\s])(.+)$/iu,
  )?.[1]?.trim();

  if (withoutNonGenericGarePrefix) {
    variants.push(withoutNonGenericGarePrefix);
  }

  createSafeCompatibleStationParts(trimmedName).forEach((part) => {
    variants.push(part);

    const withoutPartGarePrefix = part.match(
      /^gare\s+(?!d(?:e|u|es)?\b|d['\s])(.+)$/iu,
    )?.[1]?.trim();

    if (withoutPartGarePrefix) {
      variants.push(withoutPartGarePrefix);
    }
  });

  if (/\s+-\s+/u.test(trimmedName)) {
    variants.push(trimmedName.replace(/\s+-\s+/gu, "-"));
  }

  if (/-/u.test(trimmedName)) {
    variants.push(trimmedName.replace(/\s*-\s*/gu, " - "));
  }

  const seen = new Set<string>();

  return variants.filter((variant) => {
    const key = variant.toLocaleLowerCase("fr").trim();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function createSafeCompatibleStationParts(stationName: string): string[] {
  if (!/\s[-/]\s/u.test(stationName)) {
    return [];
  }

  const parts = stationName
    .split(/\s[-/]\s/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const variants: string[] = [];

  parts.forEach((part) => {
    if (createStationNameTokens(part).length >= 2) {
      variants.push(part);
    }
  });

  for (let index = 1; index < parts.length; index += 1) {
    const prefix = parts.slice(0, index + 1).join(" - ");

    if (createStationNameTokens(prefix).length >= 2) {
      variants.push(prefix);
    }
  }

  return variants;
}

function arretsLignesRowHasStructuralFamily(row: ArretsLignesRecord): boolean {
  const label = normalizeRouteLabel(row.route_short_name ?? row.shortname, row.route_long_name);

  return Boolean(label && transferFamilyIsStructural(inferFamilyFromArretsLignesRow(row, label)));
}

function normalizeCompatibleStopNames(
  values: string[],
  stationName: string,
): string[] {
  const stationKey = normalizeText(stationName);
  const names = values
    .map((value) => decodeMojibake(value).trim())
    .filter((value) => value.length > 0)
    .filter((value) => normalizeText(value) !== stationKey);

  return Array.from(new Set(names));
}

function createStationNameTokens(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/u)
    .filter((token) => token.length >= 3)
    .filter(
      (token) =>
        ![
          "de",
          "du",
          "des",
          "les",
          "la",
          "le",
          "rer",
          "metro",
          "train",
          "tram",
          "bus",
        ].includes(token),
    );
}

function createStationNameAliases(value: string): string[] {
  const base = normalizeText(value);
  const withoutParentheses = normalizeText(value.replace(/\([^)]*\)/gu, " "));
  const withoutTransportSuffix = withoutParentheses.replace(
    /\b(?:metro|rer|tram|train|bus)\b/gu,
    " ",
  );
  const withoutStationPrefix = withoutTransportSuffix.replace(
    /^(?:gare|station)\s+(?:de|du|des|d'|d\s+)?/u,
    "",
  );

  return Array.from(
    new Set(
      [
        base,
        withoutParentheses,
        normalizeText(withoutTransportSuffix),
        normalizeText(withoutStationPrefix),
      ]
        .map(compactStationKey)
        .filter((key) => key.length >= 3),
    ),
  );
}

function normalizeRouteLabel(
  shortName?: string,
  longName?: string,
): string | undefined {
  const rawLabel = shortName?.trim() || longName?.trim();

  if (!rawLabel) {
    return undefined;
  }

  return rawLabel
    .replace(/^ligne\s+/iu, "")
    .replace(/^m(?:etro|étro)\s+/iu, "")
    .replace(/^rer\s+/iu, "")
    .replace(/^tram(?:way)?\s+/iu, "")
    .trim();
}

function escapeOpendatasoftSearchValue(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
}

function escapeOpendatasoftStringValue(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
}

function createOpendatasoftSearchText(value: string): string {
  return value
    .replace(/[-‐‑‒–—―]+/gu, " ")
    .replace(/[\u2019']/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeRouteId(value?: string): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("line:")) {
    return trimmed;
  }

  const idfmMatch = trimmed.match(/C\d{5}/iu)?.[0];

  return idfmMatch ? `line:IDFM:${idfmMatch.toUpperCase()}` : trimmed;
}

function normalizeRouteKey(value: string): string {
  return normalizeText(value).replace(/\s+/gu, "");
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\u2019']/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function decodeMojibake(value: string): string {
  if (!/[ÃƒÃ‚]/u.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0) & 0xff));

    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return value;
  }
}

function compactStationKey(value: string): string {
  return value.replace(/\s+/gu, "");
}

function familyToDisplayMode(family: TransitFamily): string {
  if (family === "METRO") return "Metro";
  if (family === "RER") return "RER";
  if (family === "TRAM") return "Tram";
  if (family === "TRANSILIEN") return "Train";
  if (family === "CABLE") return "Cable";
  if (family === "NOCTILIEN") return "Noctilien";

  return "Bus";
}

function compareTransferLines(
  left: TransferLineOption,
  right: TransferLineOption,
): number {
  const familyDelta =
    routeTypePriority[left.family ?? "BUS"] -
    routeTypePriority[right.family ?? "BUS"];

  if (familyDelta !== 0) {
    return familyDelta;
  }

  return left.label.localeCompare(right.label, "fr", {
    numeric: true,
    sensitivity: "base",
  });
}
