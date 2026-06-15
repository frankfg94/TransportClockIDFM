import type {
  TrafficDisruption,
  TrafficLineStatus,
} from "../features/traffic/types";
import type { TransitFamily } from "./transit";

export interface HomeAssistantInfoResponse {
  apiVersion: "v1";
  authenticationRequired: boolean;
  canonicalUrl: string;
  capabilities: {
    catalog: true;
    departures: true;
    traffic: true;
  };
  instanceId: string;
  name: string;
}

export interface HomeAssistantFamily {
  family: TransitFamily;
  id: string;
  label: string;
}

export interface HomeAssistantLine {
  color?: string;
  displayName?: string;
  family: TransitFamily;
  iconUrl?: string;
  id: string;
  label: string;
  textColor?: string;
}

export interface HomeAssistantStation {
  city?: string;
  id: string;
  label: string;
  latitude?: number;
  longitude?: number;
}

export interface HomeAssistantDirection {
  id: string;
  label: string;
  subtitle?: string;
}

export interface HomeAssistantCatalogResponse<T> {
  generatedAt: string;
  items: T[];
}

export interface HomeAssistantBoardRequest {
  directionIds: string[];
  family: TransitFamily;
  limit: number;
  lineId: string;
  stationId: string;
}

export interface HomeAssistantBoardsRequest {
  boards: HomeAssistantBoardRequest[];
}

export interface HomeAssistantDeparture {
  aimedTime?: string;
  destination: string;
  expectedTime?: string;
  id: string;
  platform?: string;
  status?: string;
  vehicleAtStop: boolean;
}

export interface HomeAssistantDirectionDepartures {
  departures: HomeAssistantDeparture[];
  id: string;
  label: string;
  serviceEnded: boolean;
  subtitle?: string;
}

export interface HomeAssistantTraffic {
  disruptions: TrafficDisruption[];
  status: TrafficLineStatus;
}

export interface HomeAssistantBoard {
  city?: string;
  color?: string;
  directions: HomeAssistantDirectionDepartures[];
  error?: string;
  family: TransitFamily;
  iconUrl?: string;
  id: string;
  lineId: string;
  lineLabel: string;
  stationId: string;
  stationLabel: string;
  textColor?: string;
  traffic: HomeAssistantTraffic;
}

export interface HomeAssistantBoardsResponse {
  boards: HomeAssistantBoard[];
  generatedAt: string;
}
