import type { TransitQuay, TransferLineOption } from "../../types/transit";
import type { GeographicViewport } from "./geoProjection";
import type {
  LineGeometryAttempt,
  LineGeometryPoint,
  LineGeometrySource,
} from "../line-map/lineGeometry";

export type GhostNetworkScope = "all" | "structural";
export type GhostNetworkModeKey =
  | "bus"
  | "metro"
  | "tram"
  | "noctilien"
  | "rer"
  | "transilien";

export type GhostNetworkModeVisibility = Record<GhostNetworkModeKey, boolean>;

export interface NetworkGhostAnchor {
  id: string;
  label: string;
  lon?: number;
  lat?: number;
  projectedX?: number;
  projectedY?: number;
  mapX: number;
  mapY: number;
  quays?: TransitQuay[];
}

export interface NetworkGhostTopology {
  line?: {
    id?: string;
    name?: string;
    shortName?: string;
    mode?: string;
  };
  stations: NetworkGhostTopologyStation[];
  segments?: NetworkGhostTopologySegment[];
  patterns?: Array<{
    id: string;
    stops: string[];
  }>;
}

export interface NetworkGhostTopologyStation {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
  projectedX?: number;
  projectedY?: number;
  quays?: TransitQuay[];
}

export interface NetworkGhostTopologySegment {
  id: string;
  from: string;
  to: string;
}

export interface NetworkGhostStationView {
  id: string;
  label: string;
  lon?: number;
  lat?: number;
  x: number;
  y: number;
}

export interface NetworkGhostSegmentView {
  id: string;
  fromStationId: string;
  toStationId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  polyline?: LineGeometryPoint[];
  level: number;
}

export interface NetworkGhostEntranceView {
  id: string;
  parentStationId: string;
  name: string;
  code?: string;
  lon: number;
  lat: number;
  x: number;
  y: number;
}

export interface NetworkGhostLineView {
  id: string;
  label: string;
  mode: string;
  family?: TransferLineOption["family"];
  ref?: string;
  color: string;
  textColor: string;
  iconUrl?: string;
  iconUrls?: string[];
  isBus: boolean;
  anchorStationId: string;
  anchorX: number;
  anchorY: number;
  stations: NetworkGhostStationView[];
  branches?: Array<{
    id: string;
    stopIds: string[];
  }>;
  segments: NetworkGhostSegmentView[];
  geometrySource: LineGeometrySource;
  geometryAttempts: LineGeometryAttempt[];
  geometryPending?: boolean;
  entrances?: NetworkGhostEntranceView[];
  loadOrder: number;
}

export interface NetworkGhostQuayView {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface NetworkGhostLoadOptions {
  anchor?: NetworkGhostAnchor;
  enabled: boolean;
  scope: GhostNetworkScope;
  transfers: TransferLineOption[];
  viewport?: GeographicViewport;
}

export interface NetworkGhostProgress {
  completed: number;
  total: number;
  precisionCompleted: number;
  precisionTotal: number;
}
