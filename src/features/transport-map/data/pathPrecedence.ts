import type { GlobalMapPath } from "../contracts/manifest";

/**
 * A global line can be present twice while a focused viewport is settling:
 * once in the compact regional layer and once as clipped detail chunks. The
 * source priority is also intentional: a NeTEx schematic must never overlay
 * or replace an available GTFS trace.
 */
const GEOMETRY_SOURCE_PRIORITY: Record<GlobalMapPath["geometrySource"], number> = {
  "netex-schematic-fallback": 1,
  netex: 2,
  mixed: 3,
  "official-open-data": 4,
  gtfs: 5,
  "bike-source": 6,
};
const FALLBACK_GEOMETRY_SOURCE = "netex-schematic-fallback" as const;

/**
 * Regional packs deliberately carry a compact LOD for the Île-de-France
 * overview. They remain useful while detail is loading, but must never be
 * frozen as the interaction scene of a focused map: at street zoom their
 * long segments can visibly cut across roads, buildings or the Seine.
 */
export function isHighFidelityTransportPath(path: GlobalMapPath): boolean {
  return (
    !path.quality.fallback &&
    path.geometrySource !== FALLBACK_GEOMETRY_SOURCE &&
    !path.id.startsWith("path:regional:") &&
    !/(?:^|[-:])regional(?:[-:]|$)/i.test(path.sourceVersion)
  );
}

export function linePathsAreHighFidelity(
  paths: readonly GlobalMapPath[],
  lineId: string,
): boolean {
  const linePaths = paths.filter((path) => path.lineId === lineId);
  return linePaths.length > 0 && linePaths.every(isHighFidelityTransportPath);
}

export function selectPreferredLinePaths(
  viewportPaths: readonly GlobalMapPath[],
  regionalPaths: readonly GlobalMapPath[],
  lineId: string,
): GlobalMapPath[] {
  const detailed = uniquePaths(viewportPaths.filter((path) => path.lineId === lineId));
  const regional = uniquePaths(regionalPaths.filter((path) => path.lineId === lineId));

  if (detailed.length === 0) return selectPathsWithinLayer(regional, regional);
  if (regional.length === 0) return selectPathsWithinLayer(detailed, detailed);

  // When both layers contain this line, keep one source layer only. This
  // prevents a regional LOD1 polyline and its detailed chunk fragments from
  // being painted together as two routes. First choose the best layer, then
  // choose the best source per detailed path base. A single line can
  // legitimately mix providers across branches (for example P has GTFS north
  // and official Open Data south), so source priority must not discard an
  // entire branch.
  const detailedPriority = sourcePriority(detailed);
  const regionalPriority = sourcePriority(regional);
  const preferred = detailedPriority >= regionalPriority ? detailed : regional;
  const secondary = detailedPriority >= regionalPriority ? regional : detailed;
  return selectPathsWithinLayer(preferred, [...preferred, ...secondary]);
}

function sourcePriority(paths: readonly GlobalMapPath[]): number {
  return paths.reduce(
    (best, path) => Math.max(best, GEOMETRY_SOURCE_PRIORITY[path.geometrySource]),
    0,
  );
}

function selectPathsWithinLayer(
  paths: readonly GlobalMapPath[],
  supplementalCandidates: readonly GlobalMapPath[] = paths,
): GlobalMapPath[] {
  const bestPriorityByBasePath = new Map<string, number>();
  for (const path of paths) {
    if (path.geometrySource === FALLBACK_GEOMETRY_SOURCE) continue;
    const basePath = basePathId(path);
    const priority = GEOMETRY_SOURCE_PRIORITY[path.geometrySource];
    bestPriorityByBasePath.set(
      basePath,
      Math.max(bestPriorityByBasePath.get(basePath) ?? 0, priority),
    );
  }

  // Process stronger sources first so a weaker path with the same station
  // edges can be discarded even when its chunk was loaded earlier. Preserve
  // the original order in the returned array for deterministic rendering.
  const candidates = paths
    .filter((path) => path.geometrySource !== FALLBACK_GEOMETRY_SOURCE)
    .filter(
      (path) =>
        GEOMETRY_SOURCE_PRIORITY[path.geometrySource] ===
        bestPriorityByBasePath.get(basePathId(path)),
    )
    .sort(
      (left, right) =>
        GEOMETRY_SOURCE_PRIORITY[right.geometrySource] -
        GEOMETRY_SOURCE_PRIORITY[left.geometrySource],
    );
  const coveredEdges = new Set<string>();
  const selectedIds = new Set<string>();
  for (const path of candidates) {
    const edges = pathStationEdgeKeys(path);
    if (edges.length > 0 && edges.every((edge) => coveredEdges.has(edge))) continue;
    selectedIds.add(path.id);
    for (const edge of edges) coveredEdges.add(edge);
  }

  const preferred = paths.filter((path) => selectedIds.has(path.id));
  const supplementalFallback = uniquePaths(supplementalCandidates).filter((path) =>
    path.geometrySource === FALLBACK_GEOMETRY_SOURCE &&
    pathStationEdgeKeys(path).some((edge) => !coveredEdges.has(edge)),
  );
  return [...preferred, ...supplementalFallback];
}

function basePathId(path: GlobalMapPath): string {
  return path.id.split("#", 1)[0] ?? path.id;
}

function pathStationEdgeKeys(path: GlobalMapPath): string[] {
  const edges: string[] = [];
  for (let index = 1; index < path.stationIds.length; index += 1) {
    const previous = path.stationIds[index - 1];
    const current = path.stationIds[index];
    if (!previous || !current || previous === current) continue;
    edges.push([previous, current].sort().join("\u0000"));
  }
  return edges;
}

function uniquePaths(paths: readonly GlobalMapPath[]): GlobalMapPath[] {
  return [...new Map(paths.map((path) => [path.id, path])).values()];
}
