import type { GlobalMapStation } from "../contracts/manifest";
import { parseCityBoundary, type CityBoundary } from "../contracts/cityBoundary";
import type { IrisDataset } from "./irisApi";
import { pointInIrisGeometry } from "./irisGeometry";
import { runNetworkTask } from "../../../services/networkScheduler";
import { toServerApiUrl } from "../../../services/serverApi";

const cached = new Map<string, Promise<CityBoundary>>();

export function stationsMissingCityGeometry(dataset: IrisDataset, stations: readonly GlobalMapStation[]): GlobalMapStation[] {
  const [minLon, minLat, maxLon, maxLat] = dataset.bbox;
  return stations.filter((station) => station.lon < minLon || station.lon > maxLon ||
    station.lat < minLat || station.lat > maxLat || !dataset.neighborhoods.some((neighborhood) =>
      pointInIrisGeometry(station, neighborhood.geometry)));
}

export interface ServedCityBoundaryProgress {
  completed: number;
  total: number;
  boundaries: CityBoundary[];
  unavailable: boolean;
}

export async function fetchServedCityBoundaries(
  stations: readonly GlobalMapStation[],
  onProgress?: (progress: ServedCityBoundaryProgress) => void,
): Promise<{
  boundaries: CityBoundary[]; unavailable: boolean;
}> {
  const boundaries = new Map<string, CityBoundary>();
  let unavailable = false;
  const queue = [...new Map(stations.map((station) => [`${station.lat},${station.lon}`, station])).values()];
  const total = queue.length;
  let completed = 0;
  onProgress?.({ completed, total, boundaries: [], unavailable });
  // Bound this optional enrichment without changing the shared scheduler.
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (let station = queue.shift(); station; station = queue.shift()) {
      const key = `${station.lat},${station.lon}`;
      const coordinates = { lat: String(station.lat), lon: String(station.lon) };
      try {
        let request = cached.get(key);
        if (!request) {
          request = runNetworkTask(async (signal) => {
            const query = new URLSearchParams(coordinates);
            const response = await fetch(toServerApiUrl(`/api/city-boundary?${query}`), { signal });
            if (!response.ok) throw new Error(`Commune boundary unavailable (${response.status})`);
            return parseCityBoundary(await response.json());
          });
          cached.set(key, request);
        }
        const boundary = await request;
        if (!pointInIrisGeometry(station, boundary.geometry)) throw new Error("Commune does not contain the station");
        boundaries.set(boundary.code, boundary);
      } catch {
        cached.delete(key);
        unavailable = true;
      }
      completed += 1;
      onProgress?.({ completed, total, boundaries: [...boundaries.values()], unavailable });
    }
  }));
  return { boundaries: [...boundaries.values()], unavailable };
}
