import type {
  AnnualRidershipLineDocument,
  AnnualRidershipLineRanking,
  AnnualRidershipLineStationDocument,
  AnnualRidershipRanking,
  AnnualRidershipStationDocument,
  AnnualRidershipStationModeRanking,
  AnnualRidershipStationRankings,
  AnnualRidershipStationLineRanking,
  AnnualRidershipValue,
} from "../../../src/types/ridership";

type RankedValue = {
  id: string;
  value: AnnualRidershipValue;
};

type StationCandidate = AnnualRidershipLineStationDocument | AnnualRidershipStationDocument;

const STATION_METRIC_ORDER: Record<string, number> = {
  annual_station_entries: 0,
  annual_station_boardings: 1,
};

const IDFM_RAIL_VALIDATION_SOURCE = "idfm-rail-validations";

export function rankLine(
  line: AnnualRidershipLineDocument,
  lines: AnnualRidershipLineDocument[],
): AnnualRidershipLineRanking | undefined {
  const ranking = rankValue(
    line.primary,
    lines
      .filter((candidate) => candidate.mode === line.mode)
      .map((candidate) => ({ id: candidate.id, value: candidate.primary })),
  );
  return ranking
    ? { ...ranking, scope: "mode", mode: line.mode }
    : undefined;
}

export function rankStationCollections(
  stationId: string,
  line: AnnualRidershipLineDocument,
  lines: AnnualRidershipLineDocument[],
): AnnualRidershipStationRankings {
  const allStations = canonicalStations(lines);
  const modeStations = canonicalStations(lines.filter((candidate) => candidate.mode === line.mode));
  const station = line.stations.find((candidate) => candidate.id === stationId) ??
    allStations.find((candidate) => candidate.id === stationId);

  if (!station) return {};

  // NB_VALD is a station entry metric. It contains no travelled-line data, so
  // a rail-validation station is comparable with the complete IDFM rail
  // station cohort and, as a separate station-only view, with the physical
  // stations served by the active line. Neither comparison creates or implies
  // a travelled-line total.
  if (isIdfmRailValidation(station.primary)) {
    const network = rankIdfmRailValidationStation(station.primary, lines);
    const lineRanking = rankIdfmRailValidationStationCandidates(station.primary, line.stations);
    return {
      ...(network ? { network: { ...network, scope: "network" } } : {}),
      ...(lineRanking
        ? {
          line: {
            ...lineRanking,
            scope: "line",
            lineId: line.id,
          } satisfies AnnualRidershipStationLineRanking,
        }
        : {}),
    };
  }

  const network = rankContextStation(
    stationId,
    station.primary,
    allStations.find((candidate) => candidate.id === stationId),
    allStations,
  );
  const mode = rankValue(
    modeStations.find((candidate) => candidate.id === stationId)?.primary ?? station.primary,
    modeStations.map((candidate) => ({ id: candidate.id, value: candidate.primary })),
  );
  const lineRanking = rankValue(
    station.primary,
    line.stations.map((candidate) => ({ id: candidate.id, value: candidate.primary })),
  );

  return {
    ...(network ? { network: { ...network, scope: "network" } } : {}),
    ...(mode
      ? {
        mode: {
          ...mode,
          scope: "mode",
          mode: line.mode,
        } satisfies AnnualRidershipStationModeRanking,
      }
      : {}),
    ...(lineRanking
      ? {
        line: {
          ...lineRanking,
          scope: "line",
          lineId: line.id,
        } satisfies AnnualRidershipStationLineRanking,
      }
      : {}),
  };
}

export function rankNetworkStation(
  stationId: string,
  lines: AnnualRidershipLineDocument[],
): AnnualRidershipRanking | undefined {
  const stations = canonicalStations(lines);
  const station = stations.find((candidate) => candidate.id === stationId);
  if (station && isIdfmRailValidation(station.primary)) {
    return rankIdfmRailValidationStation(station.primary, lines);
  }
  return rankStations(stationId, stations);
}

export function rankStations(
  stationId: string,
  stations: AnnualRidershipStationDocument[],
): AnnualRidershipRanking | undefined {
  const station = stations.find((candidate) => candidate.id === stationId);
  if (!station) return undefined;
  return rankValue(
    station.primary,
    stations.map((candidate) => ({ id: candidate.id, value: candidate.primary })),
  );
}

export function decorateLineWithRankings(
  line: AnnualRidershipLineDocument,
  lines: AnnualRidershipLineDocument[],
): AnnualRidershipLineDocument {
  return {
    ...line,
    ranking: rankLine(line, lines),
    stations: line.stations.map((station) => ({
      ...station,
      rankings: rankStationCollections(station.id, line, lines),
    })),
  };
}

export function canonicalStations(
  lines: AnnualRidershipLineDocument[],
): AnnualRidershipStationDocument[] {
  const candidatesById = new Map<string, StationCandidate[]>();
  for (const line of lines) {
    for (const station of line.stations) {
      const candidates = candidatesById.get(station.id) ?? [];
      candidates.push(station);
      candidatesById.set(station.id, candidates);
    }
  }

  return [...candidatesById.entries()]
    .map(([id, candidates]) => canonicalStation(id, candidates))
    .filter((station): station is AnnualRidershipStationDocument => Boolean(station));
}

function canonicalStation(
  id: string,
  candidates: StationCandidate[],
): AnnualRidershipStationDocument | undefined {
  const preferred = [...candidates]
    .filter((candidate) => isRankable(candidate.primary))
    .sort(comparePrimaryPreference);
  const selected = preferred[0];
  if (!selected) {
    const fallback = candidates[0];
    return fallback
      ? {
        id,
        name: fallback.name,
        ...(fallback.city ? { city: fallback.city } : {}),
        lineIds: [...new Set(candidates.flatMap((candidate) => candidate.lineIds))].sort(),
        measures: mergeMeasures(candidates),
        primary: fallback.primary,
      }
      : undefined;
  }

  const compatible = preferred.filter((candidate) =>
    comparableKey(candidate.primary) === comparableKey(selected.primary),
  );
  const hasConflictingValues = compatible.some((candidate) => candidate.primary.value !== selected.primary.value);
  const primary = hasConflictingValues
    ? unavailableValue()
    : selected.primary;

  return {
    id,
    name: selected.name,
    ...(selected.city ? { city: selected.city } : {}),
    lineIds: [...new Set(candidates.flatMap((candidate) => candidate.lineIds))].sort(),
    measures: mergeMeasures(candidates),
    primary,
  };
}

function rankValue(
  value: AnnualRidershipValue,
  candidates: RankedValue[],
): AnnualRidershipRanking | undefined {
  if (!isRankable(value)) return undefined;
  const key = rankingComparableKey(value);
  if (!key) return undefined;

  const compatible = candidates.filter((candidate) =>
    isRankable(candidate.value) && rankingComparableKey(candidate.value) === key,
  );
  if (!compatible.length) return undefined;

  const rank = 1 + compatible.filter((candidate) => candidate.value.value! > value.value!).length;
  return {
    scope: "network",
    rank,
    total: compatible.length,
    year: value.year!,
    metric: value.metric!,
    unit: value.unit!,
  };
}

function rankIdfmRailValidationStation(
  value: AnnualRidershipValue,
  lines: AnnualRidershipLineDocument[],
): AnnualRidershipRanking | undefined {
  return rankIdfmRailValidationStationCandidates(value, lines.flatMap((line) => line.stations));
}

function rankIdfmRailValidationStationCandidates(
  value: AnnualRidershipValue,
  stations: AnnualRidershipLineStationDocument[],
): AnnualRidershipRanking | undefined {
  const candidatesByIdentity = new Map<string, AnnualRidershipLineStationDocument>();
  for (const station of stations) {
    if (!isIdfmRailValidation(station.primary)) continue;
    const identity = station.primary.qualifier?.stationIdentity || station.id;
    const existing = candidatesByIdentity.get(identity);
    if (!existing || comparePrimaryPreference(station, existing) < 0) {
      candidatesByIdentity.set(identity, station);
    }
  }
  return rankValue(value, [...candidatesByIdentity.entries()].map(([id, station]) => ({ id, value: station.primary })));
}

/**
 * A physical station can have incompatible primary records when several
 * source families describe it (for example RATP and SNCF at La Défense).
 * Keep the active line's station value as the target of the network ranking
 * in that case, while replacing—not duplicating—the ambiguous canonical row.
 */
function rankContextStation(
  stationId: string,
  contextValue: AnnualRidershipValue,
  canonical: AnnualRidershipStationDocument | undefined,
  stations: AnnualRidershipStationDocument[],
): AnnualRidershipRanking | undefined {
  if (canonical && isRankable(canonical.primary)) {
    return rankValue(
      canonical.primary,
      stations.map((candidate) => ({ id: candidate.id, value: candidate.primary })),
    );
  }

  if (!isRankable(contextValue)) return undefined;
  const candidates = stations
    .filter((candidate) => candidate.id !== stationId)
    .map((candidate) => ({ id: candidate.id, value: candidate.primary }));
  if (!candidates.some((candidate) => rankingComparableKey(candidate.value) === rankingComparableKey(contextValue))) {
    return undefined;
  }

  const ranking = rankValue(contextValue, [...candidates, { id: stationId, value: contextValue }]);
  return ranking && ranking.total > 1 ? ranking : undefined;
}

function isRankable(value: AnnualRidershipValue): boolean {
  return value.status !== "unavailable" &&
    typeof value.value === "number" &&
    Number.isFinite(value.value) &&
    typeof value.year === "number" &&
    typeof value.metric === "string" &&
    typeof value.unit === "string";
}

function comparableKey(value: AnnualRidershipValue): string | undefined {
  return isRankable(value)
    ? `${value.metric}|${value.unit}|${value.year}`
    : undefined;
}

/**
 * Source datasets do not publish every line for the same calendar year. The
 * primary value already records the source year, so ranking a mode by the
 * exact year would create artificial cohorts (for example only two RER
 * lines). Compare the same metric and unit across the available source years.
 */
function rankingComparableKey(value: AnnualRidershipValue): string | undefined {
  if (isIdfmRailValidation(value)) {
    return `${value.metric}|${value.unit}|${value.year}|${IDFM_RAIL_VALIDATION_SOURCE}`;
  }
  return isRankable(value)
    ? `${value.metric}|${value.unit}`
    : undefined;
}

function isIdfmRailValidation(value: AnnualRidershipValue): boolean {
  return isRankable(value) &&
    value.metric === "annual_station_entries" &&
    value.unit === "entries" &&
    value.sourceIds.includes(IDFM_RAIL_VALIDATION_SOURCE);
}

function comparePrimaryPreference(left: StationCandidate, right: StationCandidate): number {
  const leftMetric = STATION_METRIC_ORDER[left.primary.metric ?? ""] ?? 99;
  const rightMetric = STATION_METRIC_ORDER[right.primary.metric ?? ""] ?? 99;
  return leftMetric - rightMetric ||
    Number(right.primary.status === "official") - Number(left.primary.status === "official") ||
    (right.primary.year ?? 0) - (left.primary.year ?? 0) ||
    left.id.localeCompare(right.id);
}

function mergeMeasures(candidates: StationCandidate[]) {
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => candidate.measures).filter((measure) => {
    const key = JSON.stringify(measure);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unavailableValue(): AnnualRidershipValue {
  return { value: null, status: "unavailable", sourceIds: [], sourceRecordIds: [] };
}
