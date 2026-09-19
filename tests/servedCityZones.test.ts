import { describe, expect, it } from "vitest";
import {
  GLOBAL_MAP_TRANSFORM_VERSION,
  type GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import type { TransportMapRenderScene } from "../src/features/transport-map/contracts/renderer";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { IrisDataset, IrisNeighborhood } from "../src/features/transport-map/iris/irisApi";
import {
  buildAllCityZones,
  buildAllGlobalZones,
  buildDepartmentZones,
  buildServedCityZones,
  cityZoneLodKey,
  GLOBAL_CITY_VIEW_MIN_ZOOM,
  selectCityZonesForZoom,
} from "../src/features/transport-map/iris/servedCityZones";
import { createDeckTransportLayers } from "../src/features/transport-map/next/deckMapLayers";
import { TransportMapRenderModelBuilder } from "../src/features/transport-map/render/transportMapRenderModel";
import { pointInIrisGeometry } from "../src/features/transport-map/iris/irisGeometry";
import { joinAdministrativeBoundarySegments } from "../src/features/transport-map/iris/administrativeGeometry";

function boundaryEdgeCount(zone: { boundaryPaths: ReadonlyArray<ReadonlyArray<unknown>> } | undefined): number {
  return zone?.boundaryPaths.reduce((count, path) => count + path.length - 1, 0) ?? 0;
}

function neighborhood(
  id: string,
  communeCode: string,
  communeName: string,
  minLon: number,
  departmentCode = "92",
): IrisNeighborhood {
  return {
    id,
    codeIris: id.replace("IRIS____", ""),
    communeCode,
    communeName,
    departmentCode,
    name: id,
    type: "D",
    centroid: [minLon + 0.005, 48.005],
    geometry: {
      type: "Polygon",
      coordinates: [[
        [minLon, 48],
        [minLon + 0.01, 48],
        [minLon + 0.01, 48.01],
        [minLon, 48.01],
        [minLon, 48],
      ]],
    },
  };
}

function dataset(
  neighborhoods: IrisNeighborhood[],
  departmentNames: Readonly<Record<string, string>> = {
    "75": "Paris",
    "92": "Hauts-de-Seine",
  },
): IrisDataset {
  return {
    schemaVersion: "1.3",
    generatedAt: "2026-09-09T00:00:00.000Z",
    sourceId: "insee-iris",
    bbox: [2, 48, 2.31, 48.01],
    neighborhoods,
    departmentNames,
    source: {
      id: "insee-iris",
      title: "IRIS fixture",
      producer: "fixture",
      pageUrl: "https://example.test",
      licence: { label: "Fixture", attribution: "Fixture" },
      limitations: [],
    },
    airNoiseSource: {
      id: "air-noise-statistics",
      title: "Air/noise fixture",
      producer: "fixture",
      pageUrl: "https://example.test/air-noise",
      licence: { label: "Fixture", attribution: "Fixture" },
      limitations: [],
    },
    airNoiseCommunes: {},
  };
}

function station(
  id: string,
  city: string | undefined,
  lon: number,
  lat = 48.005,
): GlobalMapStation {
  return {
    id,
    index: 0,
    name: id,
    normalizedName: id,
    ...(city ? { city } : {}),
    aliases: [],
    rawRefs: [],
    lineIds: ["line:fixture"],
    ownerChunkId: "chunk:fixture",
    isHub: false,
    sourceCrs: "EPSG:2154",
    sourceX: 0,
    sourceY: 0,
    lon,
    lat,
    worldX: 0,
    worldY: 0,
    coordinateSource: "gtfs",
    transformVersion: GLOBAL_MAP_TRANSFORM_VERSION,
  };
}

describe("served city zones", () => {
  it("groups the line stations by city and removes shared neighborhood edges", () => {
    const zones = buildServedCityZones(
      dataset([
        neighborhood("IRIS____A1", "A", "Ville Alpha", 2),
        neighborhood("IRIS____A2", "A", "Ville Alpha", 2.01),
        neighborhood("IRIS____B1", "B", "Ville Beta", 2.1),
      ]),
      [
        station("station:alpha-1", "Ville Alpha", 2.005),
        station("station:alpha-2", "Ville Alpha", 2.015),
        station("station:beta-1", "Ville Beta", 2.105),
      ],
      "#2563eb",
    );

    expect(zones.map((zone) => zone.name)).toEqual(["Ville Alpha", "Ville Beta"]);
    expect(zones[0]?.geometry).toMatchObject({ type: "MultiPolygon" });
    expect(boundaryEdgeCount(zones[0])).toBe(6);
    expect(boundaryEdgeCount(zones[1])).toBe(4);
    expect(zones[0]?.boundaryPaths).toHaveLength(1);
    expect(zones[0]?.fillColor[3]).toBe(78);
    expect(zones[0]?.borderColor[3]).toBe(255);
    expect(zones[0]?.labelColor[3]).toBe(255);
    expect(zones[0]?.labelPixelOffset).toEqual([0, -30]);
    expect(zones.every((zone) => zone.showLabel === true)).toBe(true);
    expect(zones[0]?.borderColor.slice(0, 3)).not.toEqual([37, 99, 235]);
    expect(zones[0]?.borderColor).not.toEqual(zones[1]?.borderColor);
  });

  it("uses polygon containment when a station city is missing or ambiguous", () => {
    const zones = buildServedCityZones(
      dataset([
        neighborhood("IRIS____A1", "A", "Ville Dupliquée", 2),
        neighborhood("IRIS____B1", "B", "Ville Dupliquée", 2.2),
      ]),
      [
        station("station:spatial", undefined, 2.205),
        station("station:ambiguous", "Ville Dupliquée", 2.205),
      ],
    );

    expect(zones).toHaveLength(1);
    expect(zones[0]?.name).toBe("Ville Dupliquée");
    expect(zones[0]?.id).toBe("served-city:b");
  });

  it("builds every city with the shared palette when no stations are provided", () => {
    const zones = buildAllCityZones(dataset([
      neighborhood("IRIS____A1", "A", "Ville Alpha", 2),
      neighborhood("IRIS____A2", "A", "Ville Alpha", 2.01),
      neighborhood("IRIS____B1", "B", "Ville Beta", 2.1),
      neighborhood("IRIS____C1", "C", "Ville Gamma", 2.2),
    ]));

    expect(zones.map((zone) => zone.name)).toEqual([
      "Ville Alpha",
      "Ville Beta",
      "Ville Gamma",
    ]);
    expect(zones.every((zone) => zone.borderColor[3] === 255)).toBe(true);
    expect(new Set(zones.map((zone) => zone.borderColor.slice(0, 3).join(","))).size).toBe(3);
    expect(zones.every((zone) => zone.id.startsWith("city:"))).toBe(true);
  });

  it("builds departments with lighter city delimitations inside", () => {
    const zones = buildDepartmentZones(dataset([
      neighborhood("IRIS____A1", "A", "Ville Alpha", 2, "92"),
      neighborhood("IRIS____B1", "B", "Ville Beta", 2.01, "92"),
      neighborhood("IRIS____C1", "C", "Ville Gamma", 2.2, "75"),
    ]));

    expect(zones.map((zone) => zone.name)).toEqual(["92 · Hauts-de-Seine", "75 · Paris"]);
    expect(zones.every((zone) => zone.kind === "department")).toBe(true);
    expect(zones.some((zone) => (zone.innerBoundaryPaths?.length ?? 0) > 0)).toBe(true);
    expect(zones.every((zone) => zone.innerBoundaryColor?.[3] === 112)).toBe(true);
  });

  it("switches directly from departments to cities at the shared zoom threshold", () => {
    const zones = buildAllGlobalZones(dataset([
      neighborhood("IRIS____A1", "A", "Ville Alpha", 2, "92"),
      neighborhood("IRIS____B1", "B", "Ville Beta", 2.1, "92"),
      neighborhood("IRIS____C1", "C", "Ville Gamma", 2.2, "75"),
      neighborhood("IRIS____D1", "D", "Ville Delta", 2.3, "75"),
    ]));

    const lowZoom = selectCityZonesForZoom(zones, 8);
    const justBeforeCityZoom = selectCityZonesForZoom(zones, GLOBAL_CITY_VIEW_MIN_ZOOM - 0.01);
    const cityZoom = selectCityZonesForZoom(zones, GLOBAL_CITY_VIEW_MIN_ZOOM);

    expect(lowZoom.every((zone) => zone.kind === "department")).toBe(true);
    expect(zones.filter((zone) => zone.kind === "department").every((zone) => zone.showLabel === true)).toBe(true);
    expect(zones.filter((zone) => zone.kind === "city").every((zone) => zone.showLabel === false)).toBe(true);
    expect(lowZoom.length).toBe(2);
    expect(justBeforeCityZoom.map((zone) => zone.id)).toEqual(lowZoom.map((zone) => zone.id));
    expect(justBeforeCityZoom.every((zone) => zone.kind === "department")).toBe(true);
    expect(cityZoom.every((zone) => zone.kind === "city")).toBe(true);
    expect(cityZoom.length).toBe(4);
    expect(cityZoneLodKey(zones, 8)).toBe("global-departments");
    expect(cityZoneLodKey(zones, GLOBAL_CITY_VIEW_MIN_ZOOM - 0.01)).toBe("global-departments");
    expect(cityZoneLodKey(zones, GLOBAL_CITY_VIEW_MIN_ZOOM)).toBe("global-cities");
  });

  it("applies the global city LOD in the render model", () => {
    const zones = buildAllGlobalZones(dataset([
      neighborhood("IRIS____A1", "A", "Ville Alpha", 2, "92"),
      neighborhood("IRIS____B1", "B", "Ville Beta", 2.1, "92"),
      neighborhood("IRIS____C1", "C", "Ville Gamma", 2.2, "75"),
      neighborhood("IRIS____D1", "D", "Ville Delta", 2.3, "75"),
    ]));
    const scene: TransportMapRenderScene = {
      lines: [],
      paths: [],
      stations: [],
      selectedStationIds: [],
      visibleModeMask: 0,
      servedCityZones: zones,
    };
    const builder = new TransportMapRenderModelBuilder();
    const lowZoomModel = builder.build(createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.5,
      zoom: 8,
      viewportWidthCssPx: 800,
      viewportHeightCssPx: 600,
    }), scene);
    const fullZoomModel = builder.build(createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.5,
      zoom: 12,
      viewportWidthCssPx: 800,
      viewportHeightCssPx: 600,
    }), scene);

    expect(lowZoomModel.servedCityZones?.every((zone) => zone.kind === "department")).toBe(true);
    expect(fullZoomModel.servedCityZones?.every((zone) => zone.kind === "city")).toBe(true);
    expect(fullZoomModel.servedCityZones?.length).toBe(4);
    expect(createDeckTransportLayers({
      camera: createCamera({
        centerWorldX: 0.5,
        centerWorldY: 0.5,
        zoom: 8,
        viewportWidthCssPx: 800,
        viewportHeightCssPx: 600,
      }),
      scene,
      model: lowZoomModel,
    }, "labels").some((layer) => layer.id === "transport-served-city-labels")).toBe(true);
    expect(createDeckTransportLayers({
      camera: createCamera({
        centerWorldX: 0.5,
        centerWorldY: 0.5,
        zoom: 12,
        viewportWidthCssPx: 800,
        viewportHeightCssPx: 600,
      }),
      scene,
      model: fullZoomModel,
    }, "labels").some((layer) => layer.id === "transport-served-city-labels")).toBe(false);
    builder.dispose();
  });

  it("collapses Paris arrondissement polygons into one labeled city", () => {
    const zones = buildServedCityZones(
      dataset([
        neighborhood("IRIS____P1", "75101", "Paris 1er Arrondissement", 2),
        neighborhood("IRIS____P2", "75102", "Paris 2e Arrondissement", 2.01),
      ]),
      [
        station("station:paris-1", "Paris 1er Arrondissement", 2.005),
        station("station:paris-2", "Paris 2e Arrondissement", 2.015),
      ],
    );

    expect(zones).toHaveLength(1);
    expect(zones[0]?.name).toBe("Paris");
    expect(boundaryEdgeCount(zones[0])).toBe(6);
  });

  it("publishes fills, bright boundaries, and labels to the Deck layer set", () => {
    const zones = buildServedCityZones(
      dataset([neighborhood("IRIS____A1", "A", "Ville Alpha", 2)]),
      [station("station:alpha", "Ville Alpha", 2.005)],
    );
    const scene: TransportMapRenderScene = {
      lines: [],
      paths: [],
      stations: [],
      selectedStationIds: [],
      visibleModeMask: 0,
      servedCityZones: zones,
    };
    const camera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.5,
      zoom: 10,
      viewportWidthCssPx: 800,
      viewportHeightCssPx: 600,
    });
    const builder = new TransportMapRenderModelBuilder();
    const model = builder.build(camera, scene);
    const layers = createDeckTransportLayers({ camera, scene, model }, "labels");

    expect(layers.map((layer) => layer.id)).toEqual([
      "transport-served-city-zones",
      "transport-served-city-boundary-halo",
      "transport-served-city-boundaries",
      "transport-served-city-labels",
    ]);
    const fillProps = layers[0]!.props as unknown as {
      data: { features: Array<{ geometry: unknown }> };
      pickable: boolean;
      beforeId: string;
    };
    expect(fillProps.data.features[0]?.geometry).toBe(zones[0]?.geometry);
    expect(fillProps.pickable).toBe(false);
    expect(fillProps.beforeId).toBe("labels");
    expect(model.servedCityZones).toBe(zones);
    const labelProps = layers[3]!.props as unknown as {
      background: boolean;
      backgroundPadding: readonly [number, number];
      getPixelOffset: (zone: typeof zones[number]) => readonly [number, number];
      parameters: { depthTest: boolean };
    };
    expect(labelProps.background).toBe(true);
    expect(labelProps.backgroundPadding).toEqual([7, 4]);
    expect(labelProps.getPixelOffset(zones[0]!)).toEqual(zones[0]?.labelPixelOffset);
    expect(labelProps.parameters.depthTest).toBe(false);

    const modelWithStationLabels = {
      ...model,
      labels: [{
        id: "station-label",
        text: "Station",
        position: [2, 48] as const,
        sizeCssPx: 12,
        color: [0, 0, 0, 255] as const,
        priority: 1,
      }],
    };
    const layersWithStationLabels = createDeckTransportLayers(
      { camera, scene, model: modelWithStationLabels },
      "labels",
    );
    expect(layersWithStationLabels.findIndex((layer) => layer.id === "transport-labels"))
      .toBeLessThan(layersWithStationLabels.findIndex((layer) => layer.id === "transport-served-city-labels"));
    const clearedModel = builder.build(camera, {
      ...scene,
      servedCityZones: [],
    });
    expect(clearedModel).not.toBe(model);
    expect(clearedModel.servedCityZones).toEqual([]);
    builder.dispose();
  });

  it("retains administrative Deck data across transport updates and zoom round trips", () => {
    const source = dataset([neighborhood("A", "A", "Alpha", 2)]);
    const zones = buildAllGlobalZones(source);
    expect(buildAllGlobalZones(source)).toBe(zones);
    const labeledZones = buildAllGlobalZones(source, { showLabels: true });
    expect(labeledZones).not.toBe(zones);
    expect(labeledZones.filter((zone) => zone.kind === "city").every((zone) => zone.showLabel)).toBe(true);
    expect(zones.filter((zone) => zone.kind === "city").every((zone) => !zone.showLabel)).toBe(true);
    const camera = createCamera({ zoom: 13, viewportWidthCssPx: 800, viewportHeightCssPx: 600 });
    const scene: TransportMapRenderScene = {
      lines: [], paths: [], stations: [], selectedStationIds: [], visibleModeMask: 0, servedCityZones: zones,
    };
    const builder = new TransportMapRenderModelBuilder();
    const initial = builder.build(camera, scene);
    const layers = createDeckTransportLayers({ camera, scene, model: initial }, "labels");
    const departmentCamera = { ...camera, zoom: 9 };
    const departments = builder.build(departmentCamera, scene);
    const departmentLayers = createDeckTransportLayers({ camera: departmentCamera, scene, model: departments }, "labels");
    const updatedScene = { ...scene, paths: [], stations: [] };
    const updated = builder.build(camera, updatedScene);
    const updatedLayers = createDeckTransportLayers({ camera, scene: updatedScene, model: updated }, "labels");
    for (const layer of layers) {
      expect(updatedLayers.find((next) => next.id === layer.id)?.props.data).toBe(layer.props.data);
    }
    expect(selectCityZonesForZoom(zones, 13)).toBe(selectCityZonesForZoom(zones, 16));
    const departmentsAgain = builder.build(departmentCamera, updatedScene);
    const departmentLayersAgain = createDeckTransportLayers({ camera: departmentCamera, scene: updatedScene, model: departmentsAgain }, "labels");
    for (const layer of departmentLayers) {
      expect(departmentLayersAgain.find((next) => next.id === layer.id)?.props.data).toBe(layer.props.data);
    }
    builder.dispose();
  });

  it("anchors a concave department label inside its territory without a screen offset", () => {
    const concave = neighborhood("C", "C", "Croissant", 2);
    concave.centroid = [2.025, 48.025]; // In the gap of the C, like Paris within the 92's mean.
    concave.geometry = { type: "Polygon", coordinates: [[
      [2, 48], [2.05, 48], [2.05, 48.01], [2.01, 48.01],
      [2.01, 48.04], [2.05, 48.04], [2.05, 48.05], [2, 48.05], [2, 48],
    ]] };
    const zone = buildDepartmentZones(dataset([concave]))[0]!;
    expect(pointInIrisGeometry({ lon: zone.centroid[0], lat: zone.centroid[1] }, zone.geometry)).toBe(true);
    expect(zone.labelPixelOffset).toEqual([0, 0]);
  });

  it("keeps interior anchors out of holes and between-island gaps", () => {
    const island = neighborhood("I", "I", "Islands", 2);
    island.centroid = [2.025, 48.025];
    island.geometry = { type: "MultiPolygon", coordinates: [
      [[[2, 48], [2.02, 48], [2.02, 48.02], [2, 48.02], [2, 48]],
        [[2.005, 48.005], [2.015, 48.005], [2.015, 48.015], [2.005, 48.015], [2.005, 48.005]]],
      [[[2.03, 48.03], [2.04, 48.03], [2.04, 48.04], [2.03, 48.04], [2.03, 48.03]]],
    ] };
    for (const centroid of [[2.025, 48.025], [2.01, 48.01]] as [number, number][]) {
      island.centroid = centroid;
      const zone = buildDepartmentZones(dataset([island]))[0]!;
      expect(pointInIrisGeometry({ lon: zone.centroid[0], lat: zone.centroid[1] }, zone.geometry)).toBe(true);
    }
  });

  it("joins reversed edges without introducing links at junctions or between islands", () => {
    const edges = [
      { from: [0, 0], to: [1, 0] }, { from: [2, 0], to: [1, 0] },
      { from: [1, 0], to: [1, 1] }, { from: [10, 0], to: [11, 0] },
    ] as Array<{ from: [number, number]; to: [number, number] }>;
    const paths = joinAdministrativeBoundarySegments(edges);
    const key = (a: number[], b: number[]) => [a.join(","), b.join(",")].sort().join("|");
    const actual = paths.flatMap((path) => path.slice(1).map((to, index) => key(path[index]!, to))).sort();
    expect(actual).toEqual(edges.map(({ from, to }) => key(from, to)).sort());
  });
});
