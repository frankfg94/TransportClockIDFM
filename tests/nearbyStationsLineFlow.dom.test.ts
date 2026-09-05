import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import GhostLineFlowOverlay from "../src/features/transport-map/overlays/GhostLineFlowOverlay.vue";
import type { GlobalMapLine, GlobalMapPath, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork, TransportMapViewportResult } from "../src/features/transport-map/contracts/network";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { NearbyStationEntry } from "../src/features/nearby-stations/nearbyStations";
import { useNearbyStationsLineFlow, type NearbyStationsLineFlowSource } from "../src/features/nearby-stations/useNearbyStationsLineFlow";

vi.mock("../src/services/idfm", () => ({
  fetchLineRouteSequences: vi.fn(async () => []),
}));

const line: GlobalMapLine = {
  id: "line:metro:13",
  index: 13,
  code: "13",
  label: "13",
  mode: "METRO",
  color: "#84bd00",
  textColor: "#ffffff",
  aliases: [],
  stationIds: ["station:metro:13"],
  geometryIds: ["path:metro:13"],
};

const station: GlobalMapStation = {
  id: "station:metro:13",
  index: 13,
  name: "Châtillon–Montrouge",
  normalizedName: "chatillon montrouge",
  aliases: [],
  rawRefs: ["station:metro:13"],
  lineIds: [line.id],
  ownerChunkId: "fixture",
  isHub: false,
  sourceCrs: "EPSG:2154",
  sourceX: 650000,
  sourceY: 6860000,
  lon: 2.35,
  lat: 48.85,
  worldX: 0.5,
  worldY: 0.5,
  coordinateSource: "netex",
  transformVersion: "lambert93-ntf-v1",
};

const path: GlobalMapPath = {
  id: "path:metro:13",
  lineId: line.id,
  geometrySource: "gtfs",
  sourceVersion: "fixture",
  quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
  stationIds: [station.id],
  vertices: [
    { stationId: station.id, x: station.worldX, y: station.worldY },
    { x: station.worldX + 0.001, y: station.worldY },
  ],
  minX: station.worldX,
  minY: station.worldY,
  maxX: station.worldX + 0.001,
  maxY: station.worldY,
  chunkIds: ["fixture"],
};

const network: TransportMapNetwork = {
  lines: [line],
  stations: [station],
  entrances: [],
  regionalPaths: [],
  pathsById: new Map([[path.id, path]]),
  linesById: new Map([[line.id, line]]),
  stationsById: new Map([[station.id, station]]),
  bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
};

function createViewportResult(paths: GlobalMapPath[]): TransportMapViewportResult {
  return {
    generation: 1,
    chunkIds: ["fixture"],
    paths,
    stations: [station],
    bytes: 0,
    fromCache: true,
  };
}

function pathHasVisiblePoint(d: string, width: number, height: number): boolean {
  const values = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  for (let index = 0; index + 1 < values.length; index += 2) {
    const x = values[index]!;
    const y = values[index + 1]!;
    if (x >= 0 && x <= width && y >= 0 && y <= height) return true;
  }
  return false;
}

describe("NearbyStations line ghost flow DOM", () => {
  it("loads and renders the selected projected Metro 13 ghost path with an explicit forced line", async () => {
    vi.useFakeTimers();
    let wrapper: ReturnType<typeof mount> | undefined;
    try {
      const camera = createCamera({
        centerWorldX: 0.5,
        centerWorldY: 0.5,
        zoom: 12,
        viewportWidthCssPx: 720,
        viewportHeightCssPx: 360,
      });
      const queryTransportMapViewport = vi.fn(async (
        _nextCamera,
        _detailLineId,
        forcedLineIds: string[] = [],
      ) => createViewportResult(forcedLineIds.includes(line.id) ? [path] : []));
      const source: NearbyStationsLineFlowSource = {
        visibleStations: ref([]),
        activeModes: ref(["METRO"]),
        transportMapNetwork: ref(network),
        queryTransportMapViewport,
      };
      const Harness = defineComponent({
        components: { GhostLineFlowOverlay },
        setup() {
          const flow = useNearbyStationsLineFlow(source);
          flow.handleCameraChange(camera);
          return { flow, lineId: line.id };
        },
        template: `
          <button data-testid="activate-line" @click="flow.handleActivateLine(lineId, 'station:metro:13')">Activer</button>
          <GhostLineFlowOverlay
            v-if="flow.lineFlowModel.value"
            :model="flow.lineFlowModel.value"
            terminus-label="Terminus"
          />
        `,
      });

      wrapper = mount(Harness);
      await wrapper.get("[data-testid='activate-line']").trigger("click");
      await vi.advanceTimersByTimeAsync(70);
      await flushPromises();
      await nextTick();

      expect(queryTransportMapViewport).toHaveBeenCalledWith(camera, line.id, [line.id]);
      expect(wrapper.find(".transport-ghost-flow").exists()).toBe(true);
      expect(wrapper.findAll(".transport-ghost-flow__path")).toHaveLength(1);
    } finally {
      wrapper?.unmount();
      vi.useRealTimers();
    }
  });

  it("renders the visible feeder ghost when the projected Metro 13 route is outside the map", async () => {
    vi.useFakeTimers();
    let wrapper: ReturnType<typeof mount> | undefined;
    try {
      const targetLine: GlobalMapLine = {
        ...line,
        id: "line:metro:13:target",
        stationIds: ["station:metro:13:outside"],
        geometryIds: ["path:metro:13:outside"],
      };
      const feederLine: GlobalMapLine = {
        ...line,
        id: "line:tram:T6",
        code: "T6",
        label: "T6",
        mode: "TRAM",
        color: "#e30613",
        stationIds: ["station:tram:T6:local"],
        geometryIds: ["path:tram:T6:local"],
      };
      const targetStation: GlobalMapStation = {
        ...station,
        id: "station:metro:13:outside",
        lineIds: [targetLine.id],
        worldX: 2,
        worldY: 2,
      };
      const feederStation: GlobalMapStation = {
        ...station,
        id: "station:tram:T6:local",
        lineIds: [feederLine.id],
        worldX: 0.5,
        worldY: 0.5,
      };
      const targetPath: GlobalMapPath = {
        ...path,
        id: "path:metro:13:outside",
        lineId: targetLine.id,
        stationIds: [targetStation.id],
        vertices: [
          { stationId: targetStation.id, x: targetStation.worldX, y: targetStation.worldY },
          { x: targetStation.worldX + 0.02, y: targetStation.worldY },
        ],
        minX: targetStation.worldX,
        minY: targetStation.worldY,
        maxX: targetStation.worldX + 0.02,
        maxY: targetStation.worldY,
      };
      const feederPath: GlobalMapPath = {
        ...path,
        id: "path:tram:T6:local",
        lineId: feederLine.id,
        stationIds: [feederStation.id],
        vertices: [
          { stationId: feederStation.id, x: feederStation.worldX, y: feederStation.worldY },
          { x: feederStation.worldX + 0.0001, y: feederStation.worldY },
        ],
        minX: feederStation.worldX,
        minY: feederStation.worldY,
        maxX: feederStation.worldX + 0.0001,
        maxY: feederStation.worldY,
      };
      const feederEntry: NearbyStationEntry = {
        id: feederStation.id,
        station: { ...feederStation, memberStationIds: [feederStation.id] },
        memberStations: [feederStation],
        lines: [feederLine],
        distanceMeters: 100,
        lineDistanceMeters: { [feederLine.id]: 100 },
        lineInsideRadius: { [feederLine.id]: true },
        insideRadius: true,
      };
      const localNetwork: TransportMapNetwork = {
        lines: [targetLine, feederLine],
        stations: [targetStation, feederStation],
        entrances: [],
        regionalPaths: [targetPath, feederPath],
        pathsById: new Map([[targetPath.id, targetPath], [feederPath.id, feederPath]]),
        linesById: new Map([[targetLine.id, targetLine], [feederLine.id, feederLine]]),
        stationsById: new Map([[targetStation.id, targetStation], [feederStation.id, feederStation]]),
        bounds: { minX: 0, minY: 0, maxX: 3, maxY: 3 },
      };
      const camera = createCamera({
        centerWorldX: 0.5,
        centerWorldY: 0.5,
        zoom: 12,
        viewportWidthCssPx: 720,
        viewportHeightCssPx: 360,
      });
      const queryTransportMapViewport = vi.fn(async (
        _nextCamera,
        _detailLineId,
        forcedLineIds: string[] = [],
      ) => createViewportResult(forcedLineIds.includes(feederLine.id) ? [feederPath] : [targetPath]));
      const source: NearbyStationsLineFlowSource = {
        visibleStations: ref([feederEntry]),
        activeModes: ref(["METRO", "TRAM"]),
        transportMapNetwork: ref(localNetwork),
        queryTransportMapViewport,
      };
      const Harness = defineComponent({
        components: { GhostLineFlowOverlay },
        setup() {
          const flow = useNearbyStationsLineFlow(source);
          flow.handleCameraChange(camera);
          return { flow, targetLineId: targetLine.id, targetStationId: targetStation.id, feederLineId: feederLine.id };
        },
        template: `
          <button
            data-testid="activate-connection"
            @click="flow.handleActivateLine(targetLineId, targetStationId, feederLineId)"
          >Activer</button>
          <GhostLineFlowOverlay
            v-if="flow.lineFlowModel.value"
            :model="flow.lineFlowModel.value"
            terminus-label="Terminus"
          />
        `,
      });

      wrapper = mount(Harness);
      await wrapper.get("[data-testid='activate-connection']").trigger("click");
      await vi.advanceTimersByTimeAsync(70);
      await flushPromises();
      await nextTick();

      expect(queryTransportMapViewport).toHaveBeenCalledWith(camera, feederLine.id, [feederLine.id]);
      const ghostPath = wrapper.get(".transport-ghost-flow__path").attributes("d");
      expect(ghostPath).toBeTruthy();
      expect(pathHasVisiblePoint(ghostPath ?? "", 720, 360)).toBe(true);
    } finally {
      wrapper?.unmount();
      vi.useRealTimers();
    }
  });

  it("renders the primary line and one ghost overlay for every selected feeder route", async () => {
    vi.useFakeTimers();
    let wrapper: ReturnType<typeof mount> | undefined;
    try {
      const t10: GlobalMapLine = {
        ...line,
        id: "line:tram:T10",
        code: "T10",
        label: "T10",
        mode: "TRAM",
        color: "#e30613",
      };
      const bus412: GlobalMapLine = {
        ...line,
        id: "line:bus:412",
        code: "412",
        label: "412",
        mode: "BUS",
        color: "#00814a",
      };
      const t10Path: GlobalMapPath = { ...path, id: "path:tram:T10", lineId: t10.id };
      const busPath: GlobalMapPath = { ...path, id: "path:bus:412", lineId: bus412.id };
      const localNetwork: TransportMapNetwork = {
        ...network,
        lines: [line, t10, bus412],
        pathsById: new Map([[path.id, path], [t10Path.id, t10Path], [busPath.id, busPath]]),
        linesById: new Map([[line.id, line], [t10.id, t10], [bus412.id, bus412]]),
        regionalPaths: [path, t10Path, busPath],
      };
      const camera = createCamera({
        centerWorldX: 0.5,
        centerWorldY: 0.5,
        zoom: 12,
        viewportWidthCssPx: 720,
        viewportHeightCssPx: 360,
      });
      const queryTransportMapViewport = vi.fn(async (
        _nextCamera,
        _detailLineId,
        forcedLineIds: string[] = [],
      ) => forcedLineIds.includes(t10.id)
        ? createViewportResult([t10Path])
        : forcedLineIds.includes(bus412.id)
          ? createViewportResult([busPath])
          : createViewportResult([]));
      const source: NearbyStationsLineFlowSource = {
        visibleStations: ref([]),
        activeModes: ref(["METRO", "TRAM", "BUS"]),
        transportMapNetwork: ref(localNetwork),
        queryTransportMapViewport,
      };
      const Harness = defineComponent({
        components: { GhostLineFlowOverlay },
        setup() {
          const flow = useNearbyStationsLineFlow(source);
          flow.handleCameraChange(camera);
          return { flow, targetLineId: line.id, t10Id: t10.id, bus412Id: bus412.id };
        },
        template: `
          <button
            data-testid="activate-alternatives"
            @click="flow.handleActivateLine(targetLineId, 'station:metro:13', [t10Id, bus412Id])"
          >Activer</button>
          <GhostLineFlowOverlay
            v-for="model in flow.lineFlowModels.value"
            :key="model.lineId"
            :model="model"
            terminus-label="Terminus"
          />
        `,
      });

      wrapper = mount(Harness);
      await wrapper.get("[data-testid='activate-alternatives']").trigger("click");
      await vi.advanceTimersByTimeAsync(70);
      await flushPromises();
      await nextTick();

      expect(queryTransportMapViewport).toHaveBeenCalledWith(camera, t10.id, [t10.id]);
      expect(queryTransportMapViewport).toHaveBeenCalledWith(camera, bus412.id, [bus412.id]);
      expect(wrapper.findAll(".transport-ghost-flow")).toHaveLength(3);
      expect(wrapper.findAll(".transport-ghost-flow__path")).toHaveLength(3);
    } finally {
      wrapper?.unmount();
      vi.useRealTimers();
    }
  });
});
