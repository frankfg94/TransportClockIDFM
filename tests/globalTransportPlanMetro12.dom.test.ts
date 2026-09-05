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
  type GlobalMapStation,
  type GlobalMapVertex,
} from "../src/features/transport-map/contracts/manifest";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";
import { worldScaleAtZoom, worldToScreen, type ScreenPoint } from "../src/features/transport-map/geo/coordinateKernel";
import type { CameraState } from "../src/features/transport-map/geo/camera";
import { buildRoundedPolylinePath } from "../src/features/line-map/lineGeometry";

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
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function distanceToPath(point: ScreenPoint, path: ScreenPoint[]): number {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length; index += 1) {
    distance = Math.min(distance, distanceToSegment(point, path[index - 1]!, path[index]!));
  }
  return distance;
}

function renderedVertices(path: GlobalMapPath): GlobalMapVertex[] {
  return path.vertices.map((vertex) => resolveGlobalMapVertex(path, vertex));
}

function interiorAngleDegrees(previous: ScreenPoint, current: ScreenPoint, next: ScreenPoint): number {
  const incoming = { x: previous.x - current.x, y: previous.y - current.y };
  const outgoing = { x: next.x - current.x, y: next.y - current.y };
  const denominator = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y);
  if (denominator === 0) return 180;
  const cosine = (incoming.x * outgoing.x + incoming.y * outgoing.y) / denominator;
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

describe("GlobalTransportPlan Metro 12 DOM geometry", () => {
  it("intersects every Metro 12 station point with the rendered GTFS path", async () => {
    const loader = new GlobalMapAssetLoader({ fetcher: createLocalFetcher() });
    const manifest = await loader.loadManifest();
    const bootstrapPayload = await loader.loadBootstrapPayload(manifest);
    const catalog = await loader.loadCatalog(manifest);
    const network = decodeBootstrap(bootstrapPayload, manifest, catalog);
    const regionalPayload = await loader.loadRegionalPayload(manifest);
    expect(regionalPayload).toBeDefined();

    const metro12 = network.linesById.get("line:IDFM:C01382");
    expect(metro12).toMatchObject({ mode: "METRO", label: "12" });

    const paths = decodeRegionalPaths(regionalPayload!, bootstrapPayload)
      .filter((path) => path.lineId === metro12?.id);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => path.geometrySource === "gtfs")).toBe(true);

    const stationIds = [...new Set(paths.flatMap((path) => path.stationIds))];
    expect(stationIds.length).toBe(metro12?.stationIds.length);

    const stations = stationIds.map((stationId) => network.stationsById.get(stationId));
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
        descriptor.modes?.includes("METRO") &&
        !(descriptor.bounds.maxX < stationBounds.minX ||
          descriptor.bounds.minX > stationBounds.maxX ||
          descriptor.bounds.maxY < stationBounds.minY ||
          descriptor.bounds.minY > stationBounds.maxY),
    );
    const detailPaths = (await Promise.all(detailDescriptors.map((descriptor) => loader.loadChunk(manifest, descriptor))))
      .flatMap((payload) => payload.paths)
      .filter((path) => path.lineId === metro12?.id);
    expect(detailPaths.length).toBeGreaterThan(0);
    expect(detailPaths.every((path) => path.geometrySource === "gtfs")).toBe(true);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.dataset.globalMapMetro12 = "true";
    document.body.appendChild(svg);
    for (const zoom of [12, 18, 20]) {
      const zoomLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      zoomLayer.dataset.zoom = String(zoom);
      svg.appendChild(zoomLayer);

      for (const stationId of stationIds) {
        const station = network.stationsById.get(stationId)!;
        const camera: CameraState = {
          centerWorldX: station.worldX,
          centerWorldY: station.worldY,
          zoom,
          bearing: 0,
          viewportWidthCssPx: 1200,
          viewportHeightCssPx: 800,
          pixelRatio: 1,
          generation: zoom,
        };
        const screenPaths = paths.map((path) => renderedVertices(path).map((vertex) => worldToScreen(vertex, camera)));
        for (const [index, screenPath] of screenPaths.entries()) {
          const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
          polyline.dataset.pathId = paths[index]!.id;
          polyline.dataset.zoom = String(zoom);
          polyline.setAttribute("points", screenPath.map((point) => `${point.x},${point.y}`).join(" "));
          zoomLayer.appendChild(polyline);
        }

        const stationPoint = worldToScreen({ x: station.worldX, y: station.worldY }, camera);
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.dataset.stationId = stationId;
        circle.dataset.zoom = String(zoom);
        circle.setAttribute("cx", String(stationPoint.x));
        circle.setAttribute("cy", String(stationPoint.y));
        zoomLayer.appendChild(circle);

        const distance = Math.min(...screenPaths.map((screenPath) => distanceToPath(stationPoint, screenPath)));
        const distanceMeters = distance / worldScaleAtZoom(zoom) * WORLD_CIRCUMFERENCE_METERS;
        expect(
          distanceMeters,
          `${stationId} detached at zoom ${zoom}: ${distance.toFixed(3)} CSS px / ${distanceMeters.toFixed(3)} m`,
        ).toBeLessThanOrEqual(MAX_STATION_PATH_ERROR_METERS);
      }

      if (zoom >= 18) {
        const detailCameraFor = (station: GlobalMapStation): CameraState => ({
          centerWorldX: station.worldX,
          centerWorldY: station.worldY,
          zoom,
          bearing: 0,
          viewportWidthCssPx: 1200,
          viewportHeightCssPx: 800,
          pixelRatio: 1,
          generation: zoom,
        });
        for (const stationId of stationIds) {
          const station = network.stationsById.get(stationId)!;
          const detailCamera = detailCameraFor(station);
          const detailScreenPaths = detailPaths.map((path) =>
            renderedVertices(path).map((vertex) => worldToScreen(vertex, detailCamera)),
          );
          const detailStationPoint = worldToScreen(
            { x: station.worldX, y: station.worldY },
            detailCamera,
          );
          const detailDistance = Math.min(
            ...detailScreenPaths.map((screenPath) => distanceToPath(detailStationPoint, screenPath)),
          );
          const detailDistanceMeters = detailDistance / worldScaleAtZoom(zoom) * WORLD_CIRCUMFERENCE_METERS;
          expect(
            detailDistanceMeters,
            `${stationId} detached from full chunk geometry at zoom ${zoom}: ${detailDistanceMeters.toFixed(3)} m`,
          ).toBeLessThanOrEqual(MAX_STATION_PATH_ERROR_METERS);
        }

        const concordeId = stationIds.find(
          (stationId) => network.stationsById.get(stationId)?.name.toLocaleLowerCase("fr-FR") === "concorde",
        );
        expect(concordeId).toBeDefined();
        const concordePath = detailPaths.find((path) => path.vertices.some((vertex) => vertex.stationId === concordeId));
        expect(concordePath).toBeDefined();
        const concordeVertexIndex = concordePath!.vertices.findIndex((vertex) => vertex.stationId === concordeId);
        expect(concordeVertexIndex).toBeGreaterThan(0);
        expect(concordeVertexIndex).toBeLessThan(concordePath!.vertices.length - 1);

        const concordePoints = renderedVertices(concordePath!).map((vertex) => worldToScreen(vertex, {
          centerWorldX: concordePath!.vertices[concordeVertexIndex]!.x,
          centerWorldY: concordePath!.vertices[concordeVertexIndex]!.y,
          zoom,
          bearing: 0,
          viewportWidthCssPx: 1200,
          viewportHeightCssPx: 800,
          pixelRatio: 1,
          generation: zoom,
        }));
        const previous = concordePoints[concordeVertexIndex - 1]!;
        const current = concordePoints[concordeVertexIndex]!;
        const next = concordePoints[concordeVertexIndex + 1]!;
        const angle = interiorAngleDegrees(previous, current, next);
        const rounded = buildRoundedPolylinePath([previous, current, next], {
          minimumPointDistance: GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding.minimumPointDistanceCssPx,
          minimumCornerSegmentLength: GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding.minimumCornerSegmentLengthCssPx,
          maximumCornerRadius: GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding.maximumCornerRadiusCssPx,
          cornerRadiusRatio: GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding.cornerRadiusRatio,
        });
        const roundedPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        roundedPath.dataset.stationId = concordeId!;
        roundedPath.dataset.zoom = String(zoom);
        roundedPath.setAttribute("d", rounded.path);
        svg.appendChild(roundedPath);

        // Concorde currently has an acute GTFS join. It is valid data only if
        // the V1/V2 renderer turns it into a curve; a raw L-L corner is the
        // regression visible in the screenshots and must fail this DOM gate.
        if (angle <= GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding.maxUnroundedInteriorAngleDegrees) {
          expect(
            rounded.corners.some((corner) => corner.mode === "rounded"),
            `Metro 12 Concorde has an unrounded ${angle.toFixed(1)}° corner at zoom ${zoom}`,
          ).toBe(true);
          expect(roundedPath.getAttribute("d"), `Metro 12 Concorde DOM path is not curved at zoom ${zoom}`).toContain("Q");
        }
      }
    }

    expect(svg.querySelectorAll("circle")).toHaveLength(stationIds.length * 3);
    expect(svg.querySelectorAll("polyline")).toHaveLength(paths.length * stationIds.length * 3);
    expect(svg.querySelectorAll('path[data-station-id="station:FR::Quay:50026416:FR1"]')).toHaveLength(2);
  });
});
