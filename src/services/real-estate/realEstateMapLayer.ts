import {
  DvfDataUnavailableError,
  getDvfDataProvider,
  type DvfGridCell,
} from "./compiledRealEstate";

export interface DvfMapGridCell extends DvfGridCell {
  cityCode: string;
  cityName: string;
}

export interface DvfMapCellDataset {
  cells: DvfMapGridCell[];
  cityCount: number;
  totalCityCount: number;
  referencePeriod: string;
}

type LoadProgress = (completedCities: number, totalCities: number) => void;

let datasetRequest: Promise<DvfMapCellDataset> | undefined;

/** Load the already-compiled 250 m cells only after the map layer is enabled. */
export function loadDvfMapCells(onProgress?: LoadProgress): Promise<DvfMapCellDataset> {
  if (!datasetRequest) {
    datasetRequest = loadDataset(onProgress).catch((error: unknown) => {
      datasetRequest = undefined;
      throw error;
    });
  } else if (onProgress) {
    void datasetRequest.then((dataset) => onProgress(dataset.totalCityCount, dataset.totalCityCount));
  }
  return datasetRequest;
}

async function loadDataset(onProgress?: LoadProgress): Promise<DvfMapCellDataset> {
  const provider = getDvfDataProvider();
  const manifest = await provider.loadManifest();
  const cities = manifest.cities;
  const cityFiles: Array<{ name: string; code: string; cells: DvfGridCell[] } | undefined> = new Array(cities.length);
  let nextIndex = 0;
  let completedCities = 0;

  // Keep requests bounded: city assets are small, but the catalogue has more
  // than 1,200 communes and should never fan out that many requests at once.
  const workerCount = Math.min(12, cities.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < cities.length) {
      const index = nextIndex++;
      const city = cities[index];
      try {
        const file = await provider.loadCity(city.code);
        cityFiles[index] = { code: city.code, name: city.name, cells: file.cells };
      } catch {
        // One unavailable commune must not make the rest of the map unusable.
      } finally {
        completedCities += 1;
        onProgress?.(completedCities, cities.length);
      }
    }
  }));

  const cells = cityFiles.flatMap((city) => city
    ? city.cells.map((cell) => ({ ...cell, cityCode: city.code, cityName: city.name }))
    : []);
  const cityCount = cityFiles.filter(Boolean).length;
  if (cells.length === 0) {
    throw new DvfDataUnavailableError("No DVF grid cells are available for the map.");
  }

  return { cells, cityCount, totalCityCount: cities.length, referencePeriod: manifest.referencePeriod };
}
