import type { WalkingIsochroneGeometry } from "../../../shared/walkingIsochroneGeometry";
import type { CameraState } from "../geo/camera";
import { boundsIntersect, lonLatToWorld, visibleWorldBounds, worldScaleAtZoom } from "../geo/coordinateKernel";
import type { GlobalMapBounds } from "../contracts/manifest";
import type { GlobalIsochroneSurface } from "./contracts";

interface PreparedPolygon { bounds: GlobalMapBounds; rings: Float64Array[] }

/** Projection is cached by immutable geometry identity, independently of hover/camera. */
export class GlobalIsochroneCanvasLayer {
  private cache = new WeakMap<WalkingIsochroneGeometry, PreparedPolygon[]>();

  draw(
    context: CanvasRenderingContext2D,
    camera: CameraState,
    surfaces: readonly GlobalIsochroneSurface[] = [],
    hoveredSurfaceIds: readonly string[] = [],
  ): number {
    if (!surfaces.length) return 0;
    const scale = worldScaleAtZoom(camera.zoom);
    const bounds = visibleWorldBounds(camera);
    const hoveredIds = new Set(hoveredSurfaceIds);
    let calls = 0;
    context.save();
    context.globalAlpha = 1;
    context.setLineDash([]);
    context.fillStyle = "rgba(59, 130, 246, 0.14)";
    for (const surface of surfaces) {
      const hovered = hoveredIds.has(surface.id);
      context.strokeStyle = hovered
        ? "rgba(29, 78, 216, 0.92)"
        : "rgba(59, 130, 246, 0.60)";
      context.lineWidth = hovered ? 2 : 1;
      for (const polygon of this.prepare(surface.geometry)) {
        if (!boundsIntersect(bounds, polygon.bounds)) continue;
        context.beginPath();
        for (const ring of polygon.rings) {
          for (let i = 0; i < ring.length; i += 2) {
            const x = (ring[i]! - camera.centerWorldX) * scale + camera.viewportWidthCssPx / 2;
            const y = (ring[i + 1]! - camera.centerWorldY) * scale + camera.viewportHeightCssPx / 2;
            if (i === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.closePath();
        }
        context.fill("evenodd");
        context.stroke();
        calls += 2;
      }
    }
    context.restore();
    return calls;
  }

  clear(): void { this.cache = new WeakMap(); }

  private prepare(geometry: WalkingIsochroneGeometry): PreparedPolygon[] {
    const cached = this.cache.get(geometry);
    if (cached) return cached;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    const result = polygons.map((polygon) => {
      const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      const rings = polygon.map((ring) => {
        const result = new Float64Array(ring.length * 2);
        ring.forEach(([lon, lat], i) => {
          const point = lonLatToWorld({ lon, lat });
          result[i * 2] = point.x;
          result[i * 2 + 1] = point.y;
          bounds.minX = Math.min(bounds.minX, point.x); bounds.maxX = Math.max(bounds.maxX, point.x);
          bounds.minY = Math.min(bounds.minY, point.y); bounds.maxY = Math.max(bounds.maxY, point.y);
        });
        return result;
      });
      return { bounds, rings };
    });
    this.cache.set(geometry, result);
    return result;
  }
}
