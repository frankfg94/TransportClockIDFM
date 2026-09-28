import {
  DvfDataUnavailableError,
  getDvfDataProvider,
  type DvfMapCell,
  type DvfPurchasePoint,
} from "./compiledRealEstate";

export interface DvfMapGridCell extends DvfMapCell {}

export interface DvfMapCellDataset {
  cells: DvfMapGridCell[];
  cityCount: number;
  totalCityCount: number;
  loadedDepartmentCount: number;
  totalDepartmentCount: number;
  failedDepartmentCodes: string[];
  referencePeriod: string;
}

export interface DvfMapPurchasePointBounds {
  minLongitude: number;
  minLatitude: number;
  maxLongitude: number;
  maxLatitude: number;
}

type LoadProgress = (completedDepartments: number, totalDepartments: number) => void;

export const DVF_MAP_PURCHASE_POINTS_MIN_ZOOM = 17;

let datasetRequest: Promise<DvfMapCellDataset> | undefined;

/** Load the already-compiled 250 m cells only after the map layer is enabled. */
export function loadDvfMapCells(onProgress?: LoadProgress): Promise<DvfMapCellDataset> {
  if (!datasetRequest) {
    datasetRequest = loadDataset(onProgress).catch((error: unknown) => {
      datasetRequest = undefined;
      throw error;
    });
  } else if (onProgress) {
    void datasetRequest.then((dataset) => onProgress(dataset.totalDepartmentCount, dataset.totalDepartmentCount));
  }
  return datasetRequest;
}

/** Load parcel-centre locations separately from aggregate cells, on demand. */
export async function loadDvfMapPurchasePoints(cityCode: string): Promise<readonly DvfPurchasePoint[]> {
  const file = await getDvfDataProvider().loadPurchasePoints(cityCode);
  return file.points;
}

/** Find point assets whose parcel-centre extents overlap the current viewport. */
export async function loadDvfMapPurchasePointCityCodes(bounds: DvfMapPurchasePointBounds): Promise<string[]> {
  const manifest = await getDvfDataProvider().loadPurchasePointsManifest();
  return manifest.cities
    .filter((city) => city.bounds[0] <= bounds.maxLongitude
      && city.bounds[2] >= bounds.minLongitude
      && city.bounds[1] <= bounds.maxLatitude
      && city.bounds[3] >= bounds.minLatitude)
    .map((city) => city.code);
}

async function loadDataset(onProgress?: LoadProgress): Promise<DvfMapCellDataset> {
  const provider = getDvfDataProvider();
  const manifest = await provider.loadManifest();
  const departments = manifest.mapDepartments;
  const failedDepartmentCodes: string[] = [];
  let completedDepartments = 0;
  let loadedDepartmentCount = 0;
  let cityCount = 0;

  // Each department request already contains only the cells used by /map.
  // Promise.all keeps the small shard set moving together and tolerates one
  // unavailable department while preserving the rest of the regional map.
  const departmentFiles = await Promise.all(departments.map(async (descriptor) => {
    try {
      const file = await provider.loadMapDepartment(descriptor.code);
      loadedDepartmentCount += 1;
      cityCount += descriptor.cityCount;
      return file;
    } catch {
      failedDepartmentCodes.push(descriptor.code);
      return undefined;
    } finally {
      completedDepartments += 1;
      onProgress?.(completedDepartments, departments.length);
    }
  }));

  const cells: DvfMapGridCell[] = [];
  for (const department of departmentFiles) {
    if (!department) continue;
    for (const cell of department.cells) cells.push(cell);
  }
  if (cells.length === 0) {
    throw new DvfDataUnavailableError("No DVF grid cells are available for the map.");
  }

  return {
    cells,
    cityCount,
    totalCityCount: manifest.totals.cities,
    loadedDepartmentCount,
    totalDepartmentCount: departments.length,
    failedDepartmentCodes,
    referencePeriod: manifest.referencePeriod,
  };
}
