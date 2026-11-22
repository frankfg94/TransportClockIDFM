import type { MultiPolygon, Polygon } from "geojson";

export type GreenBoundary = Polygon | MultiPolygon;
export type GreenPoint = { lon: number; lat: number };
export interface GreeneryMapData {
  boundary: GreenBoundary;
  canopy?: GreenBoundary;
  mainBoundary?: GreenBoundary;
  entrances?: GreenPoint[];
  surfaceM2?: number;
  openingHours?: string;
  subsites?: GreenParkSubsite[];
}

export interface GreenParkSubsite {
  name: string;
  boundary: GreenBoundary;
  surfaceM2?: number;
}

export type GreenMapReference =
  | { scope: "address"; lat: number; lon: number; version: string }
  | { scope: "commune"; code: string; version: string }
  | { scope: "park"; id: string; lat?: number; lon?: number; version?: string }
  | { scope: "woodland"; id: string; lat: number; lon: number; version: string; mainAccess?: GreenPoint };

export interface GreenSpaceMapAccess {
  name: string;
  walkingMinutes: number;
  estimated: boolean;
}

export interface CanopyMeasure {
  source: typeof NATURE_IN_CITY_ID;
  percentage: number;
  areaM2: number;
  canopyM2: number;
  period: string;
  map: GreenMapReference;
}

export interface VerdictGreenery {
  address?: CanopyMeasure;
  commune?: CanopyMeasure;
  parkAccess?: "within" | "beyond" | "unknown";
}

export const NATURE_IN_CITY_ID = "ign-nature-en-ville";
export const NATURE_IN_CITY_URL = "https://www.data.gouv.fr/datasets/nature-en-ville";
export { CANOPY_RADIUS_METERS, PARK_WALK_LIMIT_SECONDS, canopyBonus } from "./natureInCityRules";
