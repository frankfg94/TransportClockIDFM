import type {
  DirectionGroupConfig,
  LineSearchOption,
  MonitoringPointConfig,
  StationBoardDraft,
  StationSearchOption,
  TransitBoardConfig,
  TransitFamily,
  TransitFamilyOption,
} from "../types/transit";
import { navitiaStopPointToMonitoringRef } from "./idfmStopReferences";
import { createLinePresentation, transitFamilyToMode } from "./linePresentation";

export const fallbackTransitFamilies: TransitFamily[] = [
  "METRO",
  "RER",
  "BUS",
  "TRAM",
  "NOCTILIEN",
  "TRANSILIEN",
  "CABLE",
];

export interface BoardBuilderGateway {
  searchLines(network: TransitFamilyOption, query: string): Promise<LineSearchOption[]>;
  searchStations(line: LineSearchOption, query: string): Promise<StationSearchOption[]>;
}

export function createBoardFromDraft(
  draft: Required<StationBoardDraft>,
  directionGroups: DirectionGroupConfig[],
): TransitBoardConfig {
  const mode = transitFamilyToMode(draft.family);
  const presentation = createLinePresentation({
    code: draft.line.label,
    color: draft.line.color,
    family: draft.family,
    id: draft.line.navitiaId ?? draft.line.id,
    mode,
    ref: draft.line.ref,
    shortName: draft.line.label,
    textColor: draft.line.textColor,
  });

  return {
    id: createBoardId(draft.line, draft.station),
    title: draft.station.label,
    city: draft.station.city ?? "",
    line: {
      ref: draft.line.ref,
      shortName: draft.line.label,
      longName: `${draft.family} ${draft.line.label}`,
      mode,
      color: presentation.color,
      textColor: presentation.textColor,
      iconUrl: draft.line.iconUrl ?? presentation.iconUrl,
      iconUrls: mergeIconUrls(draft.line.iconUrls, presentation.iconUrls),
    },
    monitoringPoints: createMonitoringPoints(draft.station, directionGroups),
    directionGroups,
    schedule: draft.station.scheduleStopAreaRef
      ? {
          lineRef: draft.line.navitiaId,
          stopAreaRef: draft.station.scheduleStopAreaRef,
        }
      : undefined,
    maxDepartures: 8,
  };
}

function createMonitoringPoints(
  station: StationSearchOption,
  directionGroups: DirectionGroupConfig[],
): MonitoringPointConfig[] {
  const monitoringPoints = new Map<string, MonitoringPointConfig>();

  directionGroups.forEach((group) => {
    group.match.navitiaStopPointRefs?.forEach((stopPointRef) => {
      const monitoringRef = navitiaStopPointToMonitoringRef(stopPointRef);

      if (monitoringRef && !monitoringPoints.has(monitoringRef)) {
        monitoringPoints.set(monitoringRef, {
          ref: monitoringRef,
          label: group.label,
        });
      }
    });
  });

  return monitoringPoints.size > 0
    ? Array.from(monitoringPoints.values())
    : [
        {
          ref: station.monitoringRef,
          label: "Tous quais",
        },
      ];
}

function createBoardId(line: LineSearchOption, station: StationSearchOption): string {
  return `${line.id}-${station.id}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function mergeIconUrls(
  primary?: string[],
  fallback?: string[],
): string[] | undefined {
  const urls = Array.from(new Set([...(primary ?? []), ...(fallback ?? [])]));

  return urls.length > 0 ? urls : undefined;
}

