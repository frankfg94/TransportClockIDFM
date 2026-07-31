import type { TrafficDisruption } from "../../traffic/types";
import type { PatternTrafficImpactKind } from "../trafficImpactAnalysis";

export interface InfoCardDebugPoint {
  x: number;
  y: number;
}

export interface InfoCardDebugRect extends InfoCardDebugPoint {
  width: number;
  height: number;
}

export interface InfoCardDebugEdge {
  edgeKey: string;
  source: string;
  target: string;
  sourcePoint: InfoCardDebugPoint;
  targetPoint: InfoCardDebugPoint;
}

export type InfoCardDebugObstacleType =
  | "station"
  | "station-title"
  | "city-title"
  | "transfer"
  | "walking"
  | "traffic-marker"
  | string;

export interface InfoCardDebugObstacle {
  id: string;
  type: InfoCardDebugObstacleType;
  rect: InfoCardDebugRect;
  domRect?: InfoCardDebugRect;
  markerId?: string;
}

export interface InfoCardDebugMarker {
  markerId: string;
  groupId: string;
  kind: PatternTrafficImpactKind;
  replacementBus: boolean;
  segmentIds: string[];
  stationKeys: string[];
  edgeKeys: string[];
  text: {
    statusLabel?: string;
    detailLabel?: string;
    restartTimeLabel?: string;
    endDateLabel?: string;
  };
  disruption: TrafficDisruption;
  anchor: InfoCardDebugPoint;
  card: InfoCardDebugRect;
  placement: "above" | "below";
  connector: {
    height: number;
    length: number;
    offset: number;
    angle: number;
  };
  segmentEdges: InfoCardDebugEdge[];
  domCard?: InfoCardDebugRect;
  domConnector?: InfoCardDebugRect;
}

export interface InfoCardDebugSnapshot {
  markers: InfoCardDebugMarker[];
  obstacles: InfoCardDebugObstacle[];
}

export interface InfoCardIntersectionReport {
  vertical: boolean;
  cardCenteredOnAnchor: boolean;
  connectorTouchesCard: boolean;
  anchorOnImpactedSegment: boolean;
  connectorTouchesSegment: boolean;
  segmentCheckSkipped: boolean;
  connectorStart: InfoCardDebugPoint;
  connectorEndpoint: InfoCardDebugPoint;
  segmentContact?: {
    edgeKey: string;
    point: InfoCardDebugPoint;
    distance: number;
  };
  ok: boolean;
}

export interface InfoCardOverflowReport {
  hasOverflow: boolean;
  collisions: Array<{
    id: string;
    type: InfoCardDebugObstacleType;
    rect: InfoCardDebugRect;
  }>;
  ok: boolean;
}

export interface InfoCardInfo {
  markerId: string;
  groupId: string;
  kind: PatternTrafficImpactKind;
  segmentIds: string[];
  stationKeys: string[];
  edgeKeys: string[];
  replacementBus: boolean;
  text: InfoCardDebugMarker["text"];
  disruption: TrafficDisruption;
  position: InfoCardDebugRect & { dom?: InfoCardDebugRect };
  anchor: InfoCardDebugPoint;
  placement: "above" | "below";
  connector: InfoCardDebugMarker["connector"] & {
    start: InfoCardDebugPoint;
    endpoint: InfoCardDebugPoint;
    dom?: InfoCardDebugRect;
  };
  intersection: InfoCardIntersectionReport;
  overflow: InfoCardOverflowReport;
  duplicate: InfoCardDuplicateEvidence;
  valid: boolean;
}

export interface InfoCardDuplicateEvidence {
  isDuplicate: boolean;
  sameText: boolean;
  sameEndDate: boolean;
  sameStations: boolean;
  markerIds: string[];
}

export interface InfoCardDuplicateGroup {
  key: string;
  count: number;
  markerIds: string[];
  segmentIds: string[];
  stationKeys: string[];
  edgeKeys: string[];
  text: InfoCardInfo["text"];
  criteria: {
    sameText: true;
    sameEndDate: true;
    sameStations: true;
  };
}

export interface InfoCardDuplicateReport {
  hasDuplicates: boolean;
  duplicateCount: number;
  duplicates: InfoCardDuplicateGroup[];
}

export interface DeparturePatternModalInfoCardsDebugTools {
  getInfoCardInfos(): InfoCardInfo[];
  checkDuplicateInfoCards(): InfoCardDuplicateReport;
}

interface InfoCardIdentity {
  kind: PatternTrafficImpactKind;
  replacementBus: boolean;
  textKey: string;
  endDateKey: string;
  stationKey: string;
}

export function getInfoCardInfos(
  snapshot: InfoCardDebugSnapshot,
): InfoCardInfo[] {
  const infos = snapshot.markers.map((marker) => {
    const card = marker.card;
    const connectorX = card.x + card.width / 2 + marker.connector.offset;
    const connectorStart = {
      x: connectorX,
      y: marker.placement === "above" ? card.y + card.height : card.y,
    };
    const connectorEndpoint = {
      x: connectorX,
      y:
        marker.placement === "above"
          ? connectorStart.y + marker.connector.height
          : connectorStart.y - marker.connector.height,
    };
    const nearestAnchor = findNearestSegmentPoint(
      marker.anchor,
      marker.segmentEdges,
    );
    const nearestEndpoint = findNearestSegmentPoint(
      connectorEndpoint,
      marker.segmentEdges,
    );
    const intersection: InfoCardIntersectionReport = {
      vertical:
        Math.abs(marker.connector.offset) <= GEOMETRY_TOLERANCE &&
        Math.abs(Math.abs(marker.connector.angle) - 90) <=
          GEOMETRY_TOLERANCE,
      cardCenteredOnAnchor:
        Math.abs(card.x + card.width / 2 - marker.anchor.x) <=
          GEOMETRY_TOLERANCE,
      connectorTouchesCard:
        Math.abs(connectorStart.x - (card.x + card.width / 2)) <=
          GEOMETRY_TOLERANCE &&
        Math.abs(
          connectorStart.y -
            (marker.placement === "above" ? card.y + card.height : card.y),
        ) <= GEOMETRY_TOLERANCE,
      anchorOnImpactedSegment: Boolean(nearestAnchor),
      connectorTouchesSegment: Boolean(nearestEndpoint),
      segmentCheckSkipped: marker.segmentEdges.length === 0,
      connectorStart,
      connectorEndpoint,
      segmentContact: nearestEndpoint
        ? {
            edgeKey: nearestEndpoint.edgeKey,
            point: nearestEndpoint.point,
            distance: nearestEndpoint.distance,
          }
        : undefined,
      ok: false,
    };
    intersection.ok =
      intersection.vertical &&
      intersection.cardCenteredOnAnchor &&
      intersection.connectorTouchesCard &&
      (intersection.segmentCheckSkipped ||
        (intersection.anchorOnImpactedSegment &&
          intersection.connectorTouchesSegment));

    const collisions = snapshot.obstacles.flatMap((obstacle) => {
      if (
        obstacle.markerId === marker.markerId ||
        obstacle.id === marker.markerId
      ) {
        return [];
      }

      const obstacleRect = marker.domCard ? obstacle.domRect : obstacle.rect;
      const cardRect = marker.domCard ?? card;
      if (!obstacleRect || !rectanglesOverlap(cardRect, obstacleRect)) {
        return [];
      }

      return [
        {
          id: obstacle.id,
          type: obstacle.type,
          rect: obstacleRect,
        },
      ];
    });
    const overflow: InfoCardOverflowReport = {
      hasOverflow: collisions.length > 0,
      collisions,
      ok: collisions.length === 0,
    };

    return {
      markerId: marker.markerId,
      groupId: marker.groupId,
      kind: marker.kind,
      segmentIds: marker.segmentIds,
      stationKeys: marker.stationKeys,
      edgeKeys: marker.edgeKeys,
      replacementBus: marker.replacementBus,
      text: marker.text,
      disruption: marker.disruption,
      position: {
        ...card,
        ...(marker.domCard ? { dom: marker.domCard } : {}),
      },
      anchor: marker.anchor,
      placement: marker.placement,
      connector: {
        ...marker.connector,
        start: connectorStart,
        endpoint: connectorEndpoint,
        ...(marker.domConnector ? { dom: marker.domConnector } : {}),
      },
      intersection,
      overflow,
      duplicate: {
        isDuplicate: false,
        sameText: false,
        sameEndDate: false,
        sameStations: false,
        markerIds: [],
      },
      valid: intersection.ok && overflow.ok,
    };
  });

  return annotateDuplicateInfoCards(infos);
}

export function checkDuplicateInfoCards(
  infos: InfoCardInfo[],
): InfoCardDuplicateReport {
  const groups = new Map<string, InfoCardInfo[]>();

  infos.forEach((info) => {
    const identity = getInfoCardIdentity(info);
    if (!identity.textKey || !identity.endDateKey || !identity.stationKey) {
      return;
    }

    const key = [
      identity.kind,
      identity.replacementBus,
      identity.textKey,
      identity.endDateKey,
      identity.stationKey,
    ].join("\u001e");
    groups.set(key, [...(groups.get(key) ?? []), info]);
  });

  const duplicates: InfoCardDuplicateGroup[] = [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      count: group.length,
      markerIds: group.map((info) => info.markerId),
      segmentIds: [...new Set(group.flatMap((info) => info.segmentIds))],
      stationKeys: [...new Set(group.flatMap(getInfoCardStationKeys))],
      edgeKeys: [...new Set(group.flatMap((info) => info.edgeKeys))],
      text: group[0]!.text,
      criteria: {
        sameText: true,
        sameEndDate: true,
        sameStations: true,
      },
    }));

  return {
    hasDuplicates: duplicates.length > 0,
    duplicateCount: duplicates.reduce(
      (count, duplicate) => count + duplicate.count - 1,
      0,
    ),
    duplicates,
  };
}

function annotateDuplicateInfoCards(infos: InfoCardInfo[]): InfoCardInfo[] {
  const report = checkDuplicateInfoCards(infos);
  const duplicateByMarkerId = new Map<string, InfoCardDuplicateEvidence>();

  report.duplicates.forEach((duplicate) => {
    duplicate.markerIds.forEach((markerId) => {
      duplicateByMarkerId.set(markerId, {
        isDuplicate: true,
        sameText: duplicate.criteria.sameText,
        sameEndDate: duplicate.criteria.sameEndDate,
        sameStations: duplicate.criteria.sameStations,
        markerIds: duplicate.markerIds.filter((id) => id !== markerId),
      });
    });
  });

  return infos.map((info) => ({
    ...info,
    duplicate:
      duplicateByMarkerId.get(info.markerId) ?? {
        isDuplicate: false,
        sameText: false,
        sameEndDate: false,
        sameStations: false,
        markerIds: [],
      },
  }));
}

function getInfoCardIdentity(info: InfoCardInfo): InfoCardIdentity {
  return {
    kind: info.kind,
    replacementBus: info.replacementBus,
    textKey: [
      normalizeDebugText(info.text.statusLabel),
      normalizeDebugText(info.text.detailLabel),
    ].join("\u001f"),
    endDateKey: normalizeDebugText(info.text.endDateLabel),
    stationKey: getInfoCardStationKeys(info).join("\u001f"),
  };
}

function getInfoCardStationKeys(info: InfoCardInfo): string[] {
  const stationKeys = new Set(info.stationKeys);
  info.edgeKeys.forEach((edgeKey) => {
    const [source, target] = edgeKey.split("--");
    if (source) stationKeys.add(source);
    if (target) stationKeys.add(target);
  });
  return [...stationKeys].sort();
}

export function createDeparturePatternModalInfoCardsDebugTools(
  readSnapshot: () => InfoCardDebugSnapshot | undefined,
): DeparturePatternModalInfoCardsDebugTools {
  const readInfos = () => getInfoCardInfos(readSnapshot() ?? EMPTY_SNAPSHOT);

  return {
    getInfoCardInfos: readInfos,
    checkDuplicateInfoCards: () => checkDuplicateInfoCards(readInfos()),
  };
}

declare global {
  interface Window {
    __departurePatternModalInfoCardsDebugTools?: DeparturePatternModalInfoCardsDebugTools;
    /** @deprecated Use __departurePatternModalInfoCardsDebugTools. */
    __departurePatternModalDebugTools?: DeparturePatternModalInfoCardsDebugTools;
  }
}

const EMPTY_SNAPSHOT: InfoCardDebugSnapshot = {
  markers: [],
  obstacles: [],
};
const GEOMETRY_TOLERANCE = 2;

function findNearestSegmentPoint(
  point: InfoCardDebugPoint,
  edges: InfoCardDebugEdge[],
):
  | {
      edgeKey: string;
      point: InfoCardDebugPoint;
      distance: number;
    }
  | undefined {
  let nearest:
    | {
        edgeKey: string;
        point: InfoCardDebugPoint;
        distance: number;
      }
    | undefined;

  edges.forEach((edge) => {
    const candidate = projectPointToSegment(
      point,
      edge.sourcePoint,
      edge.targetPoint,
    );
    if (candidate.distance > GEOMETRY_TOLERANCE) return;
    if (!nearest || candidate.distance < nearest.distance) {
      nearest = { edgeKey: edge.edgeKey, ...candidate };
    }
  });

  return nearest;
}

function projectPointToSegment(
  point: InfoCardDebugPoint,
  source: InfoCardDebugPoint,
  target: InfoCardDebugPoint,
): { point: InfoCardDebugPoint; distance: number } {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((point.x - source.x) * dx + (point.y - source.y) * dy) /
              lengthSquared,
          ),
        );
  const projected = {
    x: source.x + ratio * dx,
    y: source.y + ratio * dy,
  };

  return {
    point: projected,
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
  };
}

function rectanglesOverlap(
  left: InfoCardDebugRect,
  right: InfoCardDebugRect,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function normalizeDebugText(value?: string): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}
