import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GlobalMapAssetLoader,
  decodeBootstrap,
  decodeRegionalPaths,
} from "../src/features/transport-map/data/assetLoader";
import {
  resolveGlobalMapVertex,
  type GlobalMapPath,
  type GlobalMapVertex,
} from "../src/features/transport-map/contracts/manifest";
import {
  worldScaleAtZoom,
  worldToScreen,
  type ScreenPoint,
} from "../src/features/transport-map/geo/coordinateKernel";
import type { CameraState } from "../src/features/transport-map/geo/camera";

const assetRoot = resolve(process.cwd(), "public/data/global-map/v1");
const WORLD_CIRCUMFERENCE_METERS = 40_075_016.68557849;
const MAX_STATION_PATH_ERROR_METERS = 0.25;

function createLocalFetcher() {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const asset = String(input).split("/global-map/v1/")[1];
    if (!asset) return new Response(null, { status: 404 });
    try {
      return new Response(readFileSync(resolve(assetRoot, asset)), { status: 200 });
    } catch {
      return new Response(null, { status: 404 });
    }
  };
}

function distanceToSegment(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (start.x + t * dx),
    point.y - (start.y + t * dy),
  );
}

function distanceToPath(point: ScreenPoint, path: ScreenPoint[]): number {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length; index += 1) {
    distance = Math.min(
      distance,
      distanceToSegment(point, path[index - 1]!, path[index]!),
    );
  }
  return distance;
}

function renderedVertices(path: GlobalMapPath): GlobalMapVertex[] {
  return path.vertices.map((vertex) => resolveGlobalMapVertex(path, vertex));
}

function cameraAt(station: { worldX: number; worldY: number }, zoom: number): CameraState {
  return {
    centerWorldX: station.worldX,
    centerWorldY: station.worldY,
    zoom,
    bearing: 0,
    viewportWidthCssPx: 1200,
    viewportHeightCssPx: 800,
    pixelRatio: 1,
    generation: zoom,
  };
}

describe("GlobalTransportPlan T13 DOM geometry", () => {
  it("intersects every T13 station node with a rendered stroke", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher() });
    const manifest = await loader.loadManifest();
    const bootstrapPayload = await loader.loadBootstrapPayload(manifest);
    const catalog = await loader.loadCatalog(manifest);
    const network = decodeBootstrap(bootstrapPayload, manifest, catalog);
    const regionalPayload = await loader.loadRegionalPayload(manifest);
    expect(regionalPayload).toBeDefined();

    const t13 = network.linesById.get("line:IDFM:C02344");
    expect(t13).toMatchObject({ mode: "TRAM", label: "T13" });

    const regionalPaths = decodeRegionalPaths(regionalPayload!, bootstrapPayload)
      .filter((path) => path.lineId === t13?.id);
    expect(regionalPaths.length).toBeGreaterThan(0);
    expect(regionalPaths.every((path) => path.geometrySource === "gtfs")).toBe(true);

    const stations = t13!.stationIds.map((stationId) => network.stationsById.get(stationId));
    expect(stations.every(Boolean)).toBe(true);
    const stationBounds = {
      minX: Math.min(...stations.map((station) => station!.worldX)),
      minY: Math.min(...stations.map((station) => station!.worldY)),
      maxX: Math.max(...stations.map((station) => station!.worldX)),
      maxY: Math.max(...stations.map((station) => station!.worldY)),
    };
    const detailDescriptors = manifest.files.chunks.filter(
      (descriptor) =>
        descriptor.level === 11 &&
        descriptor.modes?.includes("TRAM") &&
        !(descriptor.bounds.maxX < stationBounds.minX ||
          descriptor.bounds.minX > stationBounds.maxX ||
          descriptor.bounds.maxY < stationBounds.minY ||
          descriptor.bounds.minY > stationBounds.maxY),
    );
    const detailPaths = (
      await Promise.all(
        detailDescriptors.map((descriptor) => loader.loadChunk(manifest, descriptor)),
      )
    )
      .flatMap((payload) => payload.paths)
      .filter((path) => path.lineId === t13!.id);
    expect(detailPaths.length).toBeGreaterThan(0);
    expect(detailPaths.every((path) => path.geometrySource === "gtfs")).toBe(true);

    const renderedPathStationIds = new Set(
      detailPaths.flatMap((path) =>
        path.vertices.flatMap((vertex) => vertex.stationId ? [vertex.stationId] : []),
      ),
    );
    expect(renderedPathStationIds).toEqual(new Set(t13!.stationIds));
    expect(
      new Set(
        regionalPaths.flatMap((path) =>
          path.vertices.flatMap((vertex) => vertex.stationId ? [vertex.stationId] : []),
        ),
      ),
    ).toEqual(new Set(t13!.stationIds));

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.dataset.globalMapT13 = "true";
    document.body.appendChild(svg);

    for (const zoom of [12, 18, 20]) {
      const zoomLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      zoomLayer.dataset.zoom = String(zoom);
      svg.appendChild(zoomLayer);

      const camera = cameraAt(stations[0]!, zoom);
      for (const [geometryName, paths] of [["regional", regionalPaths], ["detail", detailPaths]] as const) {
        const geometryLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        geometryLayer.dataset.geometry = geometryName;
        zoomLayer.appendChild(geometryLayer);

        const screenPaths = paths.map((path) =>
          renderedVertices(path).map((vertex) => worldToScreen(vertex, camera)),
        );
        for (const [pathIndex, screenPath] of screenPaths.entries()) {
          const stroke = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
          stroke.dataset.pathId = paths[pathIndex]!.id;
          stroke.dataset.zoom = String(zoom);
          stroke.setAttribute("points", screenPath.map((point) => `${point.x},${point.y}`).join(" "));
          stroke.setAttribute("fill", "none");
          stroke.setAttribute("stroke", "currentColor");
          geometryLayer.appendChild(stroke);
        }

        for (const station of stations) {
          const stationPoint = worldToScreen(
            { x: station!.worldX, y: station!.worldY },
            camera,
          );
          const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          node.dataset.stationId = station!.id;
          node.dataset.zoom = String(zoom);
          node.dataset.geometry = geometryName;
          node.setAttribute("cx", String(stationPoint.x));
          node.setAttribute("cy", String(stationPoint.y));
          geometryLayer.appendChild(node);

          const distance = Math.min(
            ...screenPaths.map((screenPath) => distanceToPath(stationPoint, screenPath)),
          );
          const distanceMeters =
            distance / worldScaleAtZoom(zoom) * WORLD_CIRCUMFERENCE_METERS;
          expect(
            distanceMeters,
            `${geometryName}: ${station!.name} is an orphan node at zoom ${zoom}: ${distanceMeters.toFixed(3)} m`,
          ).toBeLessThanOrEqual(MAX_STATION_PATH_ERROR_METERS);
        }

        expect(geometryLayer.querySelectorAll("circle")).toHaveLength(stations.length);
        expect(geometryLayer.querySelectorAll('polyline[stroke="currentColor"]')).toHaveLength(paths.length);
      }
    }

    expect(svg.querySelectorAll("circle")).toHaveLength(stations.length * 3 * 2);
    expect(svg.querySelectorAll("polyline")).toHaveLength((regionalPaths.length + detailPaths.length) * 3);
  });
});
