import type { GlobalMapBounds, GlobalMapPath } from "../contracts/manifest";

/**
 * Cheap, order-preserving viewport culling shared by the data pipeline.
 *
 * This is intentionally the same predicate that the former `filter-paths`
 * Worker task executed. Keep it free of mode or detail-line policy: those
 * decisions belong to the caller's existing render filter.
 */
export function filterPathsByBounds(
  paths: readonly GlobalMapPath[],
  bounds: GlobalMapBounds,
): GlobalMapPath[] {
  return paths.filter((path) => !(
    path.maxX < bounds.minX ||
    path.minX > bounds.maxX ||
    path.maxY < bounds.minY ||
    path.minY > bounds.maxY
  ));
}
