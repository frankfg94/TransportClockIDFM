import type { GlobalMapEntrance, GlobalMapLine, GlobalMapPath, GlobalMapStation } from "./manifest";
import type { CameraState } from "../geo/camera";
import type { GlobalIsochroneSurface } from "../isochrones/contracts";
import type {
  TransportMapBinaryPathPacket,
  TransportMapPreparedRenderModel,
} from "../render/transportMapRenderModel";
import type { TransportMapPerformanceTrace } from "../performance/transportMapPerformanceTrace";

export type TransportMapRendererKind =
  | "canvas2d-main-thread"
  | "canvas2d-worker"
  | "webgl2";

/** The product-level map experience, selected once by the experience factory. */
export type TransportMapExperienceKind = "legacy" | "next";

/** The basemap stack owned by a map experience. */
export type TransportMapBasemapKind = "legacy-raster" | "maplibre-vector";

/** A direction-specific quay marker supplied by the focused line view. */
export interface GlobalMapQuayMarker {
  id: string;
  stationId: string;
  name: string;
  worldX: number;
  worldY: number;
}

export type TransportMapTrafficImpactKind = "interruption" | "disturbance";

export interface TransportMapTrafficPathSpan {
  pathId: string;
  startVertexIndex: number;
  endVertexIndex: number;
  kind: TransportMapTrafficImpactKind;
  disruptionId: string;
}

export interface TransportMapRenderScene {
  /** Offline walking catchments, below all transit layers. */
  walkingIsochrones?: readonly GlobalIsochroneSurface[];
  /** Walking zones currently under the pointer, used for a subtle border emphasis. */
  hoveredIsochroneIds?: readonly string[];
  lines: GlobalMapLine[];
  paths: GlobalMapPath[];
  stations: GlobalMapStation[];
  quays?: GlobalMapQuayMarker[];
  entrances?: GlobalMapEntrance[];
  activeLineId?: string;
  activeStationId?: string;
  /** Station currently under the pointer; rendered as a larger hover target. */
  hoveredStationId?: string;
  /** Line currently under the pointer; ghost paths become fully opaque. */
  hoveredLineId?: string;
  /** Connected lines kept visible as a V1-style station ghost overlay. */
  ghostLineIds?: string[];
  /** Stations whose entrances belong to the active station/ghost context. */
  entranceStationIds?: string[];
  selectedStationIds: string[];
  visibleModeMask: number;
  interruptionLineIds?: string[];
  disturbanceLineIds?: string[];
  interruptedStationIds?: string[];
  disturbedStationIds?: string[];
  trafficPathSpans?: TransportMapTrafficPathSpan[];
  /** True while camera motion is being presented from the bounded path cache. */
  interactionActive?: boolean;
  /**
   * A programmatic line flight may present newly preloaded geometry while
   * its binary Deck packet is still compiling. Pointer gestures keep the
   * default atomic frame swap behaviour.
   */
  allowGeometrySwapDuringInteraction?: boolean;
}

export interface TransportMapRendererMetrics {
  renderer: TransportMapRendererKind;
  drawCalls: number;
  visiblePathCount: number;
  visibleStationCount: number;
  /** Number of vertices in the currently prepared transport model, when known. */
  visibleVertexCount?: number;
  renderMs: number;
  cacheBytes: number;
  /** True when the focused line was redrawn instead of using the path cache. */
  focusedLineLiveRedraw: boolean;
  /** Number of real cache canvas copies performed by this render call. */
  pathCacheCaptureCount: 0 | 1;
  /** Time spent in cache clearRect + drawImage for this render call. */
  pathCacheCaptureMs: number;
  /** Bytes copied into the cache canvas for this render call. */
  pathCacheCapturedBytes: number;
  /** Optional Deck/binary pipeline counters. Canvas2D leaves these undefined. */
  binaryCacheBytes?: number;
  binaryCacheEntries?: number;
  binaryCacheHits?: number;
  binaryCacheMisses?: number;
  binaryCacheEvictions?: number;
  binaryCompileMs?: number;
  binaryCompileBytes?: number;
  /** Number of binary packet compiles currently waiting on the compiler. */
  binaryCompileInProgress?: number;
  basePacketBuilds?: number;
  trafficPacketBuilds?: number;
  stationPacketBuilds?: number;
  deckLayerRebuilds?: number;
  geometryPacketReuses?: number;
  deckSetPropsCount?: number;
  /** Number of binary path packets promoted to an active Deck layer. */
  binaryLayerActivations?: number;
  /** Presented frames where at least one path layer used binary attributes. */
  binaryLayerFrames?: number;
  /** Presented path frames still using object records for at least one layer. */
  objectFallbackFrames?: number;
  /** Binary packets that completed while interaction was active and were held. */
  binaryPromotionDeferredDuringInteraction?: number;
  /** Last-role path model reuse/build counters for the Deck renderer. */
  pathModelBuildCount?: number;
  pathModelReuseCount?: number;
  pathModelBuildMs?: number;
  pathModelWorstMs?: number;
  /** Latest one-second performance window reported by Deck itself. */
  deck?: TransportMapDeckMetrics;
}

export interface TransportMapDeckMetrics {
  fps: number;
  setPropsTime: number;
  layersCount: number;
  drawLayersCount: number;
  updateLayersCount: number;
  updateAttributesTime: number;
  updateAttributesCount: number;
  framesRedrawn: number;
  gpuTime: number;
  gpuTimePerFrame: number;
  cpuTime: number;
  cpuTimePerFrame: number;
  bufferMemory: number;
  textureMemory: number;
  renderbufferMemory: number;
  gpuMemory: number;
  sampledAtMs: number;
  sampleAgeMs: number;
  windowFrames: number;
}

export interface TransportMapRenderFrame {
  camera: CameraState;
  scene: TransportMapRenderScene;
  model: TransportMapPreparedRenderModel;
  binaryPackets?: {
    base?: TransportMapBinaryPathPacket;
    traffic?: TransportMapBinaryPathPacket;
    highlight?: TransportMapBinaryPathPacket;
  };
}

/** Host boundary used by non-Canvas experiences to present a prepared frame. */
export interface TransportMapRendererHost {
  present(frame: TransportMapRenderFrame): void;
  resize(widthCssPx: number, heightCssPx: number, pixelRatio: number): void;
  /** Optional diagnostics for hosts that reconcile an overlay layer set. */
  getPresentationMetrics?(): {
    layerRebuilds: number;
    setPropsCount: number;
    deck?: TransportMapDeckMetrics;
  };
  dispose(): void;
}

export interface TransportMapRenderer {
  readonly kind: TransportMapRendererKind;
  mount(canvas: HTMLCanvasElement): void;
  resize(widthCssPx: number, heightCssPx: number, pixelRatio: number): void;
  render(camera: CameraState, scene: TransportMapRenderScene): void;
  /** Optional low-overhead causal instrumentation for debug benchmarks. */
  setPerformanceTrace?(trace: TransportMapPerformanceTrace | undefined): void;
  /** Optional host attachment used by the MapLibre/Deck strategy. */
  attachHost?(host: TransportMapRendererHost): void;
  detachHost?(host?: TransportMapRendererHost): void;
  hitCanvasPoint?(point: { x: number; y: number }): { type: "line" | "station"; id: string } | undefined;
  getMetrics(): TransportMapRendererMetrics;
  dispose(): void;
}
