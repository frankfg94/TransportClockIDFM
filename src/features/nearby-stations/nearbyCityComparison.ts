import type { IrisAirNoiseStatistics, IrisNeighborhood } from "../transport-map/iris/irisApi";

export type NearbyCityComparisonTone = "better" | "worse" | "equal" | "unavailable";

export interface NearbyCityComparisonMetric {
  id: string;
  label: string;
  currentValue: string;
  targetValue: string;
  currentNumeric?: number;
  targetNumeric?: number;
  /** Whether a larger numeric value is the better result for this metric. */
  higherIsBetter?: boolean;
  /** Which shared icon illustrates the metric, resolved by the row component. */
  icon?: NearbyCityComparisonMetricIcon;
  /** The value is missing only because its data is still being fetched. */
  currentLoading?: boolean;
  targetLoading?: boolean;
  /**
   * Upper bound of the metric's own scale, used by the dumbbell visualisation.
   * Omitted for open ended counts (population, per-capita ratios), which are
   * scaled against the two compared values instead.
   */
  scaleMax?: number;
  /** Detail rows revealed when the metric row is expanded. */
  detail?: NearbyCityComparisonDetail;
}

/** Visual identifier per comparison row; the view owns the actual glyph. */
export type NearbyCityComparisonMetricIcon =
  | "population"
  | "transport-lines"
  | "transport-stations"
  | "security"
  | "commerce"
  | "green-spaces"
  | "air"
  | "noise";

/** One end of a compared metric, already positioned on its own scale. */
export interface NearbyCityComparisonMarker {
  value?: number;
  /** Formatted value, never empty: falls back to the missing-value dash. */
  text: string;
  /** Position on the row scale, 0 to 1. */
  position: number;
  loading: boolean;
  missing: boolean;
}

export interface NearbyCityComparisonScale {
  /** True when the metric is bounded (for example a score out of ten). */
  bounded: boolean;
  domainMax: number;
  current: NearbyCityComparisonMarker;
  target: NearbyCityComparisonMarker;
}

/** Where a value sits on a row scale, guarded against empty or flat domains. */
export function nearbyCityComparisonPosition(
  value: number | undefined,
  domainMax: number,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(domainMax) || domainMax <= 0) {
    return undefined;
  }
  return Math.min(1, Math.max(0, value / domainMax));
}

/**
 * Build the visual scale of one row. Bounded metrics keep their real scale so a
 * 5,6/10 always reads as a mid-scale value; open ended counts are framed by the
 * two compared values, which is the only honest scale for a single row.
 */
export function nearbyCityComparisonScale(
  metric: Pick<
    NearbyCityComparisonMetric,
    "currentNumeric" | "targetNumeric" | "currentValue" | "targetValue" | "currentLoading" | "targetLoading" | "scaleMax"
  >,
): NearbyCityComparisonScale {
  const currentValue = typeof metric.currentNumeric === "number" && Number.isFinite(metric.currentNumeric)
    ? metric.currentNumeric
    : undefined;
  const targetValue = typeof metric.targetNumeric === "number" && Number.isFinite(metric.targetNumeric)
    ? metric.targetNumeric
    : undefined;
  const bounded = typeof metric.scaleMax === "number" && Number.isFinite(metric.scaleMax) && metric.scaleMax > 0;
  const highest = Math.max(currentValue ?? 0, targetValue ?? 0);
  const domainMax = bounded ? metric.scaleMax! : highest * 1.12;
  const marker = (
    value: number | undefined,
    text: string,
    loading: boolean | undefined,
  ): NearbyCityComparisonMarker => ({
    value,
    text,
    position: nearbyCityComparisonPosition(value, domainMax) ?? 0,
    loading: Boolean(loading),
    missing: value === undefined,
  });
  return {
    bounded,
    domainMax,
    current: marker(currentValue, metric.currentValue, metric.currentLoading),
    target: marker(targetValue, metric.targetValue, metric.targetLoading),
  };
}

export interface NearbyCityComparisonDetail {
  current: NearbyCityComparisonDetailZone;
  target: NearbyCityComparisonDetailZone;
  /** One row per transport network, covering both compared cities. */
  networks: readonly NearbyCityComparisonNetworkRow[];
}

/** A rail-like network: each line keeps its own badge. */
export interface NearbyCityComparisonNetworkRow {
  mode: string;
  /** Aggregated networks such as bus and Noctilien show a count instead. */
  aggregated: boolean;
  current: NearbyCityComparisonNetworkLines;
  target: NearbyCityComparisonNetworkLines;
}

export interface NearbyCityComparisonNetworkLines {
  count: number;
  lines: readonly NearbyCityComparisonLineIcon[];
  labels: readonly string[];
}

export interface NearbyCityComparisonDetailZone {
  loading?: boolean;
  count: number;
  groups: readonly NearbyCityComparisonDetailGroup[];
}

export interface NearbyCityComparisonDetailGroup {
  /** Raw transport mode, also used to resolve the localized mode label. */
  mode: string;
  /** Total number of lines for this mode, always defined. */
  count: number;
  /** Readable labels, used when a mode has no badge icon. */
  labels: readonly string[];
  /** Icon-ready lines, rendered through the shared line badge component. */
  icons: readonly NearbyCityComparisonLineIcon[];
}

/** Minimal line shape the comparison badge consumes. */
export interface NearbyCityComparisonLineIcon {
  id: string;
  mode: string;
  label?: string;
  code?: string;
  color?: string;
  textColor?: string;
  pictogram?: string | null;
}

export interface NearbyCityComparisonCity {
  code: string;
  name: string;
  departmentCode: string;
}

export interface NearbyCityComparisonCityOption {
  code: string;
  name: string;
  departmentCode: string;
  /** Localized department label when the IRIS artifact carries it. */
  departmentName?: string;
  population?: number;
  lat: number;
  lon: number;
}

export interface NearbyCityComparisonPlaceCounts {
  commerce?: number;
  greenSpaces?: number;
}

export interface NearbyCityOptionsSource {
  communes: readonly IrisNeighborhood[];
  statistics?: Readonly<Record<string, IrisAirNoiseStatistics>>;
  departmentNames?: Readonly<Record<string, string>>;
}

/**
 * Build the searchable Île-de-France commune list used by every city picker:
 * the catalogue comes from the IRIS communes and the reference point is the
 * average IRIS centroid, close enough to the commune centre for a station
 * radius search.
 */
export function buildNearbyCityOptions(options: NearbyCityOptionsSource): NearbyCityComparisonCityOption[] {
  const groups = new Map<string, { name: string; departmentCode: string; lon: number; lat: number; count: number }>();
  for (const commune of options.communes) {
    if (!commune.communeCode) continue;
    const lon = commune.centroid?.[0];
    const lat = commune.centroid?.[1];
    if (typeof lon !== "number" || !Number.isFinite(lon) || typeof lat !== "number" || !Number.isFinite(lat)) continue;
    const current = groups.get(commune.communeCode);
    if (current) {
      current.lon += lon;
      current.lat += lat;
      current.count += 1;
      continue;
    }
    groups.set(commune.communeCode, {
      name: commune.communeName,
      departmentCode: commune.departmentCode,
      lon,
      lat,
      count: 1,
    });
  }

  return [...groups.entries()]
    .map(([code, group]) => {
      const statistics = options.statistics?.[code];
      const departmentName = options.departmentNames?.[group.departmentCode];
      const population = statistics?.population;
      return {
        code,
        name: statistics?.name || group.name,
        departmentCode: group.departmentCode,
        ...(departmentName ? { departmentName } : {}),
        ...(typeof population === "number" && Number.isFinite(population) ? { population } : {}),
        lat: group.lat / group.count,
        lon: group.lon / group.count,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "fr-FR") || left.code.localeCompare(right.code));
}

/** Normalize a count against a commune population without inventing a value. */
export function perThousandInhabitants(
  count: number | undefined,
  population: number | undefined,
): number | undefined {
  if (!Number.isFinite(count) || !Number.isFinite(population) || population! <= 0) return undefined;
  return (count! / population!) * 1_000;
}

export function compareNearbyCityMetric(
  current: number | undefined,
  target: number | undefined,
  higherIsBetter = true,
): NearbyCityComparisonTone {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return "unavailable";
  if (current === target) return "equal";
  const targetIsHigher = target! > current!;
  return targetIsHigher === higherIsBetter ? "better" : "worse";
}

export function nearbyCityComparisonTone(metric: Pick<NearbyCityComparisonMetric, "currentNumeric" | "targetNumeric" | "higherIsBetter">): NearbyCityComparisonTone {
  return compareNearbyCityMetric(metric.currentNumeric, metric.targetNumeric, metric.higherIsBetter ?? true);
}

/** Transport shapes required to assemble the expandable line breakdown. */
export interface NearbyCityComparisonLineSource {
  id: string;
  mode: string;
  aliases?: readonly string[];
  code?: string;
  label?: string;
}

export interface NearbyCityComparisonStationSource {
  lineIds: readonly string[];
  lines: readonly NearbyCityComparisonLineSource[];
}

export interface NearbyCityComparisonLineDetail {
  /** Every unique line serving the scope, sorted by mode then id. */
  lines: readonly NearbyCityComparisonLineSource[];
  /** The same lines grouped by transport mode, in network order. */
  groups: readonly {
    mode: string;
    lines: readonly NearbyCityComparisonLineSource[];
  }[];
}

/**
 * Collect every line reachable in a commune scope. A line serving several
 * stations or neighborhoods must appear once, so ids are deduplicated before
 * the mode groups are built. Every mode keeps its own group: bus and Noctilien
 * never merge, and rail modes stay individually readable.
 */
export function nearbyCityComparisonLineDetail(
  stations: readonly NearbyCityComparisonStationSource[],
): NearbyCityComparisonLineDetail {
  const linesById = new Map<string, NearbyCityComparisonLineSource>();
  for (const station of stations) {
    for (const line of station.lines) {
      if (!station.lineIds.includes(line.id) || linesById.has(line.id)) continue;
      linesById.set(line.id, line);
    }
  }
  const lines = [...linesById.values()].sort((left, right) =>
    transportModeOrder(left.mode) - transportModeOrder(right.mode)
    || comparisonLineSortKey(left).localeCompare(comparisonLineSortKey(right), "fr-FR", { numeric: true, sensitivity: "base" }));
  const groups: { mode: string; lines: NearbyCityComparisonLineSource[] }[] = [];
  for (const line of lines) {
    const group = groups.find((candidate) => candidate.mode === line.mode);
    if (group) group.lines.push(line);
    else groups.push({ mode: line.mode, lines: [line] });
  }
  return { lines, groups };
}

/** Network reading order: rail first, then the dense surface networks. */
const TRANSPORT_MODE_ORDER = [
  "METRO",
  "RER",
  "TRAIN",
  "TRANSILIEN",
  "TRAM",
  "CABLE",
  "BUS",
  "NOCTILIEN",
] as const;

function transportModeOrder(mode: string): number {
  const index = (TRANSPORT_MODE_ORDER as readonly string[]).indexOf(mode);
  return index === -1 ? TRANSPORT_MODE_ORDER.length : index;
}

function comparisonLineSortKey(line: NearbyCityComparisonLineSource): string {
  return line.code?.trim() || line.label?.trim() || line.id;
}


/**
 * Fall back to a readable line code when the source line carries no label.
 * Handles both `C01234` style ids and `IDFM:...:C01234` references.
 */
export function nearbyCityComparisonLineCode(line: NearbyCityComparisonLineSource): string | undefined {
  for (const candidate of [line.label, line.code, ...(line.aliases ?? []), line.id]) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const prefixed = candidate.match(/[A-Za-z]{1,4}\d{3,5}/u);
    if (prefixed) return prefixed[0]!.toUpperCase();
    if (candidate.trim().length <= 4) return candidate.trim().toUpperCase();
  }
  return undefined;
}

export function nearbyCityComparisonLineLabel(line: NearbyCityComparisonLineSource): string {
  const label = typeof line.label === "string" ? line.label.trim() : "";
  if (label) return label;
  const code = typeof line.code === "string" ? line.code.trim() : "";
  if (code) return code;
  return nearbyCityComparisonLineCode(line) ?? line.id;
}


