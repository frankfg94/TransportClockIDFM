import { toServerApiUrl } from "./serverApi";
import type {
  AnnualRidershipLineResponse,
  AnnualRidershipStationResponse,
  AnnualRidershipStatusResponse,
  MonthlyRidershipLineDocument,
} from "../types/ridership";

const lineRequests = new Map<string, Promise<AnnualRidershipLineResponse>>();
const stationRequests = new Map<string, Promise<AnnualRidershipStationResponse>>();
const monthlyLineRequests = new Map<string, Promise<MonthlyRidershipLineDocument>>();
let statusRequest: Promise<AnnualRidershipStatusResponse> | undefined;

export function fetchAnnualRidershipLine(lineId: string): Promise<AnnualRidershipLineResponse> {
  const cached = lineRequests.get(lineId);
  if (cached) return cached;

  const request = fetch(toServerApiUrl(`/api/ridership/lines/${encodeURIComponent(lineId)}`), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Annual ridership request failed: ${response.status}`);
    }
    return response.json() as Promise<AnnualRidershipLineResponse>;
  });
  lineRequests.set(lineId, request);
  request.catch(() => {
    if (lineRequests.get(lineId) === request) lineRequests.delete(lineId);
  });
  return request;
}

export function fetchAnnualRidershipStation(
  stationId: string,
  lineId?: string,
): Promise<AnnualRidershipStationResponse> {
  const cacheKey = `${stationId}::${lineId ?? ""}`;
  const cached = stationRequests.get(cacheKey);
  if (cached) return cached;

  const query = lineId ? `?lineId=${encodeURIComponent(lineId)}` : "";
  const request = fetch(toServerApiUrl(
    `/api/ridership/stations/${encodeURIComponent(stationId)}${query}`,
  ), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Annual station ridership request failed: ${response.status}`);
    }
    return response.json() as Promise<AnnualRidershipStationResponse>;
  });
  stationRequests.set(cacheKey, request);
  request.catch(() => {
    if (stationRequests.get(cacheKey) === request) stationRequests.delete(cacheKey);
  });
  return request;
}

export function fetchMonthlyRidershipLine(lineId: string): Promise<MonthlyRidershipLineDocument> {
  const cached = monthlyLineRequests.get(lineId);
  if (cached) return cached;

  const request = fetch(toServerApiUrl(
    `/api/ridership/lines/${encodeURIComponent(lineId)}/monthly`,
  ), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Monthly ridership request failed: ${response.status}`);
    return response.json() as Promise<MonthlyRidershipLineDocument>;
  });
  monthlyLineRequests.set(lineId, request);
  request.catch(() => {
    if (monthlyLineRequests.get(lineId) === request) monthlyLineRequests.delete(lineId);
  });
  return request;
}

export function fetchAnnualRidershipStatus(): Promise<AnnualRidershipStatusResponse> {
  if (statusRequest) return statusRequest;
  statusRequest = fetch(toServerApiUrl("/api/ridership/status"), {
    headers: { Accept: "application/json" },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Annual ridership status failed: ${response.status}`);
    return response.json() as Promise<AnnualRidershipStatusResponse>;
  });
  statusRequest.catch(() => {
    statusRequest = undefined;
  });
  return statusRequest;
}

export function clearAnnualRidershipCache(): void {
  lineRequests.clear();
  stationRequests.clear();
  monthlyLineRequests.clear();
  statusRequest = undefined;
}
