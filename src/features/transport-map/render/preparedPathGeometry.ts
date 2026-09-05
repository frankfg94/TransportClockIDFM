import {
  getGlobalMapPathSubpathRanges,
  resolveGlobalMapVertex,
  type GlobalMapMode,
  type GlobalMapPath,
  type GlobalMapStation,
  type GlobalMapVertex,
} from "../contracts/manifest";

export interface PreparedWorldPathSubpath {
  start: number;
  end: number;
  /** The source vertices, retained for stable traffic-range indexing. */
  vertices: GlobalMapVertex[];
  /** Resolved world coordinates, including provider/canonical station anchors. */
  worldPoints: GlobalMapVertex[];
  protectedPointIndices: number[];
}

export interface PreparedWorldPathGeometry {
  path: GlobalMapPath;
  mode: GlobalMapMode;
  subpaths: PreparedWorldPathSubpath[];
}

/**
 * Identity-based cache for backend-neutral world geometry. Screen-space
 * arrays, Canvas scratch and Path2D are deliberately kept out of this cache.
 */
export class PreparedWorldPathGeometryCache {
  private stationsSource?: readonly GlobalMapStation[];
  private preparedByPath = new WeakMap<GlobalMapPath, PreparedWorldPathGeometry>();

  setStationsSource(stations: readonly GlobalMapStation[] | undefined): void {
    if (this.stationsSource === stations) return;
    this.stationsSource = stations;
    this.preparedByPath = new WeakMap();
  }

  get(
    path: GlobalMapPath,
    mode: GlobalMapMode,
    stationsById: ReadonlyMap<string, GlobalMapStation>,
  ): PreparedWorldPathGeometry {
    const cached = this.preparedByPath.get(path);
    if (cached && cached.mode === mode) return cached;

    const subpaths = getGlobalMapPathSubpathRanges(path).map(({ start, end }) => {
      const vertices = path.vertices.slice(start, end);
      const worldPoints = vertices.map((rawVertex) =>
        resolveGlobalMapVertex(
          path,
          rawVertex,
          rawVertex.stationId ? stationsById.get(rawVertex.stationId) : undefined,
          mode,
        ),
      );
      return {
        start,
        end,
        vertices,
        worldPoints,
        protectedPointIndices: vertices.flatMap((vertex, index) =>
          vertex.stationId ? [index] : [],
        ),
      };
    });
    const prepared = { path, mode, subpaths };
    this.preparedByPath.set(path, prepared);
    return prepared;
  }

  clear(): void {
    this.stationsSource = undefined;
    this.preparedByPath = new WeakMap();
  }
}
