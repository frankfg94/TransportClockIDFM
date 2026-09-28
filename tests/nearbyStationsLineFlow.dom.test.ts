import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import GhostLineFlowOverlay from "../src/features/transport-map/overlays/GhostLineFlowOverlay.vue";
import type { GlobalMapLine, GlobalMapPath, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork, TransportMapViewportResult } from "../src/features/transport-map/contracts/network";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { fetchLineRouteSequences } from "../src/services/idfm";
import { fetchResolvedLineGeometry } from "../src/services/lineGeometry";
import type { LineGeometryResolution } from "../src/features/line-map/lineGeometry";
import type { LineRouteSequence } from "../src/types/transit";
import type { NearbyStationEntry } from "../src/features/nearby-stations/nearbyStations";
import { useNearbyStationsLineFlow, type NearbyStationsLineFlowSource } from "../src/features/nearby-stations/useNearbyStationsLineFlow";

vi.mock("../src/services/idfm", () => ({
  fetchLineRouteSequences: vi.fn(async () => []),
}));

vi.mock("../src/services/lineGeometry", () => ({
  fetchResolvedLineGeometry: vi.fn(),
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
  it("resolves Noctilien GTFS geometry when a focused viewport decode is canceled", async () => {
    vi.useFakeTimers();
    let wrapper: ReturnType<typeof mount> | undefined;
    try {
      const noctilienLine: GlobalMapLine = {
        ...line,
        id: "line:IDFM:C01807",
        code: "N66",
        label: "N66",
        sourceLineId: "IDFM:C01807",
        mode: "NOCTILIEN",
        stationIds: ["station:n66:from", "station:n66:to"],
        geometryIds: ["path:regional:line:IDFM:C01807"],
      };
      const fromStation: GlobalMapStation = {
        ...station,
        id: "station:n66:from",
        name: "Châtillon",
        normalizedName: "chatillon",
        lineIds: [noctilienLine.id],
        lon: 0,
        lat: 0,
        worldX: 0.5,
        worldY: 0.5,
      };
      const toStation: GlobalMapStation = {
        ...station,
        id: "station:n66:to",
        name: "Gare Montparnasse",
        normalizedName: "gare montparnasse",
        lineIds: [noctilienLine.id],
        lon: 0.01,
        lat: 0,
        worldX: 0.5000277778,
        worldY: 0.5,
      };
      const regionalPath: GlobalMapPath = {
        ...path,
        id: "path:regional:line:IDFM:C01807",
        lineId: noctilienLine.id,
        geometrySource: "netex",
        stationIds: [fromStation.id, toStation.id],
        vertices: [
          { stationId: fromStation.id, x: fromStation.worldX, y: fromStation.worldY },
          { stationId: toStation.id, x: toStation.worldX, y: toStation.worldY },
        ],
        minX: fromStation.worldX,
        minY: fromStation.worldY,
        maxX: toStation.worldX,
        maxY: toStation.worldY,
      };
      const noctilienNetwork: TransportMapNetwork = {
        ...network,
        lines: [noctilienLine],
        stations: [fromStation, toStation],
        regionalPaths: [regionalPath],
        pathsById: new Map([[regionalPath.id, regionalPath]]),
        linesById: new Map([[noctilienLine.id, noctilienLine]]),
        stationsById: new Map([
          [fromStation.id, fromStation],
          [toStation.id, toStation],
        ]),
      };
      const route: LineRouteSequence = {
        id: "pattern:n66:to-montparnasse",
        label: "Châtillon ↔ Gare Montparnasse",
        direction: "Gare Montparnasse",
        topologySource: "server",
        stops: [fromStation, toStation].map((nextStation) => ({
          id: nextStation.id,
          label: nextStation.name,
          city: "Châtillon",
          lon: nextStation.lon,
          lat: nextStation.lat,
          station: {
            id: nextStation.id,
            label: nextStation.name,
            city: "Châtillon",
            lon: nextStation.lon,
            lat: nextStation.lat,
            monitoringRef: nextStation.id,
          },
        })),
      };
      const resolution: LineGeometryResolution = {
        schemaVersion: 1,
        source: "gtfs",
        topology: "requested",
        datasetVersion: "2026-08-30",
        generatedAt: "2026-08-30T00:00:00.000Z",
        stops: route.stops.map((stop) => ({
          id: stop.id,
          label: stop.label,
          lon: stop.lon!,
          lat: stop.lat!,
        })),
        branches: [{
          id: "station:n66:to",
          direction: "Gare Montparnasse",
          stopIds: ["station:n66:from", "station:n66:to"],
        }],
        segments: [{
          id: "segment:n66:from-to",
          fromStopId: "station:n66:from",
          toStopId: "station:n66:to",
          coordinates: [
            { lon: 0, lat: 0 },
            { lon: 0.005, lat: 0 },
            { lon: 0.01, lat: 0 },
          ],
        }],
        entrances: [],
        attempts: [{ source: "gtfs", status: "success" }],
      };
      vi.mocked(fetchLineRouteSequences).mockResolvedValueOnce([route]);
      vi.mocked(fetchResolvedLineGeometry).mockResolvedValueOnce(resolution);

      const camera = createCamera({
        centerWorldX: 0.5,
        centerWorldY: 0.5,
        zoom: 12,
        viewportWidthCssPx: 720,
        viewportHeightCssPx: 360,
      });
      const queryTransportMapViewport = vi.fn(async () => {
        throw new DOMException("Stale worker generation", "AbortError");
      });
      const source: NearbyStationsLineFlowSource = {
        visibleStations: ref([]),
        activeModes: ref(["NOCTILIEN"]),
        transportMapNetwork: ref(noctilienNetwork),
        queryTransportMapViewport,
      };
      const Harness = defineComponent({
        components: { GhostLineFlowOverlay },
        setup() {
          const flow = useNearbyStationsLineFlow(source);
          flow.handleCameraChange(camera);
          return { flow, lineId: noctilienLine.id };
        },
        template: `
          <button data-testid="activate-line" @click="flow.handleActivateLine(lineId)">Activer</button>
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

      expect(queryTransportMapViewport).toHaveBeenCalledWith(camera, noctilienLine.id, [noctilienLine.id]);
      expect(fetchResolvedLineGeometry).toHaveBeenCalledWith(expect.objectContaining({
        lineId: "IDFM:C01807",
        lineLabel: "N66",
        useGtfs: true,
      }));
      expect(wrapper.findAll(".transport-ghost-flow__wave")).toHaveLength(1);
      const pathD = wrapper.get(".transport-ghost-flow__path").attributes("d");
      expect(pathD?.match(/\bL\b/g)).toHaveLength(2);
    } finally {
      wrapper?.unmount();
      vi.useRealTimers();
    }
  });

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

  it("renders the bootstrap path while the focused viewport is still loading", async () => {
    vi.useFakeTimers();
    let wrapper: ReturnType<typeof mount> | undefined;
    let resolveViewport: ((result: TransportMapViewportResult) => void) | undefined;
    try {
      const camera = createCamera({
        centerWorldX: 0.5,
        centerWorldY: 0.5,
        zoom: 12,
        viewportWidthCssPx: 720,
        viewportHeightCssPx: 360,
      });
      const queryTransportMapViewport = vi.fn(() => new Promise<TransportMapViewportResult>((resolve) => {
        resolveViewport = resolve;
      }));
      const bootstrapNetwork: TransportMapNetwork = { ...network, regionalPaths: [path] };
      const source: NearbyStationsLineFlowSource = {
        visibleStations: ref([]),
        activeModes: ref(["METRO"]),
        transportMapNetwork: ref(bootstrapNetwork),
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
          <button data-testid="activate-line" @click="flow.handleActivateLine(lineId)">Activer</button>
          <GhostLineFlowOverlay
            v-if="flow.lineFlowModel.value"
            :model="flow.lineFlowModel.value"
            terminus-label="Terminus"
          />
        `,
      });

      wrapper = mount(Harness);
      await wrapper.get("[data-testid='activate-line']").trigger("click");
      await nextTick();

      expect(queryTransportMapViewport).not.toHaveBeenCalled();
      expect(wrapper.find(".transport-ghost-flow").exists()).toBe(true);
      expect(wrapper.findAll(".transport-ghost-flow__path")).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(70);
      expect(queryTransportMapViewport).toHaveBeenCalledWith(camera, line.id, [line.id]);
      expect(wrapper.find(".transport-ghost-flow").exists()).toBe(true);

      resolveViewport?.(createViewportResult([path]));
      await flushPromises();
      await nextTick();
      expect(wrapper.find(".transport-ghost-flow").exists()).toBe(true);
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
