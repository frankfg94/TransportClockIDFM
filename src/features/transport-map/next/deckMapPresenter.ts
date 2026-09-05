import type { Map as MapLibreMap } from "maplibre-gl";
import type {
  TransportMapDeckMetrics,
  TransportMapRenderFrame,
  TransportMapRendererHost,
} from "../contracts/renderer";
import type { TransportMapPreparedRenderModel } from "../render/transportMapRenderModel";
import { cameraStateToMapLibreView } from "./nextMapCamera";
import { createDeckTransportLayers } from "./deckMapLayers";
import type { TransportMapPerformanceTrace } from "../performance/transportMapPerformanceTrace";

export interface DeckOverlayLike {
  setProps(props: any): void;
}

/** Bridges the shared renderer strategy to MapLibre's official overlay. */
export class MapLibreDeckOverlayPresenter implements TransportMapRendererHost {
  private lastFrame?: TransportMapRenderFrame;
  private layers?: ReturnType<typeof createDeckTransportLayers>;
  private lastLayerModel?: TransportMapPreparedRenderModel;
  private lastBinaryPackets?: TransportMapRenderFrame["binaryPackets"];
  private lastBeforeId?: string;
  private layerRebuilds = 0;
  private setPropsCount = 0;
  private deckMetrics?: Omit<TransportMapDeckMetrics, "sampleAgeMs">;
  private performanceTrace?: TransportMapPerformanceTrace;

  constructor(
    private readonly map: MapLibreMap,
    private readonly overlay: DeckOverlayLike,
  ) {}

  setPerformanceTrace(trace: TransportMapPerformanceTrace | undefined): void {
    this.performanceTrace = trace;
  }

  present(frame: TransportMapRenderFrame): void {
    this.lastFrame = frame;
    const cameraChanged = syncCameraToMapLibre(this.map, frame);
    const beforeId = firstSymbolLayerId(this.map);
    const layersChanged =
      !this.layers ||
      this.lastLayerModel !== frame.model ||
      binaryPacketsChanged(this.lastBinaryPackets, frame.binaryPackets) ||
      this.lastBeforeId !== beforeId;
    if (layersChanged) {
      const previousModel = this.lastLayerModel;
      const binaryChanged = binaryPacketsChanged(this.lastBinaryPackets, frame.binaryPackets);
      const modelChanged = previousModel !== frame.model;
      const reason = binaryChanged
        ? "binary_promoted"
        : modelChanged
          ? previousModel?.sceneVersion !== frame.model.sceneVersion
            ? "chunk_set_changed"
            : "geometry_changed"
          : "style_changed";
      for (const [layerId, changed] of [
        ["transport-base", modelChanged || binaryChanged],
        ["traffic", previousModel?.trafficPaths !== frame.model.trafficPaths || binaryChanged],
        ["stations", previousModel?.stations !== frame.model.stations],
      ] as const) {
        if (!changed) continue;
        const layerReason = layerId === "traffic" && previousModel?.trafficPaths !== frame.model.trafficPaths
          ? "traffic_changed"
          : layerId === "stations" && previousModel?.stations !== frame.model.stations
            ? "selection_changed"
            : reason;
        this.activeTrace?.instant("deck_data_changed", {
          layerId,
          reason: layerReason,
          previousGeneration: previousModel?.sceneVersion,
          newGeneration: frame.model.sceneVersion,
          previousId: previousModel ? `${layerId}:${previousModel.sceneVersion}` : undefined,
          newId: `${layerId}:${frame.model.sceneVersion}`,
        });
      }
      const rebuildEventId = this.activeTrace?.begin("deck_layer_rebuild", {
        reason,
        sceneVersion: frame.model.sceneVersion,
        pathCount: frame.model.pathCount,
        stationCount: frame.model.stations.length,
      });
      this.layers = createDeckTransportLayers(frame, beforeId);
      this.activeTrace?.end(rebuildEventId, {
        reason,
        layerCount: this.layers.length,
      });
      const setPropsEventId = this.activeTrace?.begin("deck_set_props", {
        reason,
        layerCount: this.layers.length,
      }, rebuildEventId);
      this.overlay.setProps({ layers: this.layers });
      this.activeTrace?.end(setPropsEventId, {
        reason,
        layerCount: this.layers.length,
        setPropsTime: this.deckMetrics?.setPropsTime,
        cpuTime: this.deckMetrics?.cpuTime,
        gpuTime: this.deckMetrics?.gpuTime,
      });
      this.lastLayerModel = frame.model;
      this.lastBinaryPackets = frame.binaryPackets;
      this.lastBeforeId = beforeId;
      this.layerRebuilds += 1;
      this.setPropsCount += 1;
      this.activeTrace?.instant("scene_publish", {
        reason,
        sceneVersion: frame.model.sceneVersion,
        pathCount: frame.model.pathCount,
        stationCount: frame.model.stations.length,
        vertexCount: frame.model.vertexCount,
      });
    }
    // `jumpTo` already schedules a MapLibre render when the camera changes.
    // Avoid forcing another repaint for duplicate camera-only frames; this is
    // particularly important while the itinerary preview is being panned.
    if (cameraChanged || layersChanged) this.map.triggerRepaint();
  }

  refresh(): void {
    if (!this.lastFrame) return;
    // A style reload or a restored context can invalidate the overlay even
    // when the transport model identity is unchanged.
    this.layers = undefined;
    this.present(this.lastFrame);
  }

  resize(_widthCssPx: number, _heightCssPx: number, pixelRatio: number): void {
    this.map.setPixelRatio(Math.max(1, pixelRatio));
    this.map.resize();
    this.map.triggerRepaint();
  }

  dispose(): void {
    this.lastFrame = undefined;
    this.layers = undefined;
    this.lastLayerModel = undefined;
    this.lastBinaryPackets = undefined;
    this.deckMetrics = undefined;
  }

  recordDeckMetrics(metrics: Omit<TransportMapDeckMetrics, "sampleAgeMs">): void {
    this.deckMetrics = { ...metrics };
    if (metrics.updateAttributesCount > 0 || metrics.updateAttributesTime > 0) {
      this.activeTrace?.recordDuration("deck_update_attributes", metrics.updateAttributesTime, {
        updateAttributesCount: metrics.updateAttributesCount,
        updateAttributesTime: metrics.updateAttributesTime,
        cpuTime: metrics.cpuTime,
        cpuTimePerFrame: metrics.cpuTimePerFrame,
        gpuTime: metrics.gpuTime,
        gpuTimePerFrame: metrics.gpuTimePerFrame,
        setPropsTime: metrics.setPropsTime,
        layersCount: metrics.layersCount,
        drawLayersCount: metrics.drawLayersCount,
        updateLayersCount: metrics.updateLayersCount,
        windowFrames: metrics.framesRedrawn,
      });
    }
  }

  getPresentationMetrics(): { layerRebuilds: number; setPropsCount: number; deck?: TransportMapDeckMetrics } {
    const now = typeof performance === "undefined" ? Date.now() : performance.now();
    return {
      layerRebuilds: this.layerRebuilds,
      setPropsCount: this.setPropsCount,
      deck: this.deckMetrics
        ? {
            ...this.deckMetrics,
            sampleAgeMs: Math.max(0, now - this.deckMetrics.sampledAtMs),
          }
        : undefined,
    };
  }

  private get activeTrace(): TransportMapPerformanceTrace | undefined {
    return this.performanceTrace?.isRunning ? this.performanceTrace : undefined;
  }
}

function binaryPacketsChanged(
  previous: TransportMapRenderFrame["binaryPackets"],
  next: TransportMapRenderFrame["binaryPackets"],
): boolean {
  return previous?.base !== next?.base ||
    previous?.traffic !== next?.traffic ||
    previous?.highlight !== next?.highlight;
}

export function syncCameraToMapLibre(
  map: Pick<MapLibreMap, "getCenter" | "getZoom" | "jumpTo">,
  frame: Pick<TransportMapRenderFrame, "camera">,
): boolean {
  const view = cameraStateToMapLibreView(frame.camera);
  const currentCenter = map.getCenter();
  const changed =
    Math.abs(currentCenter.lng - view.center[0]) > 1e-10 ||
    Math.abs(currentCenter.lat - view.center[1]) > 1e-10 ||
    Math.abs(map.getZoom() - view.zoom) > 1e-6;
  if (changed) map.jumpTo(view);
  return changed;
}

export function firstSymbolLayerId(
  map: Pick<MapLibreMap, "getStyle">,
): string | undefined {
  return map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
}
