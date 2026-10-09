import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import GlobalMapLineConnectionIconsOverlay from "../src/features/line-map/GlobalMapLineConnectionIconsOverlay.vue";
import { createGlobalLineConnectionIconEntries } from "../src/features/line-map/globalLineConnectionIcons";
import {
  buildGlobalLineConnectionStations,
} from "../src/features/line-map/globalLineMetadata";
import type {
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import type { TransportMapRenderScene } from "../src/features/transport-map/contracts/renderer";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { worldToScreen, worldScaleAtZoom, type WorldPoint } from "../src/features/transport-map/geo/coordinateKernel";
import {
  createSelectedLineAnnotationLayout,
  resolveSelectedLineLabelOrientation,
  type SelectedLineLabelOrientation,
} from "../src/features/transport-map/render/selectedLineLabelLayout";
import { TransportMapRenderModelBuilder } from "../src/features/transport-map/render/transportMapRenderModel";
import { PreparedWorldPathGeometryCache } from "../src/features/transport-map/render/preparedPathGeometry";
import {
  getTransportMapLabelScreenBounds,
} from "../src/features/transport-map/render/stationLabelPlacement";
import { createDeckTransportLabelLayers } from "../src/features/transport-map/next/deckMapLayers";

const lineIconBadgeStub = defineComponent({
  name: "LineIconBadge",
  props: { line: { type: Object, required: true } },
  template: "<span class='line-icon-badge' :data-line='line.label' />",
});

describe("selected-line correspondence label layout", () => {
  const wrappers: Array<{ unmount: () => void }> = [];
  const layoutScenarios = (["vertical", "horizontal"] as const).flatMap((shape) =>
    [11.8, 12.3, 13.5].map((zoom) => [shape, zoom] as const),
  );

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("renders one TER badge for different source IDs and sizes the row accordingly", async () => {
    const { connectionLines, stations } = createLineFixture("vertical");
    const lines: GlobalMapLine[] = [0, 1, 2].map((index) => ({ ...connectionLines[0]!, id: `train:${index}`, mode: "TRAIN", label: "TER", code: "TER" }));
    lines.push({ ...connectionLines[1]!, id: "metro:6", mode: "METRO", label: "6", code: "6" });
    const entries = createGlobalLineConnectionIconEntries(lines);
    expect(entries.map((entry) => entry.presentation.label)).toEqual(["TER", "6"]);
    expect(lines).toHaveLength(4);
    const camera = createCamera({ centerWorldX: .5, centerWorldY: .5, zoom: 12, viewportWidthCssPx: 800, viewportHeightCssPx: 600 });
    const groups = [{ station: stations[0]!, lineIds: lines.map((entry) => entry.id), lines }];
    const layout = createSelectedLineAnnotationLayout(stations, [{ stationId: stations[0]!.id, lineCount: entries.length }], camera);
    const wrapper = mount(GlobalMapLineConnectionIconsOverlay, {
      props: { enabled: true, groups, orientation: "vertical", layout },
      global: { stubs: { LineIconBadge: lineIconBadgeStub } },
    });
    wrappers.push(wrapper);
    expect(wrapper.findAll(".line-icon-badge").map((badge) => badge.attributes("data-line"))).toEqual(["TER", "6"]);
    expect(wrapper.find(".global-map-line-connection-icons__group").attributes("data-layout-width")).toBe("69");
    await wrapper.setProps({ enabled: false, layout: undefined });
    await wrapper.setProps({ enabled: true, layout });
    expect(wrapper.findAll(".line-icon-badge")).toHaveLength(2);
  });

  it("keeps correspondence geometry alive for the 500ms pop-out after the Deck layout is cleared", async () => {
    vi.useFakeTimers();
    const { connectionLines, stations } = createLineFixture("vertical");
    const camera = createCamera({ centerWorldX: .5, centerWorldY: .5, zoom: 12, viewportWidthCssPx: 800, viewportHeightCssPx: 600 });
    const layout = createSelectedLineAnnotationLayout(stations, [{ stationId: stations[0]!.id, lineCount: 1 }], camera);
    const groups = [{ station: stations[0]!, lineIds: [connectionLines[0]!.id], lines: [connectionLines[0]!] }];
    const wrapper = mount(GlobalMapLineConnectionIconsOverlay, {
      attachTo: document.body,
      props: { enabled: true, groups, orientation: "vertical", layout },
      global: { stubs: { LineIconBadge: lineIconBadgeStub, Transition: false, TransitionGroup: false } },
    });
    wrappers.push(wrapper);
    await vi.advanceTimersByTimeAsync(600);
    const originalLeft = wrapper.find(".global-map-line-connection-icons__group").attributes("data-layout-left");
    await wrapper.setProps({ enabled: false, layout: undefined });
    await vi.advanceTimersByTimeAsync(250);
    const leaving = document.body.querySelector(".global-map-line-connection-icons__group");
    expect(leaving).not.toBeNull();
    expect(leaving!.classList.contains("connection-pop-leave-active")).toBe(true);
    expect(leaving!.getAttribute("data-layout-left")).toBe(originalLeft);
    await vi.advanceTimersByTimeAsync(400);
    expect(document.body.querySelectorAll(".global-map-line-connection-icons__group")).toHaveLength(0);
    await wrapper.setProps({ enabled: true, layout });
    await vi.advanceTimersByTimeAsync(600);
    await wrapper.setProps({ enabled: false, layout: undefined });
    await vi.advanceTimersByTimeAsync(100);
    await wrapper.setProps({ enabled: true, layout });
    await vi.advanceTimersByTimeAsync(600);
    expect(document.body.querySelectorAll(".global-map-line-connection-icons__group")).toHaveLength(1);
    await wrapper.setProps({ enabled: true, layout, reduceMotion: true });
    await wrapper.setProps({ enabled: false, layout: undefined });
    expect(wrapper.findAll(".global-map-line-connection-icons__group")).toHaveLength(0);
  });

  it.each(layoutScenarios)("keeps names and single-row lists clear of a curved %s route at zoom %s", (shape, zoom) => {
    const { line, connectionLines, stations, path } = createLineFixture(shape);
    const geometryCache = new PreparedWorldPathGeometryCache();
    geometryCache.setStationsSource(stations);
    const routeSubpaths = geometryCache.get(path, line.mode, new Map(stations.map((station) => [station.id, station])))
      .subpaths.map((subpath) => subpath.worldPoints);
    const orientation = resolveSelectedLineLabelOrientation(stations);
    expect(orientation).toBe(shape);
    const camera = createCamera({
      centerWorldX: stations.reduce((sum, station) => sum + station.worldX, 0) / stations.length,
      centerWorldY: stations.reduce((sum, station) => sum + station.worldY, 0) / stations.length,
      zoom,
      viewportWidthCssPx: 1000,
      viewportHeightCssPx: 800,
    });
    const lineConnectionGroups = buildGlobalLineConnectionStations(line, stations).map((group) => ({
      ...group,
      lines: group.lineIds
        .map((lineId) => connectionLines.find((candidate) => candidate.id === lineId))
        .filter((candidate): candidate is GlobalMapLine => Boolean(candidate)),
    }));
    const layout = createSelectedLineAnnotationLayout(
      stations,
      lineConnectionGroups.map((group) => ({
        stationId: group.station.id,
        lineCount: group.lines.length,
      })),
      camera,
      routeSubpaths,
    );
    const scene: TransportMapRenderScene = {
      lines: [line, ...connectionLines],
      paths: [path],
      stations,
      activeLineId: line.id,
      selectedStationIds: [],
      visibleModeMask: 0xffff,
      selectedLineAnnotationLayout: layout,
    };
    const modelBuilder = new TransportMapRenderModelBuilder();
    const model = modelBuilder.build(camera, scene);
    const stationLabels = model.labels.filter((label) => label.id.startsWith("station-label:"));
    expect(stationLabels).toHaveLength(stations.length);

    const labelLayer = createDeckTransportLabelLayers(model.labels, undefined)
      .find((layer) => layer.id === "transport-labels");
    expect(labelLayer).toBeDefined();
    const layerProps = labelLayer!.props as unknown as {
      data: typeof stationLabels;
      getText: (record: (typeof stationLabels)[number]) => string;
    };
    expect(layerProps.data.map((record) => layerProps.getText(record))).toEqual(
      stations.map((station) => station.name),
    );

    const wrapper = mount(GlobalMapLineConnectionIconsOverlay, {
      attachTo: document.body,
      props: {
        enabled: true,
        groups: lineConnectionGroups,
        orientation: layout.orientation,
        layout,
      },
      global: { stubs: { LineIconBadge: lineIconBadgeStub } },
    });
    wrappers.push(wrapper);

    const iconBoxesByStation = new Map(
      wrapper.findAll(".global-map-line-connection-icons__group").map((element) => {
        const left = Number(element.attributes("data-layout-left"));
        const top = Number(element.attributes("data-layout-top"));
        const width = Number(element.attributes("data-layout-width"));
        const height = Number(element.attributes("data-layout-height"));
        return [element.attributes("data-station-id"), {
          left,
          top,
          right: left + width,
          bottom: top + height,
        }] as const;
      }),
    );
    expect(iconBoxesByStation.size).toBe(stations.length);
    for (const group of wrapper.findAll(".global-map-line-connection-icons__group")) {
      const stationId = group.attributes("data-station-id");
      const expectedCount = lineConnectionGroups.find((entry) => entry.station.id === stationId)!.lines.length;
      expect(group.findAll(".line-icon-badge")).toHaveLength(expectedCount);
      expect(Number(group.attributes("data-layout-height"))).toBe(32);
      expect(Number(group.attributes("data-layout-width"))).toBe(expectedCount * 28 + (expectedCount - 1) * 3 + 10);
    }
    const screenRoutes = routeSubpaths.map((points) => points.map((point) => worldToScreen(point, camera)));
    for (const box of iconBoxesByStation.values()) {
      for (const points of screenRoutes) {
        for (let index = 1; index < points.length; index += 1) {
          expect(segmentIntersectsBox(points[index - 1]!, points[index]!, box, 5)).toBe(false);
        }
      }
    }

    const stationById = new Map(stations.map((station) => [station.id, station]));
    const iconBoxes = [...iconBoxesByStation.entries()];
    for (let leftIndex = 0; leftIndex < iconBoxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < iconBoxes.length; rightIndex += 1) {
        expect(rectanglesOverlap(iconBoxes[leftIndex]![1], iconBoxes[rightIndex]![1])).toBe(false);
      }
    }

    for (const label of stationLabels) {
      const stationId = label.id.slice("station-label:".length);
      const station = stationById.get(stationId)!;
      const placement = {
        pixelOffsetCssPx: label.pixelOffsetCssPx!,
        textAnchor: label.textAnchor!,
      };
      const bounds = getTransportMapLabelScreenBounds({
        text: label.text,
        worldPosition: { x: station.worldX, y: station.worldY },
        sizeCssPx: label.sizeCssPx,
      }, camera, placement);
      const anchor = worldToScreen({ x: station.worldX, y: station.worldY }, camera);
      const iconBox = iconBoxesByStation.get(stationId)!;
      if (orientation === "vertical") {
        expect(label.pixelOffsetCssPx![0]).toBe(22);
        expect(Math.abs(label.pixelOffsetCssPx![1])).toBeLessThan(64);
        expect(bounds.left).toBeGreaterThan(anchor.x);
        expect(iconBox.right).toBeLessThan(anchor.x);
        expect(Math.abs((iconBox.top + iconBox.bottom) / 2 - anchor.y)).toBeLessThan(64);
      } else {
        expect(bounds.bottom).toBeLessThan(anchor.y);
        expect(iconBox.top).toBeGreaterThan(anchor.y);
        expect((iconBox.left + iconBox.right) / 2).toBeCloseTo(anchor.x);
      }

      for (const iconBox of iconBoxesByStation.values()) {
        expect(rectanglesOverlap(bounds, iconBox)).toBe(false);
      }
    }

    const labelBounds = stationLabels.map((label) => {
      const station = stationById.get(label.id.slice("station-label:".length))!;
      return getTransportMapLabelScreenBounds({ text: label.text, worldPosition: { x: station.worldX, y: station.worldY }, sizeCssPx: label.sizeCssPx },
        camera, { pixelOffsetCssPx: label.pixelOffsetCssPx!, textAnchor: label.textAnchor! });
    });
    for (let index = 0; index < labelBounds.length; index += 1) {
      for (let other = index + 1; other < labelBounds.length; other += 1) {
        expect(rectanglesOverlap(labelBounds[index]!, labelBounds[other]!)).toBe(false);
      }
    }

    modelBuilder.dispose();
  });
});

function createLineFixture(shape: SelectedLineLabelOrientation): {
  line: GlobalMapLine;
  connectionLines: GlobalMapLine[];
  stations: GlobalMapStation[];
  path: GlobalMapPath;
} {
  const lineId = `line:${shape}:selected`;
  const counts = [1, 2, 7, 2, 1, 6, 5, 1, 4, 2];
  const offsets = [[-25, -210], [-55, -174], [-15, -130], [-18, -118], [20, -65], [-30, -35], [-20, 18], [35, 65], [40, 140], [0, 220]];
  const toWorld = (x: number, y: number): WorldPoint => ({
    x: .5 + (shape === "vertical" ? x : y) / worldScaleAtZoom(12),
    y: .5 + (shape === "vertical" ? y : x) / worldScaleAtZoom(12),
  });
  const stations = offsets.map(([x, y], index) => {
    const point = toWorld(x!, y!);
    return {
      id: `station:${shape}:${index}`,
      index,
      name: `Station ${index + 1} — ${shape === "vertical" ? "Nord" : "Est"}`,
      normalizedName: `station ${index + 1}`,
      aliases: [],
      rawRefs: [],
      lineIds: [lineId, ...Array.from({ length: counts[index]! }, (_, slot) => `line:${shape}:connection:${slot}`)],
      ownerChunkId: "fixture",
      isHub: true,
      sourceCrs: "EPSG:2154",
      sourceX: 0,
      sourceY: 0,
      lon: 2.3 + index * 0.001,
      lat: 48.8 + index * 0.001,
      worldX: point.x,
      worldY: point.y,
      coordinateSource: "gtfs",
      transformVersion: "lambert93-ntf-v1",
    } satisfies GlobalMapStation;
  });
  const line: GlobalMapLine = {
    id: lineId,
    index: 0,
    code: shape === "vertical" ? "V" : "H",
    label: shape === "vertical" ? "Vertical" : "Horizontal",
    mode: "METRO",
    color: "#6b217f",
    textColor: "#ffffff",
    aliases: [],
    stationIds: stations.map((station) => station.id),
    geometryIds: [],
  };
  const connectionLines = Array.from({ length: 7 }, (_, slot): GlobalMapLine => ({
    id: `line:${shape}:connection:${slot}`,
    index: slot + 1,
    code: `C${slot}`,
    label: `C${slot}`,
    mode: "BUS",
    color: "#237547",
    textColor: "#ffffff",
    aliases: [],
    stationIds: stations.map((station) => station.id),
    geometryIds: [],
  }));
  const route = offsets.flatMap(([x, y], index) => [
    { ...toWorld(x!, y!), stationId: stations[index]!.id },
    ...(index === 5 ? [toWorld(-90, y! + 35)] : []),
  ]);
  const path: GlobalMapPath = {
    id: `path:${shape}`, lineId, geometrySource: "gtfs", sourceVersion: "fixture",
    quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
    stationIds: line.stationIds, vertices: route,
    minX: Math.min(...route.map((point) => point.x)), maxX: Math.max(...route.map((point) => point.x)),
    minY: Math.min(...route.map((point) => point.y)), maxY: Math.max(...route.map((point) => point.y)),
    chunkIds: ["fixture"],
  };
  return { line, connectionLines, stations, path };
}

// Liang-Barsky clipping, independent of the production envelope calculation.
function segmentIntersectsBox(start: WorldPoint, end: WorldPoint,
  box: { left: number; top: number; right: number; bottom: number }, padding: number): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let enter = 0;
  let exit = 1;
  const boundaries = [
    [-dx, start.x - box.left + padding], [dx, box.right + padding - start.x],
    [-dy, start.y - box.top + padding], [dy, box.bottom + padding - start.y],
  ];
  for (const [direction, distance] of boundaries) {
    if (direction === 0) { if (distance! < 0) return false; continue; }
    const ratio = distance! / direction!;
    if (direction! < 0) enter = Math.max(enter, ratio);
    else exit = Math.min(exit, ratio);
    if (enter > exit) return false;
  }
  return true;
}

function rectanglesOverlap(
  left: { left: number; top: number; right: number; bottom: number },
  right: { left: number; top: number; right: number; bottom: number },
): boolean {
  return !(
    left.right <= right.left ||
    left.left >= right.right ||
    left.bottom <= right.top ||
    left.top >= right.bottom
  );
}
