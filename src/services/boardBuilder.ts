import type {
  DirectionGroupConfig,
  LineSearchOption,
  MonitoringPointConfig,
  StationBoardDraft,
  StationSearchOption,
  TransitBoardConfig,
  TransitFamily,
  TransitFamilyOption,
  TransitMode,
} from "../types/transit";

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
  const mode = familyToMode(draft.family);

  return {
    id: createBoardId(draft.line, draft.station),
    title: draft.station.label,
    city: draft.station.city ?? "",
    line: {
      ref: draft.line.ref,
      shortName: draft.line.label,
      longName: `${draft.family} ${draft.line.label}`,
      mode,
      color: draft.line.color ?? "#0064ff",
      textColor: draft.line.textColor ?? "#ffffff",
      iconUrl: draft.line.iconUrl,
      iconUrls: draft.line.iconUrls,
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

function familyToMode(family: TransitFamily): TransitMode {
  if (family === "METRO") {
    return "metro";
  }

  if (family === "TRAM") {
    return "tram";
  }

  if (family === "RER") {
    return "rer";
  }

  if (family === "BUS" || family === "NOCTILIEN") {
    return "bus";
  }

  return "train";
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

function navitiaStopPointToMonitoringRef(
  stopPointRef: string,
): string | undefined {
  if (stopPointRef.includes("monomodalStopPlace")) {
    return undefined;
  }

  const stopPointId = stopPointRef.match(/(\d+)$/u)?.[1];

  return stopPointId ? `STIF:StopPoint:Q:${stopPointId}:` : undefined;
}

function createBoardId(line: LineSearchOption, station: StationSearchOption): string {
  return `${line.id}-${station.id}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

