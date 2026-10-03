import { describe, expect, it } from "vitest";
import { TimingDistribution } from "../src/features/transport-map/performance/timingDistribution";
import { ChaosZoomDiagnostics } from "../src/features/line-map/chaosZoomDiagnostics";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { TransportMapRendererMetrics } from "../src/features/transport-map/contracts/renderer";

describe("Chaos whole-run diagnostics", () => {
  it("keeps whole-run counts and bounded percentile ranges beyond the event capacity", () => {
    const distribution = new TimingDistribution();
    for (let index = 0; index < 15_000; index += 1) distribution.add(2.5);
    distribution.add(120);
    distribution.add(NaN);
    const report = distribution.snapshot();
    expect(report.count).toBe(15_001);
    expect(report.totalMs).toBe(37_620);
    expect(report.p95RangeMs).toEqual([2, 3]);
    expect(report.over100Ms).toBe(1);
    expect(report.maxMs).toBe(120);
  });

  it("separates phases/actions/zooms and reads each Deck window once", () => {
    let now = 100;
    const diagnostics = new ChaosZoomDiagnostics(100, () => now);
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12.5, viewportWidthCssPx: 800, viewportHeightCssPx: 600 });
    const metrics = {
      visiblePathCount: 15_000, visibleStationCount: 30_000, visibleVertexCount: 500_000,
      deck: { sampledAtMs: 120, cpuTimePerFrame: 4, gpuTimePerFrame: 9, windowFrames: 60, updateAttributesTime: 30,
        updateAttributesCount: 2, layersCount: 12, gpuMemory: 100, textureMemory: 80 },
    } as TransportMapRendererMetrics;
    for (let index = 0; index < 30; index += 1) diagnostics.recordFrame(60, 200 + index * 60, {
      camera, metrics, phase: "zoom", actionIndex: 3, scrolling: true,
    });
    diagnostics.recordFrame(8, 2_100, { camera: { ...camera, zoom: 9 }, phase: "recovery", actionIndex: 4, scrolling: false });
    diagnostics.recordRender(4);
    now = 2_100;
    diagnostics.finish();
    diagnostics.recordRender(1_000);
    const report = diagnostics.stop({ metric: "price" }, { metric: "price" });
    expect(report.byPhase.zoom?.count).toBe(30);
    expect(report.byAction["3:zoom"]?.maxVertices).toBe(500_000);
    expect(report.byZoom["9"]?.count).toBe(1);
    expect(report.worstFrames).toHaveLength(20);
    expect(report.deck.sampleCount).toBe(1);
    expect(report.renderer.count).toBe(1);
    expect(report.renderer.maxMs).toBe(4);
  });

  it("flags a one-second throttled RAF cadence even if visibility stays visible", () => {
    const diagnostics = new ChaosZoomDiagnostics(0, () => 20_000);
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12, viewportWidthCssPx: 800, viewportHeightCssPx: 600 });
    for (let index = 1; index <= 20; index += 1) diagnostics.recordFrame(1_005, index * 1_005, {
      camera, phase: "zoom", actionIndex: 1, scrolling: true,
    });
    expect(diagnostics.stop({}, {}).measurement).toMatchObject({ possibleRafThrottling: true, foregroundComparable: false });
  });
});
