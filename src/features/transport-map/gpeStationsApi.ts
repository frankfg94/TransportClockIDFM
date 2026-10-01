import { runNetworkTask } from "../../services/networkScheduler";
import { toServerApiUrl } from "../../services/serverApi";

export type GpeStationProjectStatus = "planned" | "under-construction" | "open";

export interface GpeMapStation {
  id: string;
  name: string;
  line: string;
  lon: number;
  lat: number;
  projectStatus: GpeStationProjectStatus;
  openingWindow?: string;
  verifiedAt: string;
}

let cached: GpeMapStation[] | undefined;
let pending: Promise<GpeMapStation[]> | undefined;

export function fetchGpeStations(): Promise<GpeMapStation[]> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = runNetworkTask(async (signal) => {
      const response = await fetch(toServerApiUrl("/api/neighborhood-verdict/gpe-stations"), { signal });
      if (!response.ok) throw new Error(`GPE station data unavailable (${response.status})`);
      const stations = parseGpeStations(await response.json());
      cached = stations;
      return stations;
    }).finally(() => {
      pending = undefined;
    });
  }
  return pending;
}

function parseGpeStations(value: unknown): GpeMapStation[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("GPE station data is empty or invalid");
  }
  return value.map((item) => {
    if (!isRecord(item)
      || typeof item.id !== "string"
      || typeof item.name !== "string"
      || typeof item.line !== "string"
      || !isCoordinate(item.lon, -180, 180)
      || !isCoordinate(item.lat, -90, 90)
      || (item.projectStatus !== "planned" && item.projectStatus !== "under-construction" && item.projectStatus !== "open")
      || typeof item.verifiedAt !== "string") {
      throw new Error("GPE station data contains an invalid station");
    }
    return {
      id: item.id,
      name: item.name,
      line: item.line,
      lon: item.lon,
      lat: item.lat,
      projectStatus: item.projectStatus,
      openingWindow: typeof item.openingWindow === "string" ? item.openingWindow : undefined,
      verifiedAt: item.verifiedAt,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
