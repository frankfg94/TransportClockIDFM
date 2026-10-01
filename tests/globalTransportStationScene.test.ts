import { describe, expect, it } from "vitest";
import { shallowRef } from "vue";
import { useGlobalTransportScene, type UseGlobalTransportSceneOptions } from "../src/features/line-map/useGlobalTransportScene";
import type { GlobalMapLine, GlobalMapPath, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";

function fixture() {
  const lines: GlobalMapLine[] = ["tram", "bus", "unrelated"].map((id, index) => ({
    id, index, code: id, label: id, mode: id === "bus" ? "BUS" : "TRAM",
    color: "#123456", textColor: "#fff", aliases: [], stationIds: [], geometryIds: [],
  }));
  const stations = [
    { id: "selected", lineIds: ["tram"] },
    { id: "connection", lineIds: ["bus"] },
    { id: "shared", lineIds: ["tram", "unrelated"] },
    { id: "elsewhere", lineIds: ["unrelated"] },
  ].map((station, index) => ({ ...station, index, name: station.id, worldX: 0.5, worldY: 0.5 } as GlobalMapStation));
  const paths: GlobalMapPath[] = lines.map((line) => ({
    id: `path:${line.id}`, lineId: line.id, stationIds: [],
    vertices: [{ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.51 }],
    geometrySource: "gtfs", sourceVersion: "test", chunkIds: [],
    quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
    minX: 0.5, minY: 0.5, maxX: 0.51, maxY: 0.51,
  }));
  const network: TransportMapNetwork = {
    lines, stations, regionalPaths: paths, entrances: [],
    linesById: new Map(lines.map((line) => [line.id, line])),
    stationsById: new Map(stations.map((station) => [station.id, station])),
    pathsById: new Map(paths.map((path) => [path.id, path])),
    bounds: { minX: 0.5, minY: 0.5, maxX: 0.51, maxY: 0.51 },
  };
  const selected = shallowRef<GlobalMapStation | undefined>(stations[0]);
  const options: UseGlobalTransportSceneOptions = {
    getNetwork: () => network,
    getViewport: () => ({ paths, stations, generation: 1, chunkIds: [], bytes: 0, fromCache: true }),
    getActiveStationView: () => selected.value,
    getActiveStationId: () => selected.value?.id,
    getActiveLine: () => undefined, getActiveLineId: () => undefined,
    getSelectedStationIds: () => [], getSelectedModes: () => ["TRAM"], getVisibleModeMask: () => 0xffff,
    getConnectedStationIds: () => selected.value?.id === "selected" ? ["connection"] : [],
    overrideSelectedModesForGhostCorrespondences: () => true,
    getCameraZoom: () => 15, getHoveredStationId: () => undefined, getHoveredLineId: () => undefined,
    getSelectedBusDirectionStationIds: () => undefined, getSelectedBusDirectionStationSet: () => undefined,
    getSelectedBusDirectionEdgeKeys: () => undefined, getSelectedBusDirectionQuays: () => [],
    getBusDirectionGeometryPaths: () => [], getUnavailableBusDirectionGeometryKey: () => undefined,
    getSelectedBusDirectionGeometryKey: () => "", getSelectedLineInteractionScene: () => undefined,
    getInteractionActive: () => false, getSidebarPreviewLineId: () => undefined,
    getTrafficState: () => ({ interruptionLineIds: [], disturbanceLineIds: [], interruptedStationIds: [], disturbedStationIds: [], trafficPathSpans: [] }),
  };
  return { state: useGlobalTransportScene(options), selected };
}

describe("station selection map scope", () => {
  it("shows only local correspondence lines, including modes outside the overview filter", () => {
    const { state } = fixture();
    expect(state.renderScene.value.lines.map((line) => line.id)).toEqual(["tram", "bus"]);
    expect(state.renderPaths.value.map((path) => path.lineId)).toEqual(["tram", "bus"]);
    expect(state.renderStations.value.map((station) => station.id)).toEqual(["selected", "connection", "shared"]);
    expect(state.renderStations.value.find((station) => station.id === "shared")?.lineIds).toEqual(["tram"]);
  });

  it("restores the overview after closing the station selection", () => {
    const { state, selected } = fixture();
    expect(state.renderScene.value.lines).toHaveLength(2);
    selected.value = undefined;
    expect(state.renderScene.value.lines).toHaveLength(3);
    expect(state.renderPaths.value).toHaveLength(3);
    expect(state.renderStations.value.map((station) => station.id)).toContain("elsewhere");
  });

  it("does not restore the whole network when the station has no known lines", () => {
    const { state, selected } = fixture();
    selected.value = { ...selected.value!, id: "unknown", lineIds: [] };
    expect(state.renderScene.value.lines).toEqual([]);
    expect(state.renderPaths.value).toEqual([]);
  });
});
