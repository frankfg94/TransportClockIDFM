import { describe, expect, it } from "vitest";
import type { TransportMapPathRenderRecord } from "../src/features/transport-map/render/transportMapRenderModel";
import {
  createDeckPathBinaryPacket,
  deckPathPacketKey,
  validateTransportMapBinaryPathPacket,
  packDeckPathCompilePayload,
  compileDeckPathPayload,
} from "../src/features/transport-map/render/deckgl/deckPathPacket";
import { DeckGeometryCache } from "../src/features/transport-map/render/deckgl/deckGeometryCache";
import { createDeckTransportLayers } from "../src/features/transport-map/next/deckMapLayers";
import {
  TransportMapRenderModelBuilder,
} from "../src/features/transport-map/render/transportMapRenderModel";
import { TRANSPORT_MAP_STATION_LABEL_PIXEL_OFFSET_CSS_PX } from "../src/features/transport-map/render/labelRenderTokens";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";
import { DeckGlRenderer } from "../src/features/transport-map/render/deckgl/deckGlRenderer";
import type { DeckPathPacketCompiler } from "../src/features/transport-map/render/deckgl/deckPathPacket";
import type { TransportMapRenderFrame } from "../src/features/transport-map/contracts/renderer";
import { createTransportMapPerformanceTrace } from "../src/features/transport-map/performance/transportMapPerformanceTrace";

function record(id: string, dash: TransportMapPathRenderRecord["dash"] = "solid"): TransportMapPathRenderRecord {
  return {
    id,
    pathId: id,
    lineId: `line:${id}`,
    subpathIndex: 0,
    positions: new Float64Array([2.3, 48.8, 2.4, 48.9]),
    color: [12, 34, 56, 200],
    widthCssPx: 3,
    alpha: 1,
    order: 0,
    dash,
  };
}

describe("Deck transport binary packets", () => {
  it("transfers one owned coordinate buffer and preserves every subpath and style", () => {
    const records = [record("a"), { ...record("b", "traffic-interruption"), positions: new Float64Array([2, 48, 3, 49, 4, 50]) }];
    const original = records.map(({ positions }) => Array.from(positions));
    const packed = packDeckPathCompilePayload(records, "packed");
    expect(packed.colors.buffer).toBe(packed.positions.buffer);
    expect(packed.widths.buffer).toBe(packed.positions.buffer);
    expect(packed.dashArrays.buffer).toBe(packed.positions.buffer);
    expect(packed.startIndices.buffer).toBe(packed.positions.buffer);
    const received = structuredClone(packed, { transfer: [packed.positions.buffer] });
    expect(packed.positions.byteLength).toBe(0);
    expect(records.map(({ positions }) => Array.from(positions))).toEqual(original);
    expect(compileDeckPathPayload(received)).toEqual(createDeckPathBinaryPacket(records, "packed"));
  });

  it("preserves opacity, fractional widths and fixed-pixel dashes in the compact worker payload", () => {
    const records = [
      { ...record("faint", "traffic-interruption"), alpha: 0.25, color: [12, 34, 56, 64] as const, widthCssPx: 1.23456789 },
      { ...record("opaque"), alpha: 0.9, color: [255, 0, 128, 200] as const, widthCssPx: 0.4 },
    ];
    const packed = packDeckPathCompilePayload(records, "styles");
    const received = structuredClone(packed, { transfer: [packed.positions.buffer] });
    expect(compileDeckPathPayload(received)).toEqual(createDeckPathBinaryPacket(records, "styles"));
    expect(packed.widths.byteLength).toBe(0);
    expect(records[0]!.positions.byteLength).toBeGreaterThan(0);
  });

  it("still rejects nonfinite coordinates and negative styles without expanding typed buffers", () => {
    const packet = createDeckPathBinaryPacket([record("a")], "validate");
    packet.positions[0] = Number.NaN;
    expect(() => validateTransportMapBinaryPathPacket(packet)).toThrow(/attributes/);
    packet.positions[0] = 2.3;
    packet.widths[0] = -1;
    expect(() => validateTransportMapBinaryPathPacket(packet)).toThrow(/attributes/);
    packet.widths[0] = 3;
    packet.dashArrays[0] = Number.POSITIVE_INFINITY;
    expect(() => validateTransportMapBinaryPathPacket(packet)).toThrow(/attributes/);
  });

  it("projects in the compiler with exactly the same Float64 coordinates as the former layer adapter", () => {
    const records = [record("projected:a"), record("projected:b")];
    const original = createDeckPathBinaryPacket(records, "projection");
    const projected = compileDeckPathPayload(packDeckPathCompilePayload(records, "projection", true));
    const model = { sceneVersion: 1, pathCount: 2, vertexCount: 4,
      basePaths: records, trafficPaths: [], highlightPaths: [], stations: [], quays: [], entrances: [], labels: [] };
    const frame = { camera: createCamera({ zoom: 13 }), scene: {} as TransportMapRenderFrame["scene"], model };
    const oldLayer = createDeckTransportLayers({ ...frame, binaryPackets: { base: original } }, undefined)[0]!;
    const layer = createDeckTransportLayers({ ...frame, binaryPackets: { base: projected } }, undefined)[0]!;
    const oldData = oldLayer.props.data as unknown as { attributes: { getPath: { value: Float64Array } } };
    const data = layer.props.data as unknown as { attributes: { getPath: { value: Float64Array } } };
    expect(projected.positions).toEqual(original.positions);
    expect(projected.commonPositions).toEqual(oldData.attributes.getPath.value);
    expect(data.attributes.getPath.value).toBe(projected.commonPositions);
    expect(projected.bytes).toBe(original.bytes + projected.commonPositions!.byteLength);
    expect(projected).toEqual(createDeckPathBinaryPacket(records, "projection", true));
    projected.commonPositions![0] = Number.NaN;
    expect(() => validateTransportMapBinaryPathPacket(projected)).toThrow(/attributes/);
  });

  it("packs subpaths without joining fragments and preserves dash attributes", () => {
    const first = record("path:a");
    const second = {
      ...record("path:b", "traffic-interruption"),
      positions: new Float64Array([2.4, 48.9, 2.5, 49]),
    };
    const packet = createDeckPathBinaryPacket([first, second], "traffic:test");

    expect(packet.length).toBe(2);
    expect(packet.pathCount).toBe(2);
    expect([...packet.startIndices]).toEqual([0, 2, 4]);
    expect([...packet.positions]).toEqual([...first.positions, ...second.positions]);
    expect([...packet.colors]).toEqual([
      12, 34, 56, 255,
      12, 34, 56, 255,
      12, 34, 56, 255,
      12, 34, 56, 255,
    ]);
    expect([...packet.widths]).toEqual([3, 3, 3, 3]);
    expect([...packet.dashArrays]).toEqual([
      0, 0, 0, 0,
      6.666666507720947, 8, 6.666666507720947, 8,
    ]);
    expect(packet.bytes).toBe(
      packet.positions.byteLength +
        packet.startIndices.byteLength +
        packet.colors.byteLength +
        packet.widths.byteLength +
        packet.dashArrays.byteLength,
    );
  });

  it("keeps focused paths solid and renders interruption overlays as fixed-pixel dashes", () => {
    const builder = new TransportMapRenderModelBuilder();
    const scene = {
      ...createRendererTestScene(),
      activeLineId: "line:test-bus",
    };
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 });
    const model = builder.build(camera, scene);
    const focusedRecord = model.basePaths[0];
    expect(focusedRecord?.dash).toBe("solid");

    const packet = createDeckPathBinaryPacket([record("path:traffic", "traffic-interruption")], "traffic:interruption");
    expect([...packet.dashArrays]).toEqual([
      6.666666507720947, 8, 6.666666507720947, 8,
    ]);

    const trafficModel = {
      ...model,
      basePaths: [],
      trafficPaths: [record("path:traffic", "traffic-interruption")],
    };
    const binaryFrame = {
      camera,
      scene,
      model: trafficModel,
      binaryPackets: { traffic: packet },
    } as TransportMapRenderFrame;
    const binaryLayer = createDeckTransportLayers(binaryFrame, undefined)[0] as unknown as {
      props: {
        data: { attributes: { getDashArray?: { value: unknown } } };
        dashJustified?: boolean;
      };
    };
    expect(binaryLayer.props.dashJustified).toBe(false);
    expect(binaryLayer.props.data.attributes.getDashArray?.value).toBe(packet.dashArrays);

    const objectFrame = { camera, scene, model: trafficModel } as TransportMapRenderFrame;
    const objectLayer = createDeckTransportLayers(objectFrame, undefined)[0] as unknown as {
      props: {
        getDashArray?: (record: TransportMapPathRenderRecord) => readonly [number, number];
      };
    };
    expect(objectLayer.props.getDashArray?.(trafficModel.trafficPaths[0]!)).toEqual([
      6.666666666666667, 8,
    ]);
    builder.dispose();
  });

  it("rejects packets whose per-vertex buffers cannot describe the paths", () => {
    const packet = createDeckPathBinaryPacket([record("path:a")], "invalid:test");
    expect(() => validateTransportMapBinaryPathPacket({
      ...packet,
      colors: new Uint8Array(4),
    })).toThrow(/attributes/);
    expect(() => validateTransportMapBinaryPathPacket({
      ...packet,
      startIndices: new Uint32Array([0, 1]),
    })).toThrow(/indices/);
  });

  it("passes the packet buffers to a real binary PathLayer data object", () => {
    const base = record("path:base");
    const traffic = record("path:traffic", "traffic-interruption");
    const basePacket = createDeckPathBinaryPacket([base], "base:packet");
    const trafficPacket = createDeckPathBinaryPacket([traffic], "traffic:packet");
    const model = {
      sceneVersion: 1,
      pathCount: 2,
      vertexCount: 4,
      basePaths: [base],
      trafficPaths: [traffic],
      highlightPaths: [],
      stations: [],
      quays: [],
      entrances: [],
      labels: [],
    } as const;
    const frame = {
      camera: createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 }),
      scene: {} as TransportMapRenderFrame["scene"],
      model,
      binaryPackets: { base: basePacket, traffic: trafficPacket },
    } as TransportMapRenderFrame;

    const layers = createDeckTransportLayers(frame, undefined);
    const baseData = (layers[0] as unknown as { props: { data: unknown } }).props.data as {
      length: number;
      startIndices: Uint32Array;
      attributes: Record<string, { value: unknown; size: number }>;
    };
    const trafficData = (layers[1] as unknown as { props: { data: unknown } }).props.data as typeof baseData;

    expect(baseData.length).toBe(1);
    expect(baseData.startIndices).toBe(basePacket.startIndices);
    const projected = baseData.attributes.getPath?.value as Float64Array;
    for (let index = 0; index < basePacket.positions.length; index += 2) {
      const world = lonLatToWorld({ lon: basePacket.positions[index]!, lat: basePacket.positions[index + 1]! });
      expect(projected[index]).toBeCloseTo(world.x * 512, 10);
      expect(projected[index + 1]).toBeCloseTo((1 - world.y) * 512, 10);
    }
    expect([...basePacket.positions]).toEqual([...base.positions]);
    expect(baseData.attributes.getColor?.value).toBe(basePacket.colors);
    expect(baseData.attributes.getWidth?.value).toBe(basePacket.widths);
    expect(trafficData.attributes.getDashArray?.value).toBe(trafficPacket.dashArrays);

    const secondLayers = createDeckTransportLayers(frame, undefined);
    expect((secondLayers[0] as unknown as { props: { data: unknown } }).props.data).toBe(baseData);
    expect((secondLayers[1] as unknown as { props: { data: unknown } }).props.data).toBe(trafficData);
  });

  it("enables a fine SDF outline for vector transport labels", () => {
    const labelModel = {
      sceneVersion: 1,
      pathCount: 0,
      vertexCount: 0,
      basePaths: [],
      trafficPaths: [],
      highlightPaths: [],
      stations: [],
      quays: [],
      entrances: [],
      labels: [{
        id: "station-label:test",
        text: "Cité Universitaire",
        position: [2.33, 48.81] as const,
        sizeCssPx: 13,
        color: [15, 23, 42, 255] as const,
        priority: 1,
      }],
    };
    const frame = {
      camera: createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 }),
      scene: {} as TransportMapRenderFrame["scene"],
      model: labelModel,
    } as TransportMapRenderFrame;

    const labelLayer = createDeckTransportLayers(frame, undefined).find((layer) =>
      (layer as unknown as { props: { id?: string } }).props.id === "transport-labels",
    );
    const props = (labelLayer as unknown as { props: Record<string, unknown> }).props;
    expect(props.outlineWidth).toBe(48);
    expect(props.outlineColor).toEqual([255, 255, 255, 255]);
    expect(props.characterSet).toBe("auto");
    expect((props.getText as (value: typeof labelModel.labels[0]) => string)(labelModel.labels[0]!))
      .toBe("Cité Universitaire");
    expect(props.fontSettings).toMatchObject({
      sdf: true,
      fontSize: 192,
      buffer: 16,
      radius: 48,
      smoothing: 0.22,
    });
  });

  it("prepares station labels above and to the right of their marker", () => {
    const builder = new TransportMapRenderModelBuilder();
    const scene = { ...createRendererTestScene(), activeLineId: "line:test-bus" };
    const model = builder.build(
      createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 }),
      scene,
    );

    expect(model.labels.map((label) => label.pixelOffsetCssPx)).toEqual([
      TRANSPORT_MAP_STATION_LABEL_PIXEL_OFFSET_CSS_PX,
      TRANSPORT_MAP_STATION_LABEL_PIXEL_OFFSET_CSS_PX,
    ]);
    builder.dispose();
  });

  it("keeps focused station exit labels when no line is active", () => {
    const builder = new TransportMapRenderModelBuilder();
    const scene = createRendererTestScene();
    const station = scene.stations[0]!;
    const entrance = {
      id: "entrance:test-a",
      stationIndex: station.index,
      stationId: station.id,
      name: "Rue de Rivoli",
      code: "1",
      lon: station.lon,
      lat: station.lat,
      worldX: station.worldX,
      worldY: station.worldY,
    };
    const model = builder.build(
      createCamera({ centerWorldX: station.worldX, centerWorldY: station.worldY, zoom: 16 }),
      {
        ...scene,
        activeStationId: station.id,
        entrances: [entrance],
        entranceStationIds: [station.id],
      },
    );

    expect(model.labels).toEqual([
      expect.objectContaining({
        id: "entrance-label:entrance:test-a",
        text: "1 · Rue de Rivoli",
      }),
    ]);
    builder.dispose();
  });

  it("reuses the prepared scene and advances geometryVersion only for new geometry", () => {
    const builder = new TransportMapRenderModelBuilder();
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 });
    const scene = createRendererTestScene();
    const first = builder.build(camera, scene);
    const second = builder.build(camera, scene);

    expect(second).toBe(first);
    expect(second.geometryVersion).toBe(first.geometryVersion);
    expect(second.pathIdentity).toBe(first.pathIdentity);

    const changed = builder.build(camera, { ...scene, paths: [...scene.paths] });
    expect(changed).not.toBe(first);
    expect(changed.geometryVersion).toBeGreaterThan(first.geometryVersion ?? 0);
    expect(changed.pathIdentity).not.toBe(first.pathIdentity);
    builder.dispose();
  });

  it("reuses prepared paths across unrelated scene changes and invalidates real path inputs", () => {
    const builder = new TransportMapRenderModelBuilder();
    const scene = createRendererTestScene();
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 });
    const first = builder.build(camera, scene);

    const stationStateChanged = builder.build(camera, {
      ...scene,
      stations: scene.stations.map((station, index) =>
        index === 0 ? { ...station, isHub: true } : station,
      ),
    });
    expect(stationStateChanged).not.toBe(first);
    expect(stationStateChanged.sceneVersion).not.toBe(first.sceneVersion);
    expect(stationStateChanged.basePaths).toBe(first.basePaths);
    expect(stationStateChanged.trafficPaths).toBe(first.trafficPaths);
    expect(stationStateChanged.highlightPaths).toBe(first.highlightPaths);

    const geometryChanged = builder.build(camera, {
      ...scene,
      paths: scene.paths.map((path) => ({ ...path, vertices: [...path.vertices] })),
    });
    expect(geometryChanged.basePaths).not.toBe(first.basePaths);

    const filterChanged = builder.build(camera, { ...scene, visibleModeMask: 0 });
    expect(filterChanged.basePaths).not.toBe(geometryChanged.basePaths);
    expect(filterChanged.basePaths).toHaveLength(0);

    const lodChangedBuilder = new TransportMapRenderModelBuilder();
    const lowZoomModel = lodChangedBuilder.build(
      createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 10 }),
      scene,
    );
    const highZoomModel = lodChangedBuilder.build(
      createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 }),
      scene,
    );
    expect(highZoomModel.basePaths).not.toBe(lowZoomModel.basePaths);

    const roleBuilder = new TransportMapRenderModelBuilder();
    const stable = roleBuilder.build(camera, scene);
    const trafficChanged = roleBuilder.build(camera, {
      ...scene,
      trafficPathSpans: [{
        pathId: scene.paths[0]!.id,
        startVertexIndex: 0,
        endVertexIndex: 1,
        kind: "interruption",
        disruptionId: "disruption:test",
      }],
    });
    expect(trafficChanged.basePaths).toBe(stable.basePaths);
    expect(trafficChanged.trafficPaths).not.toBe(stable.trafficPaths);
    const hovered = roleBuilder.build(camera, {
      ...scene,
      hoveredLineId: scene.lines[0]!.id,
      trafficPathSpans: [{
        pathId: scene.paths[0]!.id,
        startVertexIndex: 0,
        endVertexIndex: 1,
        kind: "interruption",
        disruptionId: "disruption:test",
      }],
    });
    expect(hovered.basePaths).toBe(stable.basePaths);
    expect(hovered.highlightPaths).not.toBe(stable.highlightPaths);
    roleBuilder.dispose();
    lodChangedBuilder.dispose();
    builder.dispose();
  });

  it("reuses the exact rounded geometry and binary packet after a zoom reversal", async () => {
    const scene = createRendererTestScene();
    scene.lines[0]!.mode = "METRO";
    scene.visibleModeMask = 2;
    const bend = lonLatToWorld({ lon: 2.4, lat: 48.8 });
    scene.paths[0]!.vertices.splice(1, 0, bend);
    const calls: string[] = [];
    const frames: TransportMapRenderFrame[] = [];
    const renderer = new DeckGlRenderer(undefined, {
      compile(records, key) {
        calls.push(key);
        return Promise.resolve(createDeckPathBinaryPacket(records, key));
      },
    });
    renderer.attachHost({ present: (frame) => frames.push(frame), resize() {}, dispose() {} });
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 13 });
    renderer.render(camera, scene);
    await new Promise(resolve => setTimeout(resolve, 0));
    const first = frames.at(-1)!;
    renderer.render({ ...camera, zoom: 13.5 }, scene);
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = frames.at(-1)!;
    expect(second.model.basePaths[0]!.positions).not.toEqual(first.model.basePaths[0]!.positions);
    renderer.render(camera, scene);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(frames.at(-1)!.model.basePaths).toBe(first.model.basePaths);
    expect(frames.at(-1)!.binaryPackets!.base).toBe(first.binaryPackets!.base);
    expect(calls).toHaveLength(2);
    renderer.dispose();
  });

  it("does not invalidate unrounded road geometry for each quarter zoom", () => {
    const scene = createRendererTestScene();
    const builder = new TransportMapRenderModelBuilder();
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 13 });
    const first = builder.build(camera, scene);
    const next = builder.build({ ...camera, zoom: 13.5 }, scene);
    expect(next.basePaths).toBe(first.basePaths);
    expect(next.basePathIdentity).toBe(first.basePathIdentity);
    builder.dispose();
  });

  it("updates only Metro curves during zoom and keeps road records in their exact order", () => {
    const scene = createRendererTestScene();
    const metroId = "line:metro";
    scene.lines.push({ ...scene.lines[0]!, id: metroId, mode: "METRO" });
    const bend = lonLatToWorld({ lon: 2.4, lat: 48.8 });
    scene.paths.push({ ...scene.paths[0]!, id: "path:metro", lineId: metroId,
      vertices: [scene.paths[0]!.vertices[0]!, bend, scene.paths[0]!.vertices[1]!] });
    scene.visibleModeMask = 3;
    const builder = new TransportMapRenderModelBuilder();
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 13 });
    const first = builder.build(camera, scene);
    const next = builder.build({ ...camera, zoom: 13.25 }, scene);
    expect(next.basePaths.map(record => record.pathId)).toEqual(first.basePaths.map(record => record.pathId));
    expect(next.basePaths[0]).toBe(first.basePaths[0]);
    expect(first.basePathBatches).toHaveLength(2);
    expect(next.basePathBatches![0]).toBe(first.basePathBatches![0]);
    expect(next.basePathBatches![1]!.identity).not.toBe(first.basePathBatches![1]!.identity);
    expect(next.basePaths[1]!.positions).not.toEqual(first.basePaths[1]!.positions);
    expect(builder.pathCacheMetrics()).toMatchObject({ zoomOnlyRefresh: true, pathsVisited: 0, roundingBuilds: 1 });
    builder.build({ ...camera, zoom: 13.5 }, scene);
    const reversed = builder.build({ ...camera, zoom: 13.25 }, scene);
    expect(reversed.basePaths).toBe(next.basePaths);
    expect(builder.pathCacheMetrics()).toMatchObject({ hit: true, roundingBuilds: 0 });
    // Evict the complete bundle, while its small curve records remain cached.
    for (let step = 1; step <= 34; step += 1) builder.build({ ...camera, zoom: 14 + step / 4 }, scene);
    const afterBundleEviction = builder.build({ ...camera, zoom: 13.25 }, scene);
    expect(builder.pathCacheMetrics().hit).toBe(false);
    expect(afterBundleEviction.basePathBatches![1]!.identity).toBe(next.basePathBatches![1]!.identity);
    expect(afterBundleEviction.basePathBatches![1]!.records[0]).toBe(next.basePathBatches![1]!.records[0]);
    builder.dispose();
  });

  it("compiles only changed curve batches and publishes all batches atomically without changing draw order", async () => {
    const scene = createRendererTestScene();
    scene.lines.push({ ...scene.lines[0]!, id: "line:metro", mode: "METRO" });
    const bend = lonLatToWorld({ lon: 2.4, lat: 48.8 });
    scene.paths.push({ ...scene.paths[0]!, id: "path:metro", lineId: "line:metro",
      vertices: [scene.paths[0]!.vertices[0]!, bend, scene.paths[0]!.vertices[1]!] },
      { ...scene.paths[0]!, id: "path:road-after" });
    scene.visibleModeMask = 3;
    scene.continuousRendering = true;
    const pending: Array<{ records: readonly TransportMapPathRenderRecord[]; resolve: () => void }> = [];
    const frames: TransportMapRenderFrame[] = [];
    const renderer = new DeckGlRenderer(undefined, {
      compile(records, key) {
        return new Promise(resolve => pending.push({ records, resolve: () => resolve(createDeckPathBinaryPacket(records, key)) }));
      },
    });
    renderer.attachHost({ present: frame => frames.push(frame), resize() {}, dispose() {} });
    const camera = createCamera({ zoom: 13 });
    renderer.render(camera, scene);
    await Promise.resolve();
    expect(pending).toHaveLength(3);
    pending[0]!.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    // Another camera frame while only one worker reply is ready stays entirely object data.
    renderer.render({ ...camera, centerWorldX: camera.centerWorldX + 0.001 }, scene);
    expect(frames.at(-1)!.binaryPackets).toBeUndefined();
    pending.slice(1).forEach(entry => entry.resolve());
    await new Promise(resolve => setTimeout(resolve, 0));
    const stable = frames.at(-1)!;
    expect(stable.binaryPackets!.baseBatches).toHaveLength(3);
    expect(stable.binaryPackets!.baseBatches!.flatMap(packet => packet!.pathIds)).toEqual(stable.model.basePaths.map(record => record.pathId));
    const layers = createDeckTransportLayers(stable, "symbol");
    const pathLayers = layers.filter(layer => layer.id.startsWith("transport-base:"));
    expect(pathLayers.map(layer => layer.id)).toEqual(stable.model.basePathBatches!.map(batch => `${batch.id}-binary`));

    renderer.render({ ...camera, zoom: 13.25 }, { ...scene, interactionActive: true });
    await Promise.resolve();
    expect(pending).toHaveLength(4);
    expect(pending[3]!.records.map(record => record.pathId)).toEqual(["path:metro"]);
    expect(frames.at(-1)!.model).toBe(stable.model);
    pending[3]!.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    const changed = frames.at(-1)!;
    expect(changed.model).not.toBe(stable.model);
    expect(changed.binaryPackets!.baseBatches![0]).toBe(stable.binaryPackets!.baseBatches![0]);
    expect(changed.binaryPackets!.baseBatches![2]).toBe(stable.binaryPackets!.baseBatches![2]);

    // The response for an obsolete zoom must never put that geometry back on screen.
    renderer.render({ ...camera, zoom: 13.5 }, scene);
    await Promise.resolve();
    expect(pending).toHaveLength(5);
    renderer.render(camera, scene);
    const reversedModel = frames.at(-1)!.model;
    expect(reversedModel.basePaths).toBe(stable.model.basePaths);
    pending[4]!.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(frames.at(-1)!.model).toBe(reversedModel);
    expect(frames.at(-1)!.binaryPackets!.baseBatches![1]).toBe(stable.binaryPackets!.baseBatches![1]);
    renderer.dispose();
  });

  it("does not recompile base packets for a station-only scene generation", async () => {
    const calls: string[] = [];
    const compiler: DeckPathPacketCompiler = {
      compile(records, key) {
        calls.push(key);
        return Promise.resolve(createDeckPathBinaryPacket(records, key));
      },
    };
    const renderer = new DeckGlRenderer(undefined, compiler);
    renderer.attachHost({
      present: () => undefined,
      resize: () => undefined,
      dispose: () => undefined,
    });
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 });
    const scene = createRendererTestScene();

    renderer.render(camera, scene);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const firstMetrics = renderer.getMetrics();
    const firstBaseCalls = calls.filter((key) => key.startsWith("base:")).length;

    const stationVisibilityChanged = {
      ...scene,
      stations: scene.stations.map((station, index) =>
        index === 0 ? { ...station, isHub: true } : station,
      ),
    };
    renderer.render(camera, stationVisibilityChanged);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const secondMetrics = renderer.getMetrics();

    expect(secondMetrics.basePacketBuilds).toBe(firstMetrics.basePacketBuilds);
    expect(firstMetrics.pathModelBuildCount).toBeGreaterThanOrEqual(1);
    expect(secondMetrics.pathModelReuseCount).toBeGreaterThan(firstMetrics.pathModelReuseCount ?? 0);
    expect(calls.filter((key) => key.startsWith("base:")).length).toBe(firstBaseCalls);

    const pathChanged = {
      ...stationVisibilityChanged,
      paths: stationVisibilityChanged.paths.map((path) => ({ ...path, vertices: [...path.vertices] })),
    };
    renderer.render(camera, pathChanged);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterPathChangeCalls = calls.filter((key) => key.startsWith("base:")).length;
    expect(afterPathChangeCalls).toBeGreaterThan(firstBaseCalls);

    const styleChanged = {
      ...pathChanged,
      lines: pathChanged.lines.map((line) => ({ ...line, color: "#dc2626" })),
    };
    renderer.render(camera, styleChanged);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.filter((key) => key.startsWith("base:")).length).toBeGreaterThan(afterPathChangeCalls);
    renderer.dispose();
  });

  it("prepares large source changes cooperatively and only publishes the latest request", async () => {
    const scheduled: Array<() => void> = [];
    const frames: TransportMapRenderFrame[] = [];
    const compiledPaths: string[][] = [];
    const renderer = new DeckGlRenderer(undefined, {
      compile(records, key) {
        compiledPaths.push(records.map(record => record.pathId));
        return Promise.resolve(createDeckPathBinaryPacket(records, key));
      },
    }, { minPaths: 1, sliceBudgetMs: 0, schedule: work => scheduled.push(work) });
    const camera = createCamera({ zoom: 13 });
    const scene = createRendererTestScene();
    renderer.attachHost({ present: frame => frames.push(frame), resize() {}, dispose() {} });
    renderer.render(camera, { ...scene, paths: [] });
    const empty = frames.at(-1)!.model;
    renderer.render(camera, scene);
    scheduled.shift()!(); // Suspend before processing the first path.
    const latestScene = { ...scene, paths: [{ ...scene.paths[0]!, id: "latest:path" }] };
    const latestCamera = { ...camera, centerWorldX: camera.centerWorldX + 0.02 };
    renderer.render(latestCamera, latestScene);
    expect(frames.at(-1)!.model).toBe(empty);
    expect(frames.at(-1)!.camera).toBe(latestCamera);
    while (scheduled.length) scheduled.shift()!();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(compiledPaths).toEqual([["latest:path"]]);
    expect(frames.at(-1)!.model.basePaths.map(record => record.pathId)).toEqual(["latest:path"]);
    expect(frames.at(-1)!.binaryPackets!.base).toBeDefined();
    expect(renderer.getMetrics().modelPreparationSlices).toBeGreaterThan(1);
    renderer.render(camera, { ...scene, paths: [{ ...scene.paths[0]!, id: "cancelled:path" }] });
    const countBeforeDispose = frames.length;
    renderer.dispose();
    while (scheduled.length) scheduled.shift()!();
    expect(frames).toHaveLength(countBeforeDispose);
  });

  it("yields between rounded paths on a zoom-only refresh and never publishes an obsolete zoom", async () => {
    const scene = createRendererTestScene();
    scene.lines[0]!.mode = "METRO";
    scene.visibleModeMask = 2;
    const bend = lonLatToWorld({ lon: 2.4, lat: 48.8 });
    scene.paths = Array.from({ length: 5 }, (_, index) => ({ ...scene.paths[0]!,
      id: `metro:${index}`, vertices: [scene.paths[0]!.vertices[0]!, bend, scene.paths[0]!.vertices[1]!] }));
    const scheduled: Array<() => void> = [];
    const frames: TransportMapRenderFrame[] = [];
    const renderer = new DeckGlRenderer(undefined, { compile(records, key) {
      return Promise.resolve(createDeckPathBinaryPacket(records, key));
    } }, { minPaths: 1, sliceBudgetMs: 0, schedule: work => scheduled.push(work) });
    renderer.attachHost({ present: frame => frames.push(frame), resize() {}, dispose() {} });
    const camera = createCamera({ zoom: 13 });
    renderer.render(camera, scene);
    while (scheduled.length) scheduled.shift()!();
    await new Promise(resolve => setTimeout(resolve, 0));
    const original = frames.at(-1)!.model;
    renderer.render({ ...camera, zoom: 13.25 }, scene);
    expect(scheduled).toHaveLength(1);
    expect(frames.at(-1)!.model).toBe(original);
    scheduled.shift()!();
    expect(scheduled).toHaveLength(1);
    expect(frames.at(-1)!.model).toBe(original);
    renderer.render({ ...camera, zoom: 13.5 }, scene);
    while (scheduled.length) scheduled.shift()!();
    await new Promise(resolve => setTimeout(resolve, 0));
    const reference = new TransportMapRenderModelBuilder();
    const expected = reference.build({ ...camera, zoom: 13.5 }, scene);
    expect(frames.at(-1)!.model.basePaths.map(record => record.positions)).toEqual(expected.basePaths.map(record => record.positions));
    expect(frames.at(-1)!.camera.zoom).toBe(13.5);
    const slices = renderer.getMetrics().modelPreparationSlices;
    renderer.render({ ...camera, zoom: 13.49 }, scene);
    expect(scheduled).toHaveLength(0);
    expect(renderer.getMetrics().modelPreparationSlices).toBe(slices);
    reference.dispose();
    renderer.dispose();
  });

  it("does not schedule curve preparation for a road-only quarter-zoom change", async () => {
    const scene = createRendererTestScene();
    const scheduled: Array<() => void> = [];
    const frames: TransportMapRenderFrame[] = [];
    const renderer = new DeckGlRenderer(undefined, { compile(records, key) {
      return Promise.resolve(createDeckPathBinaryPacket(records, key));
    } }, { minPaths: 1, sliceBudgetMs: 0, schedule: work => scheduled.push(work) });
    renderer.attachHost({ present: frame => frames.push(frame), resize() {}, dispose() {} });
    const camera = createCamera({ zoom: 13 });
    renderer.render(camera, scene);
    while (scheduled.length) scheduled.shift()!();
    await new Promise(resolve => setTimeout(resolve, 0));
    const original = frames.at(-1)!.model.basePaths;
    renderer.render({ ...camera, zoom: 13.25 }, scene);
    expect(scheduled).toHaveLength(0);
    expect(frames.at(-1)!.model.basePaths).toBe(original);
    renderer.dispose();
  });

  it("can present the first transport geometry directly as binary without a redundant object GPU upload", async () => {
    let finish: (() => void) | undefined;
    const frames: TransportMapRenderFrame[] = [];
    const renderer = new DeckGlRenderer(undefined, { compile(records, key) {
      return new Promise(resolve => { finish = () => resolve(createDeckPathBinaryPacket(records, key, true)); });
    } }, { minPaths: 100, sliceBudgetMs: 2, schedule: work => work(), waitForInitialBinary: true });
    renderer.attachHost({ present: frame => frames.push(frame), resize() {}, dispose() {} });
    renderer.render(createCamera({ zoom: 13 }), createRendererTestScene());
    expect(frames).toHaveLength(0);
    await Promise.resolve();
    finish!();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.binaryPackets!.base).toBeDefined();
    expect(renderer.getMetrics().objectFallbackFrames).toBe(0);
    renderer.dispose();
  });

  it("keeps packet keys stable for the same prepared records and separates records with equal lengths", () => {
    const first = record("path:a");
    const sameGeometryDifferentIdentity = { ...first, positions: new Float64Array(first.positions) };
    expect(deckPathPacketKey([first], "base")).toBe(deckPathPacketKey([first], "base"));
    expect(deckPathPacketKey([first], "base")).not.toBe(
      deckPathPacketKey([sameGeometryDifferentIdentity], "base"),
    );
    expect(deckPathPacketKey([first], "base")).not.toBe(deckPathPacketKey([first], "traffic"));
  });

  it("uses a short generation identity instead of serializing every path", () => {
    const records = Array.from({ length: 2_000 }, (_, index) => record(`path:${index}`));
    const firstKey = deckPathPacketKey(records, "base", "g12-p4");
    const sameGenerationKey = deckPathPacketKey(records, "base", "g12-p4");
    const nextGenerationKey = deckPathPacketKey(records, "base", "g13-p5");

    expect(firstKey).toBe(sameGenerationKey);
    expect(firstKey).not.toBe(nextGenerationKey);
    expect(firstKey.length).toBeLessThan(32);
  });

  it("holds the last complete binary frame while a rapid hover packet is pending", async () => {
    const pending = new Map<string, {
      records: readonly TransportMapPathRenderRecord[];
      resolve: () => void;
    }>();
    const compiler: DeckPathPacketCompiler = {
      compile(records, key) {
        return new Promise((resolve) => {
          pending.set(key, {
            records,
            resolve: () => resolve(createDeckPathBinaryPacket(records, key)),
          });
        });
      },
    };
    const frames: TransportMapRenderFrame[] = [];
    const host = {
      present: (frame: TransportMapRenderFrame) => frames.push(frame),
      resize: () => undefined,
      dispose: () => undefined,
      getPresentationMetrics: () => ({ layerRebuilds: frames.length, setPropsCount: frames.length }),
    };
    const renderer = new DeckGlRenderer(undefined, compiler);
    const scene = createRendererTestScene();
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 });
    renderer.attachHost(host);

    renderer.render(camera, scene);
    await Promise.resolve();
    const initialKey = [...pending.keys()][0]!;
    pending.get(initialKey)!.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(frames.at(-1)?.binaryPackets?.base).toBeDefined();

    const stableBinaryFrame = frames.at(-1)!;
    renderer.render(camera, { ...scene, hoveredLineId: scene.lines[0]!.id });
    expect(frames.at(-1)?.model).toBe(stableBinaryFrame.model);
    expect(frames.at(-1)?.binaryPackets?.base).toBe(stableBinaryFrame.binaryPackets?.base);
    expect(frames.at(-1)?.binaryPackets?.highlight).toBeUndefined();

    await Promise.resolve();
    for (const entry of pending.values()) entry.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(frames.at(-1)?.model).not.toBe(stableBinaryFrame.model);
    expect(frames.at(-1)?.binaryPackets?.base).toBeDefined();
    expect(frames.at(-1)?.binaryPackets?.highlight).toBeDefined();
    expect(renderer.getMetrics().objectFallbackFrames).toBe(1);
    renderer.dispose();
  });

  it.each([false, true])("publishes complete binary packets during motion only in continuous mode (%s)", async (continuousRendering) => {
    const pending: Array<() => void> = [];
    const compiler: DeckPathPacketCompiler = {
      compile(records, key) {
        return new Promise((resolve) => pending.push(() => resolve(createDeckPathBinaryPacket(records, key))));
      },
    };
    const frames: TransportMapRenderFrame[] = [];
    const renderer = new DeckGlRenderer(undefined, compiler);
    renderer.attachHost({ present: (frame) => frames.push(frame), resize: () => undefined, dispose: () => undefined });
    const scene = createRendererTestScene();
    const camera = createCamera({ zoom: 12 });
    renderer.render(camera, scene);
    await Promise.resolve();
    pending.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stable = frames.at(-1)!;
    const nextScene = { ...scene, paths: scene.paths.map((path) => ({ ...path, id: "new:path" })), interactionActive: true, continuousRendering };
    renderer.render({ ...camera, zoom: 11 }, nextScene);
    expect(frames.at(-1)!.model).toBe(stable.model);
    await Promise.resolve();
    pending.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (continuousRendering) {
      expect(frames.at(-1)!.model).not.toBe(stable.model);
      expect(frames.at(-1)!.binaryPackets?.base).toBeDefined();
      expect(frames.at(-1)!.scene.interactionActive).toBe(true);
    } else {
      expect(frames.at(-1)!.model).toBe(stable.model);
      renderer.render(camera, { ...nextScene, interactionActive: false });
      expect(frames.at(-1)!.model).not.toBe(stable.model);
    }
    expect(renderer.getMetrics().objectFallbackFrames).toBe(1);
    renderer.dispose();
  });

  it("presents preloaded line geometry during a camera flight before its binary packet is ready", async () => {
    const pending = new Map<string, {
      resolve: () => void;
    }>();
    const compiler: DeckPathPacketCompiler = {
      compile(_records, key) {
        return new Promise((resolve) => {
          pending.set(key, { resolve: () => resolve(createDeckPathBinaryPacket(_records, key)) });
        });
      },
    };
    const frames: TransportMapRenderFrame[] = [];
    const host = {
      present: (frame: TransportMapRenderFrame) => frames.push(frame),
      resize: () => undefined,
      dispose: () => undefined,
    };
    const renderer = new DeckGlRenderer(undefined, compiler);
    const scene = createRendererTestScene();
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 });
    renderer.attachHost(host);

    renderer.render(camera, scene);
    await Promise.resolve();
    const initialKey = [...pending.keys()][0]!;
    pending.get(initialKey)!.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stableFrame = frames.at(-1)!;

    const preloadedScene = {
      ...scene,
      paths: scene.paths.map((path) => ({ ...path, id: "path:test-preloaded" })),
      interactionActive: true,
      allowGeometrySwapDuringInteraction: true,
    };
    renderer.render(camera, preloadedScene);

    expect(frames.at(-1)?.model).not.toBe(stableFrame.model);
    expect(frames.at(-1)?.scene.allowGeometrySwapDuringInteraction).toBe(true);
    expect(frames.at(-1)?.binaryPackets?.base).toBeUndefined();
    renderer.dispose();
  });

  it("does not populate binary trace bookkeeping before a trace session starts", async () => {
    const trace = createTransportMapPerformanceTrace({ observeLongTasks: false });
    const renderer = new DeckGlRenderer();
    const frames: TransportMapRenderFrame[] = [];
    renderer.attachHost({
      present: (frame) => frames.push(frame),
      resize: () => undefined,
      dispose: () => undefined,
    });
    const scene = createRendererTestScene();
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 });

    renderer.setPerformanceTrace(trace);
    renderer.render(camera, scene);
    await new Promise((resolve) => setTimeout(resolve, 0));
    trace.start();
    renderer.render(camera, scene);
    const report = trace.stop();

    expect(report.events.some((event) => event.type === "binary_cache_hit")).toBe(true);
    expect(frames.length).toBeGreaterThan(0);
    renderer.dispose();
  });

  it("evicts by bytes while retaining LRU hits", () => {
    const first = createDeckPathBinaryPacket([record("a")], "a");
    const second = createDeckPathBinaryPacket([record("b")], "b");
    const cache = new DeckGeometryCache(first.bytes + second.bytes);
    cache.set(first);
    cache.set(second);
    expect(cache.get(first.key)).toBe(first);
    expect(cache.metrics().hits).toBe(1);

    const third = createDeckPathBinaryPacket([record("c")], "c");
    cache.set(third);
    expect(cache.metrics().bytes).toBeLessThanOrEqual(first.bytes + second.bytes);
    expect(cache.metrics().evictions).toBeGreaterThan(0);
  });
});

function createRendererTestScene(): TransportMapRenderFrame["scene"] {
  const lineId = "line:test-bus";
  const first = lonLatToWorld({ lon: 2.3, lat: 48.8 });
  const second = lonLatToWorld({ lon: 2.4, lat: 48.9 });
  const firstStationId = "station:test-a";
  const secondStationId = "station:test-b";
  return {
    lines: [{
      id: lineId,
      index: 0,
      code: "TEST",
      label: "Test",
      mode: "BUS",
      color: "#2563eb",
      textColor: "#ffffff",
      aliases: [],
      stationIds: [firstStationId, secondStationId],
      geometryIds: ["path:test"],
    }],
    paths: [{
      id: "path:test",
      lineId,
      geometrySource: "gtfs",
      sourceVersion: "test",
      quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
      stationIds: [firstStationId, secondStationId],
      vertices: [
        { stationId: firstStationId, x: first.x, y: first.y },
        { stationId: secondStationId, x: second.x, y: second.y },
      ],
      minX: Math.min(first.x, second.x),
      minY: Math.min(first.y, second.y),
      maxX: Math.max(first.x, second.x),
      maxY: Math.max(first.y, second.y),
      chunkIds: [],
    }],
    stations: [
      createRendererTestStation(firstStationId, "A", first.x, first.y, lineId),
      createRendererTestStation(secondStationId, "B", second.x, second.y, lineId),
    ],
    selectedStationIds: [],
    visibleModeMask: 1,
  };
}

function createRendererTestStation(
  id: string,
  name: string,
  worldX: number,
  worldY: number,
  lineId: string,
) {
  return {
    id,
    index: 0,
    name,
    normalizedName: name.toLowerCase(),
    aliases: [],
    rawRefs: [],
    lineIds: [lineId],
    ownerChunkId: "z11-0-0",
    isHub: false,
    sourceCrs: "EPSG:2154" as const,
    sourceX: 0,
    sourceY: 0,
    lon: 2.3,
    lat: 48.8,
    worldX,
    worldY,
    coordinateSource: "gtfs" as const,
    transformVersion: "lambert93-ntf-v1" as const,
  };
}
