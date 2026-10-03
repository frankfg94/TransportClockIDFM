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

interface CachedGeometry {
  geometry: PreparedWorldPathGeometry;
  stationsRevision: number;
  anchors: { vertex: GlobalMapVertex; x: number; y: number }[];
}

/**
 * Identity-based cache for backend-neutral world geometry. Screen-space
 * arrays, Canvas scratch and Path2D are deliberately kept out of this cache.
 */
export class PreparedWorldPathGeometryCache {
  private stationsSource?: readonly GlobalMapStation[];
  private preparedByPath = new WeakMap<GlobalMapPath, CachedGeometry>();
  private stationsRevision = 0;

  setStationsSource(stations: readonly GlobalMapStation[] | undefined): void {
    if (this.stationsSource === stations) return;
    this.stationsSource = stations;
    this.stationsRevision += 1;
  }

  get(
    path: GlobalMapPath,
    mode: GlobalMapMode,
    stationsById: ReadonlyMap<string, GlobalMapStation>,
  ): PreparedWorldPathGeometry {
    const cached = this.preparedByPath.get(path);
    if (cached && cached.geometry.mode === mode) {
      if (cached.stationsRevision === this.stationsRevision) return cached.geometry;
      // A viewport can change the station list without changing any anchor
      // used by this path. Recheck only its station vertices, rather than
      // discarding all prepared bus geometry and longitude/latitude buffers.
      const unchanged = cached.anchors.every(({ vertex, x, y }) => {
        const resolved = resolveGlobalMapVertex(path, vertex, stationsById.get(vertex.stationId!), mode);
        return resolved.x === x && resolved.y === y;
      });
      if (unchanged) {
        cached.stationsRevision = this.stationsRevision;
        return cached.geometry;
      }
    }

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
    const anchors = subpaths.flatMap(subpath => subpath.vertices.flatMap((vertex, index) => {
      if (!vertex.stationId) return [];
      const point = subpath.worldPoints[index]!;
      return [{ vertex, x: point.x, y: point.y }];
    }));
    this.preparedByPath.set(path, { geometry: prepared, anchors, stationsRevision: this.stationsRevision });
    return prepared;
  }

  clear(): void {
    this.stationsSource = undefined;
    this.preparedByPath = new WeakMap();
  }
}
