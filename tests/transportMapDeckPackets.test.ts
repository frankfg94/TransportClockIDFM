import { describe, expect, it } from "vitest";
import type { TransportMapPathRenderRecord } from "../src/features/transport-map/render/transportMapRenderModel";
import {
  createDeckPathBinaryPacket,
  deckPathPacketKey,
  validateTransportMapBinaryPathPacket,
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
    expect(baseData.attributes.getPath?.value).toBe(basePacket.positions);
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
        id: "label:test",
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
