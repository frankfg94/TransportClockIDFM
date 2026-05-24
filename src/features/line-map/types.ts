import type { StationSearchOption, TransferLineOption } from "../../types/transit";

export interface LineMapStopView {
  id: string;
  label: string;
  city?: string;
  lon?: number;
  lat?: number;
  projectedX?: number;
  projectedY?: number;
  coordinateSource?: "wgs84" | "lambert93" | "fallback";
  x: number;
  y: number;
  routeIds: string[];
  routeLabels: string[];
  station: StationSearchOption;
}

export interface LineMapSegmentView {
  id: string;
  fromStopId: string;
  toStopId: string;
}

export interface LineMapBranchView {
  id: string;
  label: string;
  direction?: string;
  stopIds: string[];
}

export interface MapTile {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LineMapViewModel {
  lineId: string;
  lineLabel: string;
  lineColor: string;
  textColor: string;
  stops: LineMapStopView[];
  segments: LineMapSegmentView[];
  branches: LineMapBranchView[];
  tiles: MapTile[];
}

export interface LineTransferSummary {
  stationId: string;
  transfers: TransferLineOption[];
}

export interface StationListItem {
  station: StationSearchOption;
  transfers?: TransferLineOption[];
  transfersLoading?: boolean;
}

export interface TransferLineDirections {
  lineId: string;
  directions: string[];
}

