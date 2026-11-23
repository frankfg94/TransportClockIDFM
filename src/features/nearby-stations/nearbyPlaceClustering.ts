export const NEARBY_PLACE_CLUSTER_CELL_SIZE_CSS_PX = 56;

export type NearbyPlaceClusterSource = {
  place: { id: string };
  worldX: number;
  worldY: number;
  order: number;
};

export type NearbyPlaceMarkerGroup<T extends NearbyPlaceClusterSource> =
  | {
    kind: "place";
    key: string;
    item: T;
    centerWorldX: number;
    centerWorldY: number;
    order: number;
  }
  | {
    kind: "cluster";
    key: string;
    items: T[];
    centerWorldX: number;
    centerWorldY: number;
    order: number;
  };

/**
 * Group map places in stable world-pixel cells. Their membership stays steady
 * while panning and naturally separates as the user zooms in.
 */
export function clusterNearbyPlaceMarkers<T extends NearbyPlaceClusterSource>(
  entries: readonly T[],
  worldScale: number,
  cellSizeCssPx = NEARBY_PLACE_CLUSTER_CELL_SIZE_CSS_PX,
): NearbyPlaceMarkerGroup<T>[] {
  if (!Number.isFinite(worldScale) || worldScale <= 0 || !Number.isFinite(cellSizeCssPx) || cellSizeCssPx <= 0) {
    return entries.map(entry => ({
      kind: "place",
      key: entry.place.id,
      item: entry,
      centerWorldX: entry.worldX,
      centerWorldY: entry.worldY,
      order: entry.order,
    }));
  }

  const cells = new Map<string, { x: number; y: number; entries: T[] }>();
  for (const entry of entries) {
    const cellX = Math.floor(entry.worldX * worldScale / cellSizeCssPx);
    const cellY = Math.floor(entry.worldY * worldScale / cellSizeCssPx);
    const key = `${cellX}:${cellY}`;
    const cell = cells.get(key) ?? { x: cellX, y: cellY, entries: [] };
    cell.entries.push(entry);
    cells.set(key, cell);
  }

  return [...cells.entries()]
    .map(([key, cell]): NearbyPlaceMarkerGroup<T> => {
      const sorted = cell.entries.sort((a, b) => a.order - b.order);
      if (sorted.length === 1) {
        const item = sorted[0]!;
        return {
          kind: "place",
          key: item.place.id,
          item,
          centerWorldX: item.worldX,
          centerWorldY: item.worldY,
          order: item.order,
        };
      }
      return {
        kind: "cluster",
        key,
        items: sorted,
        centerWorldX: (cell.x * cellSizeCssPx + cellSizeCssPx / 2) / worldScale,
        centerWorldY: (cell.y * cellSizeCssPx + cellSizeCssPx / 2) / worldScale,
        order: sorted[0]!.order,
      };
    })
    .sort((a, b) => a.order - b.order);
}
