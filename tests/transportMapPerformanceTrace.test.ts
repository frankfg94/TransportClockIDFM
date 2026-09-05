import { describe, expect, it } from "vitest";
import {
  createTransportMapPerformanceTrace,
  TRANSPORT_MAP_TRACE_THRESHOLDS,
} from "../src/features/transport-map/performance/transportMapPerformanceTrace";
import {
  TransportMapMapLibreTraceProbe,
  type TransportMapMapLibreTraceMap,
} from "../src/features/transport-map/performance/transportMapMapLibreTrace";

describe("transport map causal performance trace", () => {
  it("supports an explicit OFF mode without starting probes or recording frames", () => {
    let now = 0;
    const trace = createTransportMapPerformanceTrace({
      mode: "off",
      now: () => now,
      observeLongTasks: false,
    });

    trace.start({ scenario: "off" });
    trace.instant("camera_update", { zoom: 12 });
    now = 60;
    trace.recordFrame(60, 60);
    const report = trace.stop();

    expect(trace.isRunning).toBe(false);
    expect(report.traceMode).toBe("off");
    expect(report.eventCount).toBe(0);
    expect(report.frameCount).toBe(0);
  });

  it("correlates a slow frame with overlapping LOD, chunk, binary and Deck work", () => {
    let now = 0;
    const trace = createTransportMapPerformanceTrace({
      now: () => now,
      observeLongTasks: false,
    });

    trace.start({ scenario: "synthetic" });
    const refresh = trace.begin("viewport_refresh", { generation: 4 });
    trace.instant("lod_change", { previousLevel: 0, newLevel: 1 });
    now = 5;
    const chunk = trace.begin("chunk_request_batch", { requested: 3 }, refresh);
    now = 10;
    trace.instant("binary_cache_miss", { role: "base" });
    const compile = trace.begin("binary_compile", { pathCount: 12, vertexCount: 48 });
    now = 40;
    trace.instant("deck_data_changed", { layerId: "transport-base", reason: "binary_promoted" });
    trace.end(compile, { outputBytes: 2_048 });
    trace.end(chunk, { decoded: 3 });
    now = 60;
    trace.recordFrame(60, 60, {
      camera: { zoom: 11.4 },
      lod: { current: 1, previous: 0, changing: true },
      render: { pathCount: 12, stationCount: 4, vertexCount: 48 },
      chunks: { added: 3, pending: 1, active: 1 },
      binary: { compileInProgress: 0 },
    });
    trace.end(refresh);
    now = 100;
    const report = trace.stop();

    expect(report.thresholds).toEqual(TRANSPORT_MAP_TRACE_THRESHOLDS);
    expect(report.frameCount).toBe(1);
    expect(report.totalSpikeCount).toBe(1);
    expect(report.spikes[0]?.severity).toBe("spike");
    expect(report.spikes[0]?.snapshot).toEqual(expect.objectContaining({
      timestampMs: 60,
      frameMs: 60,
      severity: "spike",
    }));
    expect(report.spikes[0]?.likelyCauses).toEqual(expect.arrayContaining([
      "LOD_TRANSITION",
      "BINARY_REBUILD",
      "DECK_ATTRIBUTE_UPDATE",
      "CHUNK_BURST",
    ]));
    expect(report.spikes[0]?.directCauses.map((event) => event.type)).not.toContain("deck_data_changed");
    expect(report.spikes[0]?.correlatedEvents.map((event) => event.type)).toContain("deck_data_changed");
    expect(report.byTransition["0->1"]).toEqual({
      slowFrames: 1,
      spikes: 1,
      severeSpikes: 0,
    });
    expect(report.spikes[0]?.activeEventsAtSpike.length).toBeGreaterThan(0);
    expect(report.timelines[0]?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: "START" }),
      expect.objectContaining({ phase: "END" }),
    ]));
    expect(report.events.some((event) => event.parentId === refresh)).toBe(true);
  });

  it("retains the causal window and renders START/END timeline text after ring rollover", () => {
    let now = 0;
    const trace = createTransportMapPerformanceTrace({
      mode: "full",
      now: () => now,
      capacity: 256,
      observeLongTasks: false,
    });

    trace.start();
    const compile = trace.begin("binary_compile", {
      pathCount: 8,
      vertexCount: 64,
      inputBytes: 512,
    });
    now = 60;
    trace.recordFrame(60, 60, { binary: { compileInProgress: 1 } });
    now = 100;
    trace.end(compile, { outputBytes: 256 });
    for (let index = 0; index < 300; index += 1) {
      now += 1;
      trace.instant("camera_update", { index });
    }

    const report = trace.stop();
    const timeline = report.timelines[0];

    expect(report.droppedEventCount).toBe(45);
    expect(report.events.some((event) => event.type === "binary_compile")).toBe(true);
    expect(timeline?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "binary_compile", phase: "START" }),
      expect.objectContaining({ type: "binary_compile", phase: "END" }),
    ]));
    expect(timeline?.text).toContain("FRAME START");
    expect(timeline?.text).toContain("FRAME END");
  });

  it("keeps metadata bounded to scalar diagnostics and rejects typed arrays", () => {
    const trace = createTransportMapPerformanceTrace({ observeLongTasks: false });
    trace.start();
    trace.instant("scene_publish", {
      id: "scene-1",
      ids: ["line-1", "line-2"],
      positions: new Float32Array([1, 2, 3, 4]),
      nested: { ok: true },
    });

    const report = trace.stop();
    expect(report.events[0]?.metadata).toEqual({
      id: "scene-1",
      ids: ["line-1", "line-2"],
      nested: { ok: true },
    });
    expect(report.events[0]?.metadata).not.toHaveProperty("positions");
  });

  it("marks a heap drop with a long task as inferred GC only", () => {
    const performanceWithMemory = performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    };
    const previousDescriptor = Object.getOwnPropertyDescriptor(performance, "memory");
    let usedJSHeapSize = 100 * 1024 * 1024;
    Object.defineProperty(performance, "memory", {
      configurable: true,
      value: {
        get usedJSHeapSize() { return usedJSHeapSize; },
        totalJSHeapSize: 128 * 1024 * 1024,
        jsHeapSizeLimit: 512 * 1024 * 1024,
      },
    });
    try {
      let now = 0;
    const trace = createTransportMapPerformanceTrace({
      mode: "full",
      now: () => now,
        observeLongTasks: false,
      });
      trace.start();
      now = 60;
      usedJSHeapSize = 20 * 1024 * 1024;
      trace.recordMemorySample(60);
      trace.recordLongTask(0, 60);
      trace.recordFrame(60, 60);
      const report = trace.stop();
      const spike = report.spikes[0];

      expect(report.maxUsedJsHeapSize).toBe(100 * 1024 * 1024);
      expect(spike?.suspectedGc).toEqual({
        inferred: true,
        confirmed: false,
        reason: "heap-drop-with-long-task",
      });
      expect(spike?.likelyCauses).toContain("SUSPECTED_GC");
    } finally {
      if (previousDescriptor) Object.defineProperty(performance, "memory", previousDescriptor);
      else delete performanceWithMemory.memory;
    }
  });

  it("keeps event storage bounded and stays dormant until a session starts", () => {
    let now = 0;
    const trace = createTransportMapPerformanceTrace({ mode: "full", now: () => now, capacity: 256 });

    trace.instant("camera_update", { zoom: 10 });
    expect(trace.snapshot().eventCount).toBe(0);

    trace.start();
    for (let index = 0; index < 300; index += 1) {
      now += 1;
      trace.instant("camera_update", { index });
    }
    const report = trace.stop();

    expect(report.eventCount).toBe(256);
    expect(report.droppedEventCount).toBe(44);
    expect(report.events).toHaveLength(256);
  });

  it("records public MapLibre loading, render and idle samples only during a trace", () => {
    let now = 0;
    const listeners = new Map<string, Set<(event?: unknown) => void>>();
    let moving = true;
    let styleLoaded = false;
    let tilesLoaded = false;
    const map: TransportMapMapLibreTraceMap = {
      on(type, listener) {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      off(type, listener) {
        listeners.get(type)?.delete(listener);
      },
      isStyleLoaded: () => styleLoaded,
      areTilesLoaded: () => tilesLoaded,
      isMoving: () => moving,
      getZoom: () => 12.5,
      getCenter: () => ({ lng: 2.35, lat: 48.86 }),
    };
    const emit = (type: string, event?: unknown) => {
      for (const listener of listeners.get(type) ?? []) listener(event);
    };
    const trace = createTransportMapPerformanceTrace({ now: () => now, observeLongTasks: false });
    const probe = new TransportMapMapLibreTraceProbe(map, trace, { sampleIntervalMs: 100 });
    trace.attachProbe(probe);
    probe.start();
    probe.stop();
    expect(listeners.size).toBe(0);

    trace.start({ scenario: "maplibre-synthetic" });
    emit("sourcedataloading", { sourceId: "basemap" });
    emit("render");
    now = 50;
    emit("sourcedata", { sourceId: "basemap", isSourceLoaded: true });
    styleLoaded = true;
    tilesLoaded = true;
    moving = false;
    emit("idle");
    now = 100;
    const report = trace.stop();

    expect(report.maplibre?.sampleCount).toBeGreaterThan(0);
    expect(report.maplibre?.renderCount).toBe(1);
    expect(report.maplibre?.idleCount).toBe(1);
    expect(report.maplibre?.readySampleCount).toBeGreaterThan(0);
    expect(report.maplibre?.readinessFailureSampleCount).toBeGreaterThan(0);
    expect(report.maplibre?.readySampleRatio).toBeGreaterThan(0);
    expect(report.maplibre?.readySampleRatio).toBeLessThan(1);
    expect(report.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "maplibre_source_loading",
      "maplibre_source_loaded",
      "maplibre_render",
      "maplibre_idle",
    ]));
  });

  it("keeps thousands of camera updates as one per-frame sample in spikes mode", () => {
    let now = 0;
    const trace = createTransportMapPerformanceTrace({
      mode: "spikes",
      now: () => now,
      observeLongTasks: false,
    });
    trace.start();
    for (let index = 0; index < 2_000; index += 1) {
      trace.begin("camera_update", {
        previousZoom: 10 + index / 10_000,
        newZoom: 10 + (index + 1) / 10_000,
      });
    }
    now = 60;
    trace.recordFrame(60, 60, { camera: { zoom: 10.2 } });
    const report = trace.stop();

    expect(report.events).toHaveLength(0);
    expect(report.counters.cameraUpdateCount).toBe(2_000);
    expect(report.spikes[0]?.snapshot?.camera).toEqual(expect.objectContaining({
      updateCount: 2_000,
      startZoom: 10,
      endZoom: 10.2,
    }));
  });

  it("aggregates fast repetitive render diagnostics in spikes mode", () => {
    let now = 0;
    const trace = createTransportMapPerformanceTrace({
      mode: "spikes",
      now: () => now,
      observeLongTasks: false,
    });
    trace.start();
    trace.recordDuration("binary_cache_key_build", 0.2);
    trace.recordDuration("render_model_build", 0.3, { reused: true });
    trace.recordDuration("renderer_render_call", 1.2);
    trace.recordDuration("render_model_build", 12, { reused: true });
    trace.recordDuration("renderer_render_call", 12);
    trace.instant("scene_publish", { reason: "structural" });
    now = 20;
    const report = trace.stop();

    expect(report.fastEventAggregates).toEqual({
      binary_cache_key_build: { count: 1, totalMs: 0.2, maxMs: 0.2 },
      "render_model_build.reused": { count: 1, totalMs: 0.3, maxMs: 0.3 },
      "renderer_render_call.quick": { count: 1, totalMs: 1.2, maxMs: 1.2 },
    });
    expect(report.events.map((event) => event.type)).toEqual([
      "render_model_build",
      "renderer_render_call",
      "scene_publish",
    ]);
  });

  it("only classifies a significant scene operation as a direct cause", () => {
    let now = 0;
    const trace = createTransportMapPerformanceTrace({ now: () => now, observeLongTasks: false });
    trace.start();
    trace.instant("deck_update_attributes", { updateAttributesTime: 1 });
    const scene = trace.begin("scene_rebuild", { reason: "geometry" });
    now = 40;
    trace.end(scene);
    now = 100;
    trace.recordFrame(100, 100);
    const report = trace.stop();
    const spike = report.spikes[0]!;

    expect(spike.directCauses.map((event) => event.type)).toContain("scene_rebuild");
    expect(spike.directCauses.map((event) => event.type)).not.toContain("deck_update_attributes");
    expect(spike.correlatedEvents.map((event) => event.type)).toContain("deck_update_attributes");
    expect(spike.likelyCauses).toContain("SCENE_REBUILD");
  });

  it("reports an unmatched long task as main-thread unattributed work", () => {
    let now = 0;
    const trace = createTransportMapPerformanceTrace({ now: () => now, observeLongTasks: false });
    trace.start();
    trace.recordLongTask(0, 200);
    now = 200;
    trace.recordFrame(200, 200);
    const spike = trace.stop().spikes[0]!;

    expect(spike.measuredMainThreadMs).toBe(0);
    expect(spike.unattributedMs).toBe(200);
    expect(spike.unattributedCategory).toBe("MAIN_THREAD_UNATTRIBUTED");
    expect(spike.unattributedClassification).toBe("UNATTRIBUTED_MAIN_THREAD_STALL");
    expect(spike.likelyCauses).toContain("MAIN_THREAD_UNATTRIBUTED");
    expect(spike.likelyCauses).toContain("UNATTRIBUTED_MAIN_THREAD_STALL");
  });

  it("reports only the unmeasured portion when a long task overlaps known main work", () => {
    let now = 0;
    const trace = createTransportMapPerformanceTrace({ now: () => now, observeLongTasks: false });
    trace.start();
    now = 60;
    trace.recordDuration("scene_publish", 60);
    trace.recordLongTask(0, 500);
    now = 500;
    trace.recordFrame(500, 500);
    const spike = trace.stop().spikes[0]!;

    expect(spike.measuredMainThreadMs).toBe(60);
    expect(spike.unattributedMs).toBe(440);
    expect(spike.unattributedCategory).toBe("MAIN_THREAD_UNATTRIBUTED");
  });

  it("does not count async orchestration or worker compile wall time as main-thread CPU", () => {
    let now = 0;
    const trace = createTransportMapPerformanceTrace({ now: () => now, observeLongTasks: false });
    trace.start();
    const refresh = trace.begin("viewport_refresh", { generation: 1 });
    const transition = trace.begin("regional_to_detailed", { generation: 1 });
    const compile = trace.begin("binary_compile", { execution: "worker" });
    now = 200;
    trace.end(refresh);
    trace.end(transition);
    trace.end(compile);
    trace.recordFrame(200, 200);
    const spike = trace.stop().spikes[0]!;

    expect(spike.measuredMainThreadMs).toBe(0);
    expect(spike.unattributedMs).toBe(200);
    expect(spike.directCauses).toHaveLength(0);
    expect(spike.correlatedEvents.map((event) => event.type)).toEqual(expect.arrayContaining([
      "viewport_refresh",
      "regional_to_detailed",
      "binary_compile",
    ]));
  });

  it("reports RAF starvation when no long task or long main operation overlaps", () => {
    let now = 0;
    const trace = createTransportMapPerformanceTrace({ now: () => now, observeLongTasks: false });
    trace.start();
    now = 100;
    trace.recordFrame(100, 100);
    const spike = trace.stop().spikes[0]!;

    expect(spike.unattributedCategory).toBe("RAF_STARVATION_UNATTRIBUTED");
    expect(spike.likelyCauses).toContain("RAF_STARVATION_UNATTRIBUTED");
  });
});
