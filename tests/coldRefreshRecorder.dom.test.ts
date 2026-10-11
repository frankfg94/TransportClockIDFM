import { afterEach, describe, expect, it, vi } from "vitest";
import { ColdRefreshRecorder } from "../src/features/transport-map/performance/coldRefreshRecorder";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { TransportMapRendererMetrics } from "../src/features/transport-map/contracts/renderer";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("cold document refresh diagnostics", () => {
  it("waits for an actual transport draw and includes the partial interval that contains it", () => {
    vi.useFakeTimers();
    let now = 1000;
    let tick: FrameRequestCallback = () => undefined;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("PerformanceObserver", class { static supportedEntryTypes: string[] = []; });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { tick = callback; return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const complete = vi.fn();
    const originalSource = vi.fn();
    const gl = new Proxy({ getExtension: () => null, getContextAttributes: () => ({ antialias: true }),
      getParameter: () => "test", shaderSource: originalSource, isContextLost: () => false, fenceSync: () => null,
    } as Record<string, unknown>, { get(target, name: string) { return target[name] ?? (target[name] = vi.fn()); } }) as unknown as WebGL2RenderingContext;
    const recorder = new ColdRefreshRecorder(complete, true, true);
    recorder.instrumentGl(gl);
    for (let i = 0; i < 5; i++) { now += 6; tick(now); }
    const shader = {} as WebGLShader;
    const program = {} as WebGLProgram;
    const source = "#version 300 es\n#define SHADER_NAME path-layer-vertex-shader\nvoid main() { geometry.position = vec4(0.0); }";
    gl.shaderSource(shader, source);
    expect(originalSource.mock.calls[0]![1]).toContain("cold_geometry_");
    gl.attachShader(program, shader);
    gl.useProgram(program);
    expect(recorder.hasTransportDraw).toBe(false);
    now += 2;
    gl.drawArraysInstanced(0, 0, 3, 1);
    expect(recorder.hasTransportDraw).toBe(true);
    recorder.mark("transport-first-render");
    now += 78;
    tick(now);
    recorder.finish();
    const report = complete.mock.calls[0]![0];
    expect(report.afterTransportDraw.maxFrameTimeMs).toBe(78);
    expect(report.afterTransportDraw.microLagCount).toBe(1);
    expect(report.afterTransportDraw.firstDrawInterval.durationMs).toBe(80);
    expect(gl.shaderSource).toBe(originalSource);
  });

  it("reports frame durations independently of document timestamps and keeps unknown stalls explicit", () => {
    vi.useFakeTimers();
    let now = 5000;
    let tick: FrameRequestCallback = () => undefined;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("PerformanceObserver", class { static supportedEntryTypes: string[] = []; });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { tick = callback; return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const complete = vi.fn();
    const recorder = new ColdRefreshRecorder(complete);
    recorder.bindContext(() => ({
      camera: createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 8, viewportWidthCssPx: 800, viewportHeightCssPx: 600 }),
      metrics: { renderer: "webgl2", visiblePathCount: 1 } as TransportMapRendererMetrics,
    }));
    recorder.mark("transport-first-render");
    for (const duration of [6, 6, 6, 6, 6, 80, 6]) { now += duration; tick(now); }
    recorder.finish();
    recorder.finish();
    expect(complete).toHaveBeenCalledTimes(1);
    const report = complete.mock.calls[0]![0];
    expect(report.frameMetrics.maxFrameTimeMs).toBe(80);
    expect(report.diagnostics.byPhase["transport-first-render"].maxMs).toBe(80);
    expect(report.diagnostics.worstFrames[0].durationMs).toBe(80);
    expect(report.origins.stutters[0]).toMatchObject({ durationMs: 80, attribution: "unattributed-or-frame-clock-throttling" });
    expect(report.navigation.fullDocumentReload).toBe(false);
  });
});
