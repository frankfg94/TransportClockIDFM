import assert from "node:assert/strict";
import { createCamera } from "../../src/features/transport-map/geo/camera";
import type { IrisDataset } from "../../src/features/transport-map/iris/irisApi";
import { pointInIrisGeometry } from "../../src/features/transport-map/iris/irisGeometry";
import { buildAllGlobalZones, selectCityZonesForZoom } from "../../src/features/transport-map/iris/servedCityZones";
import { createDeckTransportLayers } from "../../src/features/transport-map/next/deckMapLayers";
import { TransportMapRenderModelBuilder } from "../../src/features/transport-map/render/transportMapRenderModel";
import type { TransportMapRenderScene } from "../../src/features/transport-map/contracts/renderer";

// Run with the local Nuxt server: npx.cmd tsx scripts/transport-map/bench-administrative.ts
// Measures JS preparation/data reuse, not frame rate or GPU draw duration.
const response = await fetch(new URL("/api/iris", process.argv[2] ?? "http://localhost:3000"));
assert(response.ok, `IRIS HTTP ${response.status}`);
const dataset = await response.json() as IrisDataset;
let start = performance.now();
const zones = buildAllGlobalZones(dataset);
const coldBuildMs = performance.now() - start;
start = performance.now();
assert.equal(buildAllGlobalZones(dataset), zones);
const cachedBuildMs = performance.now() - start;
const cities = selectCityZonesForZoom(zones, 13);
const departments = selectCityZonesForZoom(zones, 9);
for (const zone of departments) {
  assert(pointInIrisGeometry({ lon: zone.centroid[0], lat: zone.centroid[1] }, zone.geometry), zone.id);
}
const camera = createCamera({ zoom: 13, viewportWidthCssPx: 1200, viewportHeightCssPx: 800 });
const scene: TransportMapRenderScene = {
  lines: [], paths: [], stations: [], selectedStationIds: [], visibleModeMask: 0, servedCityZones: zones,
};
const builder = new TransportMapRenderModelBuilder();
const model = builder.build(camera, scene);
const initialLayers = createDeckTransportLayers({ camera, scene, model }, undefined);
start = performance.now();
for (let index = 0; index < 100; index += 1) {
  const layers = createDeckTransportLayers({ camera, scene, model }, undefined);
  for (const layer of layers) {
    assert.equal(layer.props.data, initialLayers.find((initial) => initial.id === layer.id)?.props.data);
  }
}
console.log(JSON.stringify({
  coldBuildMs, cachedBuildMs, cachedLayersMeanMs: (performance.now() - start) / 100,
  cities: cities.length,
  cityPaths: cities.reduce((sum, zone) => sum + zone.boundaryPaths.length, 0),
  cityEdges: cities.reduce((sum, zone) => sum + zone.boundaryPaths.reduce((n, path) => n + path.length - 1, 0), 0),
  departmentLabels: departments.map((zone) => ({ id: zone.id, anchor: zone.centroid })),
  stableDeckData: true,
}, null, 2));
builder.dispose();
