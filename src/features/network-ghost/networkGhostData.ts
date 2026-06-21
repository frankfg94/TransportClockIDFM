import { isBusLikeTransfer } from "../service-pattern/transferVisibility";
import type { TransferLineOption } from "../../types/transit";
import { createLinePresentation } from "../../services/linePresentation";
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
  const filtered =
    scope === "structural"
      ? transfers.filter((transfer) => !isBusLikeTransfer(transfer))
      : transfers;

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

  const compactLabel = normalizeStationName(transfer.label).replace(
    /[\s_-]+/gu,
    "",
  );

  return /^n\d{1,3}[a-z]?$/u.test(compactLabel);
}

export function loadNetworkGhostTopology(
  lineId: string,
): Promise<NetworkGhostTopology> {
  const cached = topologyCache.get(lineId);

  if (cached) {
    return cached;
  }

  const request = fetch(
    toServerApiUrl(`/api/lines/${encodeURIComponent(lineId)}/topology`),
  )
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

  return request;
}

export function clearNetworkGhostTopologyCache(): void {
  topologyCache.clear();
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

    return point
      ? [
          {
            id: station.id,
            label: station.name,
            x: point.x,
            y: point.y,
          },
        ]
      : [];
  });
  const projectedStationById = new Map(
    projectedStations.map((station) => [station.id, station]),
  );
  const topologySegments = getTopologySegments(topology);
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
      toLevel < fromLevel ||
      (toLevel === fromLevel && to.id.localeCompare(from.id) < 0);
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
    new Set([
      ...(transfer.iconUrls ?? []),
      ...(presentation.iconUrls ?? []),
    ]),
  );

  return {
    id: transfer.id,
    label: transfer.label,
    mode: transfer.mode ?? transfer.family ?? topology.line?.mode ?? "Ligne",
    family: transfer.family,
    ref: transfer.ref,
    color: normalizeColor(transfer.color ?? presentation.color, "#475569"),
    textColor: normalizeColor(
      transfer.textColor ?? presentation.textColor,
      "#ffffff",
    ),
    iconUrl: transfer.iconUrl ?? iconUrls[0],
    iconUrls,
    isBus: isBusLikeTransfer(transfer),
    anchorStationId: anchorStation.id,
    anchorX: projectedAnchor.x,
    anchorY: projectedAnchor.y,
    stations: projectedStations,
    segments,
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
  const anchorKeys = createStationMatchKeys(anchor.label);
  const nameMatches = stations.filter((station) =>
    Array.from(createStationMatchKeys(station.name)).some((key) =>
      anchorKeys.has(key),
    ),
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

function getTopologySegments(
  topology: NetworkGhostTopology,
): NetworkGhostTopologySegment[] {
  if (topology.segments?.length) {
    return topology.segments;
  }

  const segments = new Map<string, NetworkGhostTopologySegment>();

  for (const pattern of topology.patterns ?? []) {
    pattern.stops.slice(0, -1).forEach((from, index) => {
      const to = pattern.stops[index + 1];
      const id = [from, to].sort().join("__");

      if (from !== to && !segments.has(id)) {
        segments.set(id, { id, from, to });
      }
    });
  }

  return Array.from(segments.values());
}

function createStationLevels(
  stationIds: string[],
  segments: NetworkGhostTopologySegment[],
  anchorStationId: string,
): Map<string, number> {
  const neighbors = new Map(
    stationIds.map((stationId) => [stationId, new Set<string>()]),
  );

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
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function normalizeColor(
  value: string | undefined,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }

  return value.startsWith("#") ? value : `#${value}`;
}
