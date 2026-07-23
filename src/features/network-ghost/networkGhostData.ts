import {
  filterDuplicateBusTransfers,
  isBusLikeTransfer,
} from "../service-pattern/transferVisibility";
import type { TransferLineOption } from "../../types/transit";
import { createLinePresentation } from "../../services/linePresentation";
import { selectRepresentativeStopSequencePatterns } from "../line-map/topologyPatterns";
import { toServerApiUrl } from "../../services/serverApi";
import {
  projectTransitCoordinate,
  resolveTransitLonLat,
  type GeographicViewport,
} from "./geoProjection";
import type {
  GhostNetworkModeKey,
  GhostNetworkModeVisibility,
  GhostNetworkScope,
  NetworkGhostAnchor,
  NetworkGhostLineView,
  NetworkGhostQuayView,
  NetworkGhostTopology,
  NetworkGhostTopologySegment,
  NetworkGhostTopologyStation,
} from "./types";

const NEARBY_ANCHOR_DISTANCE_METERS = 650;
const EARTH_RADIUS_METERS = 6_371_000;
const topologyCache = new Map<string, Promise<NetworkGhostTopology>>();

export function filterNetworkGhostTransfers(
  transfers: TransferLineOption[],
  scope: GhostNetworkScope,
): TransferLineOption[] {
  const deduplicated = filterDuplicateBusTransfers(transfers);
  const filtered =
    scope === "structural"
      ? deduplicated.filter((transfer) => !isBusLikeTransfer(transfer))
      : deduplicated;

  return [...filtered].sort(
    (left, right) =>
      Number(isBusLikeTransfer(left)) - Number(isBusLikeTransfer(right)) ||
      left.label.localeCompare(right.label, "fr", { numeric: true }),
  );
}

export function filterNetworkGhostTransfersByModes(
  transfers: TransferLineOption[],
  visibility: GhostNetworkModeVisibility,
): TransferLineOption[] {
  return transfers.filter((transfer) => {
    const mode = getNetworkGhostModeKey(transfer);

    return mode ? visibility[mode] : true;
  });
}

export function getNetworkGhostModeKey(
  transfer: TransferLineOption,
): GhostNetworkModeKey | undefined {
  if (isNoctilienTransfer(transfer)) {
    return "noctilien";
  }

  if (transfer.family === "BUS") {
    return "bus";
  }

  if (transfer.family === "METRO") {
    return "metro";
  }

  if (transfer.family === "TRAM") {
    return "tram";
  }

  if (transfer.family === "RER") {
    return "rer";
  }

  if (transfer.family === "TRANSILIEN") {
    return "transilien";
  }

  const mode = normalizeStationName(transfer.mode ?? "");

  if (mode.includes("noctilien")) {
    return "noctilien";
  }

  if (mode.includes("bus")) {
    return "bus";
  }

  if (mode.includes("metro")) {
    return "metro";
  }

  if (mode.includes("tram")) {
    return "tram";
  }

  if (mode.includes("rer")) {
    return "rer";
  }

  if (mode.includes("train") || mode.includes("rail") || mode.includes("transilien")) {
    return "transilien";
  }

  return undefined;
}

function isNoctilienTransfer(transfer: TransferLineOption): boolean {
  if (transfer.family === "NOCTILIEN") {
    return true;
  }

  const identity = [
    transfer.mode,
    transfer.ref,
    transfer.id,
    transfer.iconUrl,
    ...(transfer.iconUrls ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeStationName)
    .join(" ");

  if (identity.includes("noctilien")) {
    return true;
  }

  const compactLabel = normalizeStationName(transfer.label).replace(/[\s_-]+/gu, "");

  return /^n\d{1,3}[a-z]?$/u.test(compactLabel);
}

export function loadNetworkGhostTopology(
  lineId: string,
  signal?: AbortSignal,
): Promise<NetworkGhostTopology> {
  const cached = topologyCache.get(lineId);

  if (cached) {
    return raceWithAbort(cached, signal);
  }

  const request = fetch(toServerApiUrl(`/api/lines/${encodeURIComponent(lineId)}/topology`), {
    signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as NetworkGhostTopology;
    })
    .catch((error) => {
      topologyCache.delete(lineId);
      throw error;
    });

  topologyCache.set(lineId, request);

  return raceWithAbort(request, signal);
}

export function clearNetworkGhostTopologyCache(): void {
  topologyCache.clear();
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(createAbortError());
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

export function createNetworkGhostLine(
  transfer: TransferLineOption,
  topology: NetworkGhostTopology,
  anchor: NetworkGhostAnchor,
  viewport: GeographicViewport,
  loadOrder: number,
): NetworkGhostLineView | undefined {
  const anchorStation = findAnchorStation(topology.stations, anchor);

  if (!anchorStation) {
    return undefined;
  }

  const projectedStations = topology.stations.flatMap((station) => {
    const point = projectTransitCoordinate(station, viewport);
    const lonLat = resolveTransitLonLat(station);

    return point && lonLat
      ? [
          {
            id: station.id,
            label: station.name,
            lon: lonLat.lon,
            lat: lonLat.lat,
            x: point.x,
            y: point.y,
          },
        ]
      : [];
  });
  const projectedStationById = new Map(projectedStations.map((station) => [station.id, station]));
  const branches = selectRepresentativeStopSequencePatterns(
    topology.patterns ?? [],
  ).map((pattern) => ({
    id: pattern.id,
    stopIds: pattern.stops,
  }));
  const topologySegments = getTopologySegments(topology, branches);
  const levels = createStationLevels(
    topology.stations.map((station) => station.id),
    topologySegments,
    anchorStation.id,
  );
  const segments = topologySegments.flatMap((segment) => {
    const from = projectedStationById.get(segment.from);
    const to = projectedStationById.get(segment.to);

    if (!from || !to) {
      return [];
    }

    const fromLevel = levels.get(from.id) ?? Number.MAX_SAFE_INTEGER;
    const toLevel = levels.get(to.id) ?? Number.MAX_SAFE_INTEGER;
    const reverse =
      toLevel < fromLevel || (toLevel === fromLevel && to.id.localeCompare(from.id) < 0);
    const source = reverse ? to : from;
    const target = reverse ? from : to;

    return [
      {
        id: segment.id,
        fromStationId: source.id,
        toStationId: target.id,
        fromX: source.x,
        fromY: source.y,
        toX: target.x,
        toY: target.y,
        level: Math.min(fromLevel, toLevel),
      },
    ];
  });
  const projectedAnchor = projectedStationById.get(anchorStation.id);

  if (!projectedAnchor || segments.length === 0) {
    return undefined;
  }

  const presentation = createLinePresentation({
    color: transfer.color,
    family: transfer.family,
    id: transfer.id,
    mode: transfer.mode,
    ref: transfer.ref,
    shortName: transfer.label,
    textColor: transfer.textColor,
  });
  const iconUrls = Array.from(
    new Set([...(transfer.iconUrls ?? []), ...(presentation.iconUrls ?? [])]),
  );

  return {
    id: transfer.id,
    label: transfer.label,
    mode: transfer.mode ?? transfer.family ?? topology.line?.mode ?? "Ligne",
    family: transfer.family,
    ref: transfer.ref,
    color: normalizeColor(transfer.color ?? presentation.color, "#475569"),
    textColor: normalizeColor(transfer.textColor ?? presentation.textColor, "#ffffff"),
    iconUrl: transfer.iconUrl ?? iconUrls[0],
    iconUrls,
    isBus: isBusLikeTransfer(transfer),
    anchorStationId: anchorStation.id,
    anchorX: projectedAnchor.x,
    anchorY: projectedAnchor.y,
    stations: projectedStations,
    branches,
    segments,
    geometrySource: "direct",
    geometryAttempts: [{ source: "direct", status: "success" }],
    entrances: [],
    loadOrder,
  };
}

export function projectNetworkGhostQuays(
  anchor: NetworkGhostAnchor | undefined,
  viewport: GeographicViewport | undefined,
): NetworkGhostQuayView[] {
  if (!anchor || !viewport) {
    return [];
  }

  const byCoordinate = new Map<string, NetworkGhostQuayView>();

  for (const quay of anchor.quays ?? []) {
    const point = projectTransitCoordinate(quay, viewport);

    if (!point) {
      continue;
    }

    const coordinateKey = `${point.x.toFixed(7)}:${point.y.toFixed(7)}`;

    if (!byCoordinate.has(coordinateKey)) {
      byCoordinate.set(coordinateKey, {
        id: quay.id,
        label: quay.name,
        x: point.x,
        y: point.y,
      });
    }
  }

  return Array.from(byCoordinate.values());
}

function findAnchorStation(
  stations: NetworkGhostTopologyStation[],
  anchor: NetworkGhostAnchor,
): NetworkGhostTopologyStation | undefined {
  const nameMatches = stations.filter((station) =>
    isSameNetworkGhostStationName(station.name, anchor.label),
  );

  if (nameMatches.length === 1) {
    return nameMatches[0];
  }

  const anchorLonLat = resolveTransitLonLat(anchor);

  if (!anchorLonLat) {
    return nameMatches[0];
  }

  const candidates = (nameMatches.length > 0 ? nameMatches : stations)
    .flatMap((station) => {
      const stationLonLat = resolveTransitLonLat(station);

      return stationLonLat
        ? [
            {
              station,
              distance: getDistanceMeters(anchorLonLat, stationLonLat),
            },
          ]
        : [];
    })
    .sort((left, right) => left.distance - right.distance);

  return candidates[0]?.distance <= NEARBY_ANCHOR_DISTANCE_METERS
    ? candidates[0].station
    : undefined;
}

export function isSameNetworkGhostStationName(left: string, right: string): boolean {
  const leftKeys = createStationMatchKeys(left);
  const rightKeys = createStationMatchKeys(right);
  if (Array.from(rightKeys).some((key) => leftKeys.has(key))) return true;

  return (
    getCompoundStationNameSegments(left).some((segment) =>
      Array.from(createStationMatchKeys(segment)).some((key) => rightKeys.has(key)),
    ) ||
    getCompoundStationNameSegments(right).some((segment) =>
      Array.from(createStationMatchKeys(segment)).some((key) => leftKeys.has(key)),
    )
  );
}

function getCompoundStationNameSegments(value: string): string[] {
  const segments = value
    .split(/\s+(?:[-–—&+])\s+|\s*\/\s*/gu)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length > 1 ? segments : [];
}

function getTopologySegments(
  topology: NetworkGhostTopology,
  branches: Array<{ id: string; stopIds: string[] }>,
): NetworkGhostTopologySegment[] {
  const segments = new Map<string, NetworkGhostTopologySegment>();

  for (const branch of branches) {
    branch.stopIds.slice(0, -1).forEach((from, index) => {
      const to = branch.stopIds[index + 1];
      const id = [from, to].sort().join("__");

      if (from !== to && !segments.has(id)) {
        segments.set(id, { id, from, to });
      }
    });
  }

  return segments.size > 0 ? Array.from(segments.values()) : (topology.segments ?? []);
}

function createStationLevels(
  stationIds: string[],
  segments: NetworkGhostTopologySegment[],
  anchorStationId: string,
): Map<string, number> {
  const neighbors = new Map(stationIds.map((stationId) => [stationId, new Set<string>()]));

  for (const segment of segments) {
    neighbors.get(segment.from)?.add(segment.to);
    neighbors.get(segment.to)?.add(segment.from);
  }

  const levels = new Map<string, number>([[anchorStationId, 0]]);
  const queue = [anchorStationId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const nextLevel = (levels.get(current) ?? 0) + 1;

    for (const neighbor of neighbors.get(current) ?? []) {
      if (levels.has(neighbor)) {
        continue;
      }

      levels.set(neighbor, nextLevel);
      queue.push(neighbor);
    }
  }

  return levels;
}

function createStationMatchKeys(value: string): Set<string> {
  const normalized = normalizeStationName(value);

  return new Set(
    [
      normalized,
      normalized.replace(/\b(?:gare|station|metro|rer|tram)\b/gu, " "),
      normalized.replace(/^(?:la|le|les|l)\s+/u, ""),
    ]
      .map((key) => key.replace(/\s+/gu, " ").trim())
      .filter(Boolean),
  );
}

function normalizeStationName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/gu, " ")
    .replace(/[^a-z0-9]+/giu, " ")
    .toLowerCase()
    .trim();
}

function getDistanceMeters(
  left: { lon: number; lat: number },
  right: { lon: number; lat: number },
): number {
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(right.lon - left.lon);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function normalizeColor(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  return value.startsWith("#") ? value : `#${value}`;
}
