import type { LonLatPoint } from "../../transport-map/geo/coordinateKernel";
import type { NeighborhoodJourneyBenchmark } from "./contracts";
import { chooseFastestJourney, summarizeJourney } from "./journeys";
import { isNearbyJourneyTransitSection, isNearbyJourneyWaitingSection } from "../nearbyJourneyTiming";
import { createLinePresentation } from "../../../services/linePresentation";
import type { NearbyJourney, NearbyJourneySection } from "../nearbyHeavyTransports";
import type { TransportMapNetwork } from "../../transport-map/contracts/network";
import type { GlobalMapPath } from "../../transport-map/contracts/manifest";
import { clipGlobalTransportItineraryLine, resolveGlobalTransportItineraryLine } from "../../line-map/globalTransportItineraryGeometry";

export interface JourneyPreviewRun {
  token: number;
  origin: LonLatPoint;
  destinations: readonly (LonLatPoint & { id: string; label: string })[];
  benchmarks: readonly NeighborhoodJourneyBenchmark[];
}

function validPoint(point: LonLatPoint | undefined): point is LonLatPoint {
  return !!point && Number.isFinite(point.lon) && Number.isFinite(point.lat)
    && Math.abs(point.lon) <= 180 && Math.abs(point.lat) <= 90;
}

export function createPreviewTransitPathResolver(network: TransportMapNetwork, paths: readonly GlobalMapPath[]) {
  const pathsByLine = new Map<string, GlobalMapPath[]>();
  for (const path of paths) {
    if (path.geometrySource === "netex-schematic-fallback" || path.quality.fallback) continue;
    const group = pathsByLine.get(path.lineId);
    if (group) group.push(path);
    else pathsByLine.set(path.lineId, [path]);
  }
  const cache = new WeakMap<NearbyJourneySection, LonLatPoint[] | undefined>();
  return (section: NearbyJourneySection) => {
    if (section.type !== "public_transport" || !validPoint(section.fromPoint) || !validPoint(section.toPoint)) return;
    if (!cache.has(section)) {
      const line = (section.lineId && network.linesById.get(`line:${section.lineId}`)) || resolveGlobalTransportItineraryLine(section, network.lines);
      const paths = line && pathsByLine.get(line.id);
      cache.set(section, line && paths && clipGlobalTransportItineraryLine(paths, line, network.stationsById, section, section.fromPoint, section.toPoint));
    }
    return cache.get(section);
  };
}

export function journeyPreviewRow(benchmark: NeighborhoodJourneyBenchmark, selection?: NearbyJourney, transitPath?: ReturnType<typeof createPreviewTransitPathResolver>) {
  const journey = benchmark.status === "ready" ? selection ?? chooseFastestJourney(benchmark.journeys) : undefined;
  const paths: { kind: "transit" | "walk"; color: string; coordinates: LonLatPoint[] }[] = [];
  const legs = [];
  const points = new Map<string, LonLatPoint>();
  let missingSections = 0;
  for (const section of journey?.sections ?? []) {
    if (isNearbyJourneyWaitingSection(section) || section.durationSeconds <= 0) continue;
    const transit = isNearbyJourneyTransitSection(section);
    const badge = transit ? {
      ...createLinePresentation({ id: section.lineId, code: section.lineCode, mode: section.lineMode,
        color: section.lineColor, textColor: section.lineTextColor }),
      label: section.lineCode || section.lineId, mode: section.lineMode,
    } : undefined;
    if (badge) legs.push({ badge, from: section.fromName, to: section.toName });
    const shape = section.geometry?.length ? section.geometry : transitPath?.(section);
    if (shape && shape.length >= 2 && shape.every(validPoint)
      && section.walkingProvider !== "straight-line" && section.finalLineAccess?.status !== "estimated") {
      paths.push({ kind: transit ? "transit" : "walk", color: badge?.color ?? "#536579", coordinates: shape });
    } else {
      missingSections++;
      // Endpoints from GTFS are evidence of stops, never a route shape.
      for (const point of [section.fromPoint, section.toPoint]) {
        if (validPoint(point)) points.set(`${point.lat}:${point.lon}`, point);
      }
    }
  }
  const status = benchmark.status === "loading" ? "loading" : benchmark.failed ? "error" : !journey ? "unavailable"
    : !paths.length ? "missingGeometry" : missingSections ? "partialGeometry" : "ready";
  const summary = journey && summarizeJourney(journey);
  return { id: benchmark.id, label: benchmark.label, status, paths, legs, points: [...points.values()],
    selectedIndex: journey ? benchmark.journeys.indexOf(journey) : -1,
    usesBus: journey?.sections.some(section => section.lineMode === "BUS" || section.lineMode === "NOCTILIEN") ?? false,
    summary } as const;
}

export type PreviewJourney = ReturnType<typeof journeyPreviewRow>;

export interface MappedPreviewJourney {
  row: PreviewJourney;
  destination?: LonLatPoint;
}
