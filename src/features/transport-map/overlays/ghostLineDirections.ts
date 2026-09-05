import { createLinePresentation, transitFamilyToMode } from "../../../services/linePresentation";
import { idfmLineToSiriRef } from "../../../services/idfmStopReferences";
import type {
  LineRouteSequence,
  LineSearchOption,
  TransitFamily,
} from "../../../types/transit";
import type {
  GlobalMapLine,
  GlobalMapMode,
  GlobalMapStation,
} from "../contracts/manifest";
import {
  getGlobalBusDirectionOrderedStopIds,
  resolveGlobalDirection,
} from "../../line-map/globalBusDirections";
import type { BusMapDirectionSelection } from "../../line-map/lineMapData";
import type { GhostLineFlowDirection } from "./ghostLineFlow";

export interface TransportLineFlowDirection {
  flow: GhostLineFlowDirection;
  selection: BusMapDirectionSelection;
}

/**
 * Builds the shared line option used by both map hosts without coupling a map
 * host to a Vue component.  Keeping this presentation conversion here avoids
 * duplicating the official icon/color contract in NearbyStations and the
 * global map.
 */
export function createTransportLineSearchOption(
  line: GlobalMapLine,
): LineSearchOption | undefined {
  const family = globalMapLineFamily(line.mode);
  if (!family) return undefined;

  const label = line.label || line.code;
  const presentation = createLinePresentation({
    code: line.code,
    color: line.color,
    family,
    id: line.id,
    longName: line.label,
    mode: transitFamilyToMode(family),
    ref: idfmLineToSiriRef(line.sourceLineId ?? line.id),
    shortName: label,
    textColor: line.textColor,
  });
  const iconUrls = [
    ...new Set(
      [line.pictogram, ...(presentation.iconUrls ?? [])].filter(
        (url): url is string => Boolean(url),
      ),
    ),
  ];

  return {
    family,
    id: line.id,
    label,
    ref: idfmLineToSiriRef(line.sourceLineId ?? line.id),
    navitiaId: line.id,
    color: presentation.color,
    textColor: presentation.textColor,
    displayName: label,
    iconUrl: iconUrls[0] ?? presentation.iconUrl,
    iconUrls,
  };
}

/**
 * Resolves every passenger-facing direction exposed by the existing global
 * direction resolver.  Direction text intentionally comes from the GTFS
 * direction field, then the actual terminal stop, never from the commercial
 * line label or an arbitrary next stop.
 */
export function createTransportLineFlowDirections(
  line: GlobalMapLine,
  sequences: readonly LineRouteSequence[],
  stations: readonly GlobalMapStation[],
): TransportLineFlowDirection[] {
  const initial = resolveGlobalDirection([...sequences]);
  if (!initial) return [];

  const directionIds = initial.options.length > 0
    ? initial.options.map((option) => option.id)
    : [initial.selectedDirectionId];
  const seen = new Set<string>();

  return directionIds.flatMap((directionId) => {
    if (seen.has(directionId)) return [];
    seen.add(directionId);
    const selection = resolveGlobalDirection([...sequences], directionId);
    if (!selection) return [];

    const orderedStationIds = getGlobalBusDirectionOrderedStopIds(
      line,
      selection,
      stations,
    );
    const terminal = selection.sequence.stops.at(-1);
    const label = selection.sequence.direction?.trim() || terminal?.label?.trim() || "";
    const destinationStationId = orderedStationIds.at(-1);
    const destinationStation = destinationStationId
      ? stations.find((station) => station.id === destinationStationId)
      : undefined;
    const destinationCity = terminal?.city?.trim() || destinationStation?.city?.trim();

    return [{
      selection,
      flow: {
        id: selection.selectedDirectionId,
        label,
        orderedStationIds,
        destinationStationId,
        ...(destinationCity ? { destinationCity } : {}),
      },
    }];
  });
}

export function supportsTransportLineDirections(
  line: GlobalMapLine | undefined,
): line is GlobalMapLine {
  return Boolean(line && line.mode !== "BIKE");
}

export function isRoadTransportLine(line: GlobalMapLine): boolean {
  return line.mode === "BUS" || line.mode === "NOCTILIEN";
}

export function globalMapLineFamily(mode: GlobalMapMode): TransitFamily | undefined {
  if (
    mode === "METRO" ||
    mode === "RER" ||
    mode === "BUS" ||
    mode === "TRAM" ||
    mode === "NOCTILIEN" ||
    mode === "TRANSILIEN" ||
    mode === "CABLE"
  ) {
    return mode;
  }

  if (mode === "TRAIN") return "TRANSILIEN";
  return undefined;
}
