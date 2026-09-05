import type {
  GlobalMapBounds,
  GlobalMapLine,
  GlobalMapEntrance,
  GlobalMapPath,
  GlobalMapStation,
} from "./manifest.js";

export interface TransportMapNetwork {
  lines: GlobalMapLine[];
  stations: GlobalMapStation[];
  entrances: GlobalMapEntrance[];
  regionalPaths: GlobalMapPath[];
  pathsById: Map<string, GlobalMapPath>;
  linesById: Map<string, GlobalMapLine>;
  stationsById: Map<string, GlobalMapStation>;
  bounds: GlobalMapBounds;
}

export interface ViewportQuery {
  bounds: GlobalMapBounds;
  zoom: number;
  lod: number;
  visibleModeMask: number;
  generation: number;
}

export interface TransportMapViewportResult {
  generation: number;
  chunkIds: string[];
  paths: GlobalMapPath[];
  stations: GlobalMapStation[];
  bytes: number;
  fromCache: boolean;
}

export interface TransportMapSelectionState {
  activeLineId?: string;
  activeStationId?: string;
  hoveredFeature?: { type: "line" | "station"; id: string };
  focusedFeature?: { type: "line" | "station"; id: string };
  selectedStationIds: string[];
}
