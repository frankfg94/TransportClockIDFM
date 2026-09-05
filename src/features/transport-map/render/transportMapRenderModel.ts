import type {
  GlobalMapEntrance,
  GlobalMapLine,
  GlobalMapMode,
  GlobalMapPath,
  GlobalMapStation,
} from "../contracts/manifest";
import type {
  GlobalMapQuayMarker,
  TransportMapRenderScene,
  TransportMapTrafficImpactKind,
} from "../contracts/renderer";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../config/globalTransportPlanConfig";
import { worldToLonLat, type LonLatPoint, type WorldPoint } from "../geo/coordinateKernel";
import {
  PreparedWorldPathGeometryCache,
  type PreparedWorldPathSubpath,
} from "./preparedPathGeometry";
import {
  resolveTransportMapPathStyle,
  type MutableTransportMapPathStyle,
  type TransportMapPathDash,
} from "./pathRenderStyle";
import { TransportMapRenderSceneIndex } from "./renderSceneIndex";
import { isStationNodeVisible } from "./stationNodeVisibility";
import {
  resolveTransportMapLabelPlacements,
  type TransportMapLabelPlacementCamera,
  type TransportMapLabelPlacementCandidate,
} from "./stationLabelPlacement";
import {
  TRAFFIC_DISTURBANCE_COLOR,
  TRAFFIC_INTERRUPTION_COLOR,
  TRAFFIC_INTERRUPTION_GAP_COLOR,
} from "./trafficStyleTokens";

export type TransportMapRgba = readonly [number, number, number, number];

/** A prepared path record accepted by both the binary compiler and Deck. */
export interface TransportMapPathRenderRecord {
  readonly id: string;
  readonly pathId: string;
  readonly lineId: string;
  readonly subpathIndex: number;
  /** Flat [longitude, latitude, ...] Float64 data, prepared once per path. */
  readonly positions: Float64Array;
  readonly color: TransportMapRgba;
  readonly widthCssPx: number;
  readonly alpha: number;
  readonly order: number;
  readonly dash: TransportMapPathDash;
  readonly trafficKind?: TransportMapTrafficImpactKind;
}

export interface TransportMapStationRenderRecord {
  readonly id: string;
  readonly position: readonly [number, number];
  readonly radiusCssPx: number;
  readonly fillColor: TransportMapRgba;
  readonly lineColor: TransportMapRgba;
  readonly lineWidthCssPx: number;
  readonly interrupted: boolean;
  readonly disturbed: boolean;
}

export interface TransportMapQuayRenderRecord {
  readonly id: string;
  readonly stationId: string;
  readonly name: string;
  readonly position: readonly [number, number];
  readonly color: TransportMapRgba;
  readonly radiusCssPx: number;
}

export interface TransportMapEntranceRenderRecord {
  readonly id: string;
  readonly stationId: string;
  readonly name: string;
  readonly code?: string | null;
  readonly position: readonly [number, number];
  readonly color: TransportMapRgba;
  readonly radiusCssPx: number;
}

export interface TransportMapLabelRenderRecord {
  readonly id: string;
  readonly text: string;
  readonly position: readonly [number, number];
  /** Fixed CSS-pixel offset applied by screen-space label renderers. */
  readonly pixelOffsetCssPx?: readonly [number, number];
  /** Horizontal anchor chosen by the shared screen-space label placement. */
  readonly textAnchor?: "start" | "middle" | "end";
  readonly sizeCssPx: number;
  readonly color: TransportMapRgba;
  readonly priority: number;
}

export interface TransportMapBinaryPathPacket {
  readonly key: string;
  readonly length: number;
  readonly pathCount: number;
  readonly positions: Float64Array;
  readonly startIndices: Uint32Array;
  readonly colors: Uint8Array;
  readonly widths: Float32Array;
  /** Two values per path, consumed by PathStyleExtension when dashed. */
  readonly dashArrays: Float32Array;
  readonly pathIds: readonly string[];
  readonly lineIds: readonly string[];
  readonly bytes: number;
}

/** Backend-neutral data prepared from TransportMapRenderScene. */
export interface TransportMapPreparedRenderModel {
  readonly walkingIsochrones?: TransportMapRenderScene["walkingIsochrones"];
  readonly sceneVersion: number;
  /** Legacy alias for the base path identity. */
  readonly pathIdentity?: string;
  /** Stable short identities for the actual binary path/style inputs. */
  readonly basePathIdentity?: string;
  readonly trafficPathIdentity?: string;
  readonly highlightPathIdentity?: string;
  /** Increments only when source geometry references change. */
  readonly geometryVersion?: number;
  readonly pathCount: number;
  readonly vertexCount: number;
  readonly basePaths: readonly TransportMapPathRenderRecord[];
  readonly trafficPaths: readonly TransportMapPathRenderRecord[];
  readonly highlightPaths: readonly TransportMapPathRenderRecord[];
  readonly stations: readonly TransportMapStationRenderRecord[];
  readonly quays: readonly TransportMapQuayRenderRecord[];
  readonly entrances: readonly TransportMapEntranceRenderRecord[];
  readonly labels: readonly TransportMapLabelRenderRecord[];
}

interface PathGeometryCacheEntry {
  readonly positions: Float64Array;
  readonly vertexCount: number;
}

interface PathRecordCacheEntry {
  readonly base: Map<string, TransportMapPathRenderRecord>;
  readonly highlight: Map<string, TransportMapPathRenderRecord>;
  readonly traffic: Map<string, TransportMapPathRenderRecord>;
}

interface PathBuildCache {
  readonly source: GlobalMapPath[];
  readonly baseKey: string;
  readonly trafficKey: string;
  readonly highlightKey: string;
  readonly basePaths: readonly TransportMapPathRenderRecord[];
  readonly trafficPaths: readonly TransportMapPathRenderRecord[];
  readonly highlightPaths: readonly TransportMapPathRenderRecord[];
  readonly pathCount: number;
  readonly vertexCount: number;
}

/**
 * Prepares one scene for the rendering strategy selected by the factory.
 * Screen projection is deliberately absent: MapLibre/Deck and Canvas each
 * project these stable world-derived records in their own presentation step.
 */
export class TransportMapRenderModelBuilder {
  private readonly sceneIndex = new TransportMapRenderSceneIndex();
  private readonly worldGeometry = new PreparedWorldPathGeometryCache();
  private readonly lonLatBySubpath = new WeakMap<object, PathGeometryCacheEntry>();
  private readonly recordsByPath = new WeakMap<GlobalMapPath, PathRecordCacheEntry>();
  private readonly identityTokens = new WeakMap<object, number>();
  private nextIdentity = 1;
  /** Last complete path bundle; each role has its own dependency key. */
  private previousPathBuild?: PathBuildCache;
  private previousStationsSource?: GlobalMapStation[];
  private previousStations: readonly TransportMapStationRenderRecord[] = [];
  private previousQuaysSource?: GlobalMapQuayMarker[];
  private previousEntrancesSource?: GlobalMapEntrance[];
  private previousMarkerKey?: string;
  private previousQuays: readonly TransportMapQuayRenderRecord[] = [];
  private previousEntrances: readonly TransportMapEntranceRenderRecord[] = [];
  private previousLabelsKey?: string;
  private previousLabels: readonly TransportMapLabelRenderRecord[] = [];
  private previousModel?: TransportMapPreparedRenderModel;
  private previousModelKey?: string;
  private previousPathDependencyKey?: string;
  private pathGeneration = 0;
  private previousBasePathDependencyKey?: string;
  private basePathGeneration = 0;
  private previousTrafficPathDependencyKey?: string;
  private trafficPathGeneration = 0;
  private previousHighlightPathDependencyKey?: string;
  private highlightPathGeneration = 0;
  private previousMarkerDependencyKey?: string;
  private markerGeneration = 0;
  private previousLabelsDependencyKey?: string;
  private labelsGeneration = 0;
  private previousGeometryDependencyKey?: string;
  private geometryVersion = 0;
  private readonly styleScratch: MutableTransportMapPathStyle = {
    visible: false,
    active: false,
    ghost: false,
    hovered: false,
    trafficKind: undefined,
    alpha: 1,
    lineWidthCssPx: 0,
    nativeColor: "",
    dash: "solid",
    order: 0,
  };

  build(camera: TransportMapLabelPlacementCamera, scene: TransportMapRenderScene): TransportMapPreparedRenderModel {
    this.sceneIndex.update(scene);
    this.worldGeometry.setStationsSource(scene.stations);

    // The itinerary preview deliberately suppresses the transport network.
    // Its camera still changes while the route is fitted or panned, but there
    // is no camera-dependent transport data to rebuild. Returning the already
    // prepared empty model avoids creating a new Deck model whenever a zoom
    // bucket changes during the camera animation.
    if (
      this.previousModel &&
      isEmptyTransportMapScene(scene) &&
      isEmptyTransportMapModel(this.previousModel)
    ) {
      return this.previousModel;
    }

    const geometryDependencyKey = [
      this.identityToken(scene.paths),
      this.identityToken(scene.lines),
      this.identityToken(scene.stations),
      this.identityToken(scene.quays),
      this.identityToken(scene.entrances),
    ].join(":");
    if (this.previousGeometryDependencyKey !== geometryDependencyKey) {
      this.previousGeometryDependencyKey = geometryDependencyKey;
      this.geometryVersion += 1;
    }

    // Keep the full bundle dependency separate from the identity of each
    // binary role. A scene/marker update can rebuild the model without
    // changing the base path packet, and traffic/hover changes should not
    // invalidate unrelated roles.
    const basePathDependencyKey = [
      this.identityToken(scene.paths),
      this.identityToken(scene.lines),
      stableIdList(scene.ghostLineIds),
      stableIdList(scene.interruptionLineIds),
      stableIdList(scene.disturbanceLineIds),
      scene.activeLineId ?? "",
      scene.visibleModeMask,
      camera.zoom < GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.overviewHeavyLineWidthMaxZoom ? 0 : 1,
    ].join("|");
    if (this.previousBasePathDependencyKey !== basePathDependencyKey) {
      this.previousBasePathDependencyKey = basePathDependencyKey;
      this.basePathGeneration += 1;
    }
    const trafficPathDependencyKey = [
      basePathDependencyKey,
      this.identityToken(scene.trafficPathSpans),
    ].join("|");
    if (this.previousTrafficPathDependencyKey !== trafficPathDependencyKey) {
      this.previousTrafficPathDependencyKey = trafficPathDependencyKey;
      this.trafficPathGeneration += 1;
    }
    const highlightPathDependencyKey = [
      this.identityToken(scene.paths),
      this.identityToken(scene.lines),
      stableIdList(scene.ghostLineIds),
      stableIdList(scene.interruptionLineIds),
      stableIdList(scene.disturbanceLineIds),
      scene.activeLineId ?? "",
      scene.hoveredLineId ?? "",
      scene.visibleModeMask,
      camera.zoom < GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.overviewHeavyLineWidthMaxZoom ? 0 : 1,
    ].join("|");
    if (this.previousHighlightPathDependencyKey !== highlightPathDependencyKey) {
      this.previousHighlightPathDependencyKey = highlightPathDependencyKey;
      this.highlightPathGeneration += 1;
    }
    const pathDependencyKey = [
      basePathDependencyKey,
      trafficPathDependencyKey,
      highlightPathDependencyKey,
    ].join("|");
    if (this.previousPathDependencyKey !== pathDependencyKey) {
      this.previousPathDependencyKey = pathDependencyKey;
      this.pathGeneration += 1;
    }
    const pathKey = `path-${this.pathGeneration}`;

    const markerDependencyKey = [
      this.identityToken(scene.stations),
      this.identityToken(scene.quays),
      this.identityToken(scene.entrances),
      stableIdList(scene.ghostLineIds),
      stableIdList(scene.entranceStationIds),
      scene.activeStationId ?? "",
      scene.hoveredStationId ?? "",
      stableIdList(scene.selectedStationIds),
      camera.zoom >= 12 ? 1 : 0,
      camera.zoom >= 14 ? 1 : 0,
      camera.zoom >= 15 ? 1 : 0,
    ].join("|");
    if (this.previousMarkerDependencyKey !== markerDependencyKey) {
      this.previousMarkerDependencyKey = markerDependencyKey;
      this.markerGeneration += 1;
    }
    const markerKey = `marker-${this.markerGeneration}`;

    const labelsDependencyKey = [
      this.identityToken(scene.paths),
      this.identityToken(scene.stations),
      this.identityToken(scene.lines),
      this.identityToken(scene.entrances),
      scene.activeLineId ?? "",
      scene.activeStationId ?? "",
      stableIdList(scene.selectedStationIds),
      labelLayoutZoomKey(camera.zoom),
    ].join("|");
    if (this.previousLabelsDependencyKey !== labelsDependencyKey) {
      this.previousLabelsDependencyKey = labelsDependencyKey;
      this.labelsGeneration += 1;
    }
    const labelKey = `labels-${this.labelsGeneration}`;
    const modelKey = `${pathKey}|${markerKey}|${labelKey}|iso:${this.identityToken(scene.walkingIsochrones)}|iso-hover:${stableIdList(scene.hoveredIsochroneIds)}`;
    if (this.previousModel && this.previousModelKey === modelKey) return this.previousModel;

    const pathBundle = this.buildPaths(
      basePathDependencyKey,
      trafficPathDependencyKey,
      highlightPathDependencyKey,
      scene,
      camera.zoom,
    );
    const markers = this.buildMarkers(markerKey, scene, camera.zoom);
    const labels = this.buildLabels(labelKey, scene, camera);
    const model: TransportMapPreparedRenderModel = Object.freeze({
      walkingIsochrones: scene.walkingIsochrones,
      sceneVersion: this.sceneIndex.version,
      pathIdentity: `base-path-${this.basePathGeneration}`,
      basePathIdentity: `base-path-${this.basePathGeneration}`,
      trafficPathIdentity: `traffic-path-${this.trafficPathGeneration}`,
      highlightPathIdentity: `highlight-path-${this.highlightPathGeneration}`,
      geometryVersion: this.geometryVersion,
      pathCount: pathBundle.pathCount,
      vertexCount: pathBundle.vertexCount,
      basePaths: pathBundle.basePaths,
      trafficPaths: pathBundle.trafficPaths,
      highlightPaths: pathBundle.highlightPaths,
      stations: markers.stations,
      quays: markers.quays,
      entrances: markers.entrances,
      labels,
    });
    this.previousModel = model;
    this.previousModelKey = modelKey;
    return model;
  }

  dispose(): void {
    this.sceneIndex.dispose();
    this.worldGeometry.clear();
    this.previousModel = undefined;
    this.previousPathBuild = undefined;
    this.previousStationsSource = undefined;
    this.previousQuaysSource = undefined;
    this.previousEntrancesSource = undefined;
    this.previousPathDependencyKey = undefined;
    this.previousBasePathDependencyKey = undefined;
    this.previousTrafficPathDependencyKey = undefined;
    this.previousHighlightPathDependencyKey = undefined;
    this.previousMarkerDependencyKey = undefined;
    this.previousLabelsDependencyKey = undefined;
    this.previousGeometryDependencyKey = undefined;
    this.pathGeneration = 0;
    this.basePathGeneration = 0;
    this.trafficPathGeneration = 0;
    this.highlightPathGeneration = 0;
    this.markerGeneration = 0;
    this.labelsGeneration = 0;
    this.geometryVersion = 0;
    this.previousStations = [];
    this.previousQuays = [];
    this.previousEntrances = [];
    this.previousLabels = [];
  }

  private identityToken(value: object | undefined): string {
    if (!value) return "0";
    const existing = this.identityTokens.get(value);
    if (existing !== undefined) return String(existing);
    const token = this.nextIdentity++;
    this.identityTokens.set(value, token);
    return String(token);
  }

  private buildPaths(
    baseKey: string,
    trafficKey: string,
    highlightKey: string,
    scene: TransportMapRenderScene,
    zoom: number,
  ) {
    const previous = this.previousPathBuild;
    if (previous?.source === scene.paths && previous.baseKey === baseKey) {
      let next = previous;
      if (previous.trafficKey !== trafficKey) {
        next = {
          ...next,
          trafficKey,
          trafficPaths: this.buildTrafficPaths(scene, zoom),
        };
      }
      if (previous.highlightKey !== highlightKey) {
        next = {
          ...next,
          highlightKey,
          highlightPaths: this.buildHighlightPaths(scene, zoom),
        };
      }
      if (next !== previous) this.previousPathBuild = next;
      return next;
    }

    const basePaths: TransportMapPathRenderRecord[] = [];
    const trafficPaths: TransportMapPathRenderRecord[] = [];
    const highlightPaths: TransportMapPathRenderRecord[] = [];
    let vertexCount = 0;
    for (const path of scene.paths) {
      const line = this.sceneIndex.linesById.get(path.lineId);
      if (!line) continue;
      const prepared = this.worldGeometry.get(path, line.mode, this.sceneIndex.stationsById);
      if (!resolveTransportMapPathStyle({
        line,
        scene,
        highlighted: false,
        ghostLineIds: this.sceneIndex.ghostLineIds,
        interruptionLines: this.sceneIndex.interruptionLineIds,
        disturbanceLines: this.sceneIndex.disturbanceLineIds,
        visibleLineIds: this.sceneIndex.visibleLineIds,
        zoom,
      }, this.styleScratch)) continue;

      for (let subpathIndex = 0; subpathIndex < prepared.subpaths.length; subpathIndex += 1) {
        const subpath = prepared.subpaths[subpathIndex]!;
        const positions = this.getLonLatPositions(subpath);
        if (positions.length < 4) continue;
        const base = this.getPathRecord(path, subpath, subpathIndex, positions, this.styleScratch, false, undefined, undefined, undefined, undefined);
        basePaths.push(base);
        vertexCount += subpath.worldPoints.length;

        if (scene.hoveredLineId === line.id) {
          const highlightStyle = this.resolveStyle(line, scene, zoom, true);
          highlightPaths.push(this.getPathRecord(path, subpath, subpathIndex, positions, highlightStyle, true, undefined, undefined, undefined, undefined));
        }

        const subpathRanges = this.sceneIndex.trafficRanges.getForSubpath(
          subpath,
          subpath.start,
          subpath.end,
          path.id,
        );
        if (subpathRanges.length > 0) {
          for (const range of subpathRanges) {
            if (!range.kind || range.endVertexIndex <= range.startVertexIndex) continue;
            this.appendTrafficRecords(
              trafficPaths,
              path,
              subpath,
              subpathIndex,
              positions,
              range.startVertexIndex,
              range.endVertexIndex,
              range.kind,
              this.styleScratch,
              `${range.startVertexIndex}:${range.endVertexIndex}`,
            );
          }
        } else if (this.styleScratch.trafficKind) {
          this.appendTrafficRecords(
            trafficPaths,
            path,
            subpath,
            subpathIndex,
            positions,
            subpath.start,
            subpath.end - 1,
            this.styleScratch.trafficKind,
            this.styleScratch,
            `${subpath.start}:${subpath.end - 1}`,
          );
        }
      }
    }

    const bundle: PathBuildCache = {
      source: scene.paths,
      baseKey,
      trafficKey,
      highlightKey,
      basePaths,
      trafficPaths,
      highlightPaths,
      pathCount: basePaths.length,
      vertexCount,
    };
    this.previousPathBuild = bundle;
    return bundle;
  }

  private buildTrafficPaths(
    scene: TransportMapRenderScene,
    zoom: number,
  ): readonly TransportMapPathRenderRecord[] {
    const trafficPaths: TransportMapPathRenderRecord[] = [];
    for (const path of scene.paths) {
      const line = this.sceneIndex.linesById.get(path.lineId);
      if (!line) continue;
      const prepared = this.worldGeometry.get(path, line.mode, this.sceneIndex.stationsById);
      if (!resolveTransportMapPathStyle({
        line,
        scene,
        highlighted: false,
        ghostLineIds: this.sceneIndex.ghostLineIds,
        interruptionLines: this.sceneIndex.interruptionLineIds,
        disturbanceLines: this.sceneIndex.disturbanceLineIds,
        visibleLineIds: this.sceneIndex.visibleLineIds,
        zoom,
      }, this.styleScratch)) continue;

      for (let subpathIndex = 0; subpathIndex < prepared.subpaths.length; subpathIndex += 1) {
        const subpath = prepared.subpaths[subpathIndex]!;
        const positions = this.getLonLatPositions(subpath);
        if (positions.length < 4) continue;
        const subpathRanges = this.sceneIndex.trafficRanges.getForSubpath(
          subpath,
          subpath.start,
          subpath.end,
          path.id,
        );
        if (subpathRanges.length > 0) {
          for (const range of subpathRanges) {
            if (!range.kind || range.endVertexIndex <= range.startVertexIndex) continue;
            this.appendTrafficRecords(
              trafficPaths,
              path,
              subpath,
              subpathIndex,
              positions,
              range.startVertexIndex,
              range.endVertexIndex,
              range.kind,
              this.styleScratch,
              `${range.startVertexIndex}:${range.endVertexIndex}`,
            );
          }
        } else if (this.styleScratch.trafficKind) {
          this.appendTrafficRecords(
            trafficPaths,
            path,
            subpath,
            subpathIndex,
            positions,
            subpath.start,
            subpath.end - 1,
            this.styleScratch.trafficKind,
            this.styleScratch,
            `${subpath.start}:${subpath.end - 1}`,
          );
        }
      }
    }
    return trafficPaths;
  }

  private buildHighlightPaths(
    scene: TransportMapRenderScene,
    zoom: number,
  ): readonly TransportMapPathRenderRecord[] {
    const highlightPaths: TransportMapPathRenderRecord[] = [];
    if (!scene.hoveredLineId) return highlightPaths;
    for (const path of scene.paths) {
      const line = this.sceneIndex.linesById.get(path.lineId);
      if (!line || line.id !== scene.hoveredLineId) continue;
      const prepared = this.worldGeometry.get(path, line.mode, this.sceneIndex.stationsById);
      if (!resolveTransportMapPathStyle({
        line,
        scene,
        highlighted: false,
        ghostLineIds: this.sceneIndex.ghostLineIds,
        interruptionLines: this.sceneIndex.interruptionLineIds,
        disturbanceLines: this.sceneIndex.disturbanceLineIds,
        visibleLineIds: this.sceneIndex.visibleLineIds,
        zoom,
      }, this.styleScratch)) continue;
      const highlightStyle = this.resolveStyle(line, scene, zoom, true);
      for (let subpathIndex = 0; subpathIndex < prepared.subpaths.length; subpathIndex += 1) {
        const subpath = prepared.subpaths[subpathIndex]!;
        const positions = this.getLonLatPositions(subpath);
        if (positions.length < 4) continue;
        highlightPaths.push(this.getPathRecord(
          path,
          subpath,
          subpathIndex,
          positions,
          highlightStyle,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
        ));
      }
    }
    return highlightPaths;
  }

  private buildMarkers(key: string, scene: TransportMapRenderScene, zoom: number) {
    if (
      this.previousStationsSource === scene.stations &&
      this.previousQuaysSource === scene.quays &&
      this.previousEntrancesSource === scene.entrances &&
      this.previousMarkerKey === key
    ) {
      return {
        stations: this.previousStations,
        quays: this.previousQuays,
        entrances: this.previousEntrances,
      };
    }

    const activeLine = scene.activeLineId ? this.sceneIndex.linesById.get(scene.activeLineId) : undefined;
    const stations: TransportMapStationRenderRecord[] = [];
    for (const station of scene.stations) {
      if (!isStationNodeVisible({ zoom }, scene, station, this.sceneIndex.stationVisibility)) continue;
      const selected = station.id === scene.activeStationId || this.sceneIndex.selectedStationIds.has(station.id);
      const hovered = station.id === scene.hoveredStationId;
      const hoveredGhost = this.sceneIndex.hoveredGhostStationIds.has(station.id);
      const activeLineStation = Boolean(activeLine && this.sceneIndex.activeLineStationIds.has(station.id));
      const detailVisible = activeLineStation || zoom >= 14;
      const baseRadius = selected
        ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.selectedStationRadius
        : station.isHub
          ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hubStationRadius
          : detailVisible
            ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.detailStationRadius
            : 0;
      const radius = Math.max(
        baseRadius,
        hovered
          ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hoveredStationRadius
          : hoveredGhost
            ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.detailStationRadius
            : 0,
      );
      if (radius <= 0) continue;
      const interrupted = this.sceneIndex.interruptedStationIds.has(station.id);
      const disturbed = !interrupted && this.sceneIndex.disturbedStationIds.has(station.id);
      const lineColor = interrupted
        ? TRAFFIC_INTERRUPTION_COLOR
        : disturbed
          ? TRAFFIC_DISTURBANCE_COLOR
          : selected
            ? activeLine?.color ?? "#111827"
            : hovered
              ? activeLine?.color ?? "#2563eb"
              : hoveredGhost
                ? this.sceneIndex.linesById.get(scene.hoveredLineId ?? "")?.color ?? "#2563eb"
                : activeLineStation && activeLine
                  ? activeLine.color
                  : "#334155";
      stations.push({
        id: station.id,
        position: [station.lon, station.lat],
        radiusCssPx: radius,
        fillColor: parseCssColor(
          interrupted || disturbed
            ? "#ffffff"
            : selected
              ? activeLine?.color ?? "#111827"
              : hovered
                ? "#dbeafe"
                : hoveredGhost
                  ? "#ffffff"
                  : "#f8fafc",
          1,
        ),
        lineColor: parseCssColor(lineColor, 1),
        lineWidthCssPx: interrupted || disturbed || hovered || selected ? 2.5 : hoveredGhost || activeLineStation ? 2 : 1.25,
        interrupted,
        disturbed,
      });
    }

    const quays: TransportMapQuayRenderRecord[] = [];
    const activeColor = parseCssColor(activeLine?.color ?? "#0f766e", 1);
    for (const quay of scene.quays ?? []) {
      if (zoom < 12) continue;
      const position = worldToLonLat({ x: quay.worldX, y: quay.worldY });
      quays.push({
        id: quay.id,
        stationId: quay.stationId,
        name: quay.name,
        position: [position.lon, position.lat],
        color: activeColor,
        radiusCssPx: zoom >= 15 ? 5.5 : 4.5,
      });
    }

    const entrances: TransportMapEntranceRenderRecord[] = [];
    if (zoom >= 14) {
      for (const entrance of scene.entrances ?? []) {
        const selectedStation = entrance.stationId === scene.activeStationId ||
          this.sceneIndex.selectedStationIds.has(entrance.stationId) ||
          this.sceneIndex.entranceStationIds.has(entrance.stationId);
        if (!selectedStation) continue;
        entrances.push({
          id: entrance.id,
          stationId: entrance.stationId,
          name: entrance.name,
          code: entrance.code,
          position: [entrance.lon, entrance.lat],
          color: parseCssColor("#f59e0b", 1),
          radiusCssPx: GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.entranceRadius,
        });
      }
    }

    this.previousStationsSource = scene.stations;
    this.previousQuaysSource = scene.quays;
    this.previousEntrancesSource = scene.entrances;
    this.previousMarkerKey = key;
    this.previousStations = stations;
    this.previousQuays = quays;
    this.previousEntrances = entrances;
    return { stations, quays, entrances };
  }

  private buildLabels(
    key: string,
    scene: TransportMapRenderScene,
    camera: TransportMapLabelPlacementCamera,
  ): readonly TransportMapLabelRenderRecord[] {
    if (this.previousLabelsKey === key) return this.previousLabels;
    const activeLine = scene.activeLineId ? this.sceneIndex.linesById.get(scene.activeLineId) : undefined;
    const orderedStationIds = activeLine
      ? activeLine.stationIds.length
        ? activeLine.stationIds
        : scene.paths
          .filter((path) => path.lineId === activeLine.id)
          .flatMap((path) => path.stationIds)
      : [];
    const order = new Map(orderedStationIds.map((stationId, index) => [stationId, index]));
    const terminalIds = new Set(
      orderedStationIds.length > 1
        ? [orderedStationIds[0], orderedStationIds[orderedStationIds.length - 1]]
        : orderedStationIds,
    );
    const stationCandidates = activeLine
      ? scene.stations
        .filter((station) => this.sceneIndex.activeLineStationIds.has(station.id) && station.name.trim())
        .sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER))
        .map((station, index) => {
          const candidate: TransportMapLabelPlacementCandidate = {
            id: `station-label:${station.id}`,
            text: station.name.trim(),
            worldPosition: { x: station.worldX, y: station.worldY },
            sizeCssPx: 13,
            priority: terminalIds.has(station.id) || station.id === scene.activeStationId || this.sceneIndex.selectedStationIds.has(station.id) || station.isHub ? 10 : 1,
            order: index,
          };
          return { station, candidate };
        })
      : [];
    // A station-only focus has no active line, but its entrance records are
    // still part of the scene and must keep their labels on the map.
    const entranceCandidates = (scene.entrances ?? [])
      .filter((entrance) => entrance.name.trim() && this.sceneIndex.entranceStationIds.has(entrance.stationId))
      .map((entrance, index) => {
        const candidate: TransportMapLabelPlacementCandidate = {
          id: `entrance-label:${entrance.id}`,
          text: `${entrance.code ? `${entrance.code} · ` : ""}${entrance.name}`,
          worldPosition: { x: entrance.worldX, y: entrance.worldY },
          sizeCssPx: 10,
          priority: 2,
          order: stationCandidates.length + index,
        };
        return { entrance, candidate };
      });
    const layoutCamera = {
      ...camera,
      // The layout key is monotonic: resolving at the bucket's lower zoom
      // keeps the rectangles conservative until the next bucket is reached.
      zoom: labelLayoutZoomKey(camera.zoom),
    };
    const placements = resolveTransportMapLabelPlacements(
      [...stationCandidates, ...entranceCandidates].map(({ candidate }) => candidate),
      layoutCamera,
    );
    const labels = stationCandidates.flatMap(({ station, candidate }) => {
      const placement = placements.get(candidate.id);
      if (!placement) return [];
      return [{
        id: candidate.id,
        text: candidate.text,
        position: [station.lon, station.lat] as [number, number],
        pixelOffsetCssPx: placement.pixelOffsetCssPx,
        textAnchor: placement.textAnchor,
        sizeCssPx: candidate.sizeCssPx,
        color: parseCssColor("#0f172a", 1),
        priority: candidate.priority,
      }];
    });
    const entranceLabels = entranceCandidates.flatMap(({ entrance, candidate }) => {
      const placement = placements.get(candidate.id);
      if (!placement) return [];
      return [{
        id: candidate.id,
        text: candidate.text,
        position: [entrance.lon, entrance.lat] as [number, number],
        pixelOffsetCssPx: placement.pixelOffsetCssPx,
        textAnchor: placement.textAnchor,
        sizeCssPx: candidate.sizeCssPx,
        color: parseCssColor("#334155", 0.92),
        priority: candidate.priority,
      }];
    });
    this.previousLabelsKey = key;
    this.previousLabels = [...labels, ...entranceLabels];
    return this.previousLabels;
  }

  private getLonLatPositions(subpath: PreparedWorldPathSubpath): Float64Array {
    const cached = this.lonLatBySubpath.get(subpath);
    if (cached) return cached.positions;
    const positions = new Float64Array(subpath.worldPoints.length * 2);
    subpath.worldPoints.forEach((point, index) => {
      const lonLat = worldToLonLat(point);
      positions[index * 2] = lonLat.lon;
      positions[index * 2 + 1] = lonLat.lat;
    });
    this.lonLatBySubpath.set(subpath, { positions, vertexCount: subpath.worldPoints.length });
    return positions;
  }

  private getPathRecord(
    path: GlobalMapPath,
    subpath: PreparedWorldPathSubpath,
    subpathIndex: number,
    positions: Float64Array,
    style: MutableTransportMapPathStyle,
    highlight: boolean,
    trafficKind: TransportMapTrafficImpactKind | undefined,
    dash: TransportMapPathDash | undefined,
    colorOverride: string | undefined,
    segmentKey: string | undefined,
  ): TransportMapPathRenderRecord {
    const cache = this.recordsByPath.get(path) ?? {
      base: new Map<string, TransportMapPathRenderRecord>(),
      highlight: new Map<string, TransportMapPathRenderRecord>(),
      traffic: new Map<string, TransportMapPathRenderRecord>(),
    } satisfies PathRecordCacheEntry;
    this.recordsByPath.set(path, cache);
    const color = parseCssColor(colorOverride ?? style.nativeColor, style.alpha);
    const recordKey = [subpathIndex, style.lineWidthCssPx, style.alpha, style.nativeColor, style.order, trafficKind ?? "", dash ?? style.dash, colorOverride ?? "", segmentKey ?? ""].join(":");
    const records = trafficKind ? cache.traffic : highlight ? cache.highlight : cache.base;
    const existing = records.get(recordKey);
    if (existing && existing.positions === positions) return existing;
    const record: TransportMapPathRenderRecord = {
      id: `${path.id}:${subpathIndex}:${trafficKind ?? (highlight ? "highlight" : "base")}:${dash ?? style.dash}:${segmentKey ?? "full"}`,
      pathId: path.id,
      lineId: path.lineId,
      subpathIndex,
      positions,
      color,
      widthCssPx: style.lineWidthCssPx,
      alpha: style.alpha,
      order: style.order,
      dash: dash ?? style.dash,
      trafficKind,
    };
    records.set(recordKey, record);
    return record;
  }

  private appendTrafficRecords(
    target: TransportMapPathRenderRecord[],
    path: GlobalMapPath,
    subpath: PreparedWorldPathSubpath,
    subpathIndex: number,
    fullPositions: Float64Array,
    startVertexIndex: number,
    endVertexIndex: number,
    kind: TransportMapTrafficImpactKind,
    style: MutableTransportMapPathStyle,
    segmentKey: string,
  ): void {
    const start = Math.max(subpath.start, startVertexIndex);
    const end = Math.min(subpath.end - 1, endVertexIndex);
    const relativeStart = start - subpath.start;
    const relativeEnd = end - subpath.start;
    const vertexCount = relativeEnd - relativeStart + 1;
    if (vertexCount < 2) return;
    const positions = fullPositions.slice(relativeStart * 2, (relativeEnd + 1) * 2);
    const trafficColor = kind === "interruption" ? TRAFFIC_INTERRUPTION_COLOR : TRAFFIC_DISTURBANCE_COLOR;
    if (kind === "interruption") {
      target.push(this.getPathRecord(path, subpath, subpathIndex, positions, style, false, kind, "solid", TRAFFIC_INTERRUPTION_GAP_COLOR, segmentKey));
      target.push(this.getPathRecord(path, subpath, subpathIndex, positions, style, false, kind, "traffic-interruption", trafficColor, segmentKey));
    } else {
      target.push(this.getPathRecord(path, subpath, subpathIndex, positions, style, false, kind, "solid", trafficColor, segmentKey));
    }
  }

  private resolveStyle(
    line: GlobalMapLine,
    scene: TransportMapRenderScene,
    zoom: number,
    highlighted: boolean,
  ): MutableTransportMapPathStyle {
    const output = { ...this.styleScratch };
    resolveTransportMapPathStyle({
      line,
      scene,
      highlighted,
      ghostLineIds: this.sceneIndex.ghostLineIds,
      interruptionLines: this.sceneIndex.interruptionLineIds,
      disturbanceLines: this.sceneIndex.disturbanceLineIds,
      visibleLineIds: this.sceneIndex.visibleLineIds,
      zoom,
    }, output);
    return output;
  }
}

function isEmptyTransportMapScene(scene: TransportMapRenderScene): boolean {
  return scene.lines.length === 0 &&
    scene.paths.length === 0 &&
    scene.stations.length === 0 &&
    (scene.quays?.length ?? 0) === 0 &&
    (scene.entrances?.length ?? 0) === 0 &&
    !scene.activeLineId &&
    !scene.activeStationId &&
    !scene.hoveredStationId &&
    !scene.hoveredLineId &&
    (scene.selectedStationIds?.length ?? 0) === 0 &&
    (scene.ghostLineIds?.length ?? 0) === 0 &&
    (scene.entranceStationIds?.length ?? 0) === 0 &&
    (scene.interruptionLineIds?.length ?? 0) === 0 &&
    (scene.disturbanceLineIds?.length ?? 0) === 0 &&
    (scene.interruptedStationIds?.length ?? 0) === 0 &&
    (scene.disturbedStationIds?.length ?? 0) === 0 &&
    (scene.trafficPathSpans?.length ?? 0) === 0 &&
    scene.visibleModeMask === 0;
}

function isEmptyTransportMapModel(model: TransportMapPreparedRenderModel): boolean {
  return model.pathCount === 0 &&
    model.vertexCount === 0 &&
    model.basePaths.length === 0 &&
    model.trafficPaths.length === 0 &&
    model.highlightPaths.length === 0 &&
    model.stations.length === 0 &&
    model.quays.length === 0 &&
    model.entrances.length === 0 &&
    model.labels.length === 0;
}

function stableIdList(values: readonly string[] | undefined): string {
  return values?.length ? values.join(",") : "";
}

function labelLayoutZoomKey(zoom: number): number {
  // Re-layout at a fine, monotonic zoom bucket. Computing the layout at the
  // bucket's lower zoom keeps the accepted rectangles conservative while
  // avoiding a full Deck layer rebuild for every easing sample of a wheel
  // gesture.
  return Math.floor(zoom * 16) / 16;
}

function parseCssColor(value: string, alpha: number): TransportMapRgba {
  const normalized = value.trim().toLowerCase();
  let red = 15;
  let green = 23;
  let blue = 42;
  let sourceAlpha = 1;
  const hex = normalized.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      red = Number.parseInt(`${hex[0]}${hex[0]}`, 16);
      green = Number.parseInt(`${hex[1]}${hex[1]}`, 16);
      blue = Number.parseInt(`${hex[2]}${hex[2]}`, 16);
      sourceAlpha = hex.length === 4 ? Number.parseInt(`${hex[3]}${hex[3]}`, 16) / 255 : 1;
    } else if (hex.length === 6 || hex.length === 8) {
      red = Number.parseInt(hex.slice(0, 2), 16);
      green = Number.parseInt(hex.slice(2, 4), 16);
      blue = Number.parseInt(hex.slice(4, 6), 16);
      sourceAlpha = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
    }
  } else {
    const rgb = normalized.match(/^rgba?\(([^)]+)\)$/)?.[1]?.split(",").map((part) => part.trim());
    if (rgb && rgb.length >= 3) {
      red = clampByte(Number(rgb[0]));
      green = clampByte(Number(rgb[1]));
      blue = clampByte(Number(rgb[2]));
      sourceAlpha = rgb[3] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgb[3])));
    }
  }
  return [red, green, blue, clampByte(Math.round(255 * Math.max(0, Math.min(1, alpha * sourceAlpha))))];
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

export function lonLatPosition(point: WorldPoint): readonly [number, number] {
  const result: LonLatPoint = worldToLonLat(point);
  return [result.lon, result.lat];
}

export function colorToCss(color: TransportMapRgba): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
}
