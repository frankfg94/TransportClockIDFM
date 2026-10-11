import { ChaosZoomDiagnostics } from "../../line-map/chaosZoomDiagnostics";
import { summarizeChaosFrameTimes } from "../../line-map/chaosZoom";
import { createTransportMapPerformanceTrace } from "./transportMapPerformanceTrace";
import type { CameraState } from "../geo/camera";
import type { TransportMapRendererMetrics } from "../contracts/renderer";

export interface ColdRefreshGlCall {
  operation: string; startMs: number; durationMs: number; parameter?: number;
  shaders?: Array<{ name: string; hash: string; length: number }>;
  origin: "deck" | "maplibre" | "unknown"; stack: string;
}
interface FrameSample { startMs: number; endMs: number; durationMs: number; phase: string; endPhase: string }
const round = (n: number) => Number(n.toFixed(3));

/** Opt-in document-load probe. No RAF, observers or GL wrappers outside a run. */
export class ColdRefreshRecorder {
  readonly trace = createTransportMapPerformanceTrace({ mode: "full", capacity: 6000 });
  private readonly started = performance.now();
  private readonly startedAt = new Date().toISOString();
  private readonly diagnostics = new ChaosZoomDiagnostics(this.started, () => performance.now());
  private readonly stages: Array<{ stage: string; timestampMs: number }> = [];
  private readonly frames: FrameSample[] = [];
  private readonly glCalls: ColdRefreshGlCall[] = [];
  private readonly shaderPrograms: Array<{ linkedAtMs: number; shaders: NonNullable<ColdRefreshGlCall["shaders"]> }> = [];
  private readonly gpuCompletion: Array<{ stage: string; submittedMs: number; completedMs?: number; latencyMs?: number; status: string }> = [];
  private gl?: WebGL2RenderingContext;
  private graphicsContext?: object;
  private transportDrawSubmitted = false;
  get hasTransportDraw(): boolean { return this.transportDrawSubmitted; }
  private readonly tasks: Array<{ startMs: number; durationMs: number }> = [];
  private readonly heartbeats: Array<{ timestampMs: number; delayMs: number }> = [];
  private readonly animationFrames: object[] = [];
  private readonly observers: PerformanceObserver[] = [];
  private readonly cleanup: Array<() => void> = [];
  private readonly errors: Array<{ timestampMs: number; message: string }> = [];
  private readonly supported = PerformanceObserver.supportedEntryTypes;
  private frameId = 0;
  private timer: ReturnType<typeof setTimeout>;
  private stopped = false;
  private previousFrame = this.started;
  private phase = "page-bootstrap";
  private getContext?: () => { camera: CameraState; metrics: TransportMapRendererMetrics };

  constructor(private readonly complete: (report: unknown) => void, readonly prepareDeckShaders = false, private readonly isolateShaderCache = false) {
    this.trace.start({ source: "cold-refresh" });
    this.mark("diagnostics-started");
    this.observe("longtask", (entry) => {
      if (this.tasks.length < 500) this.tasks.push({ startMs: round(entry.startTime), durationMs: round(entry.duration) });
    });
    this.observe("long-animation-frame", (raw) => {
      if (this.animationFrames.length >= 200) return;
      const entry = raw as PerformanceEntry & {
        blockingDuration: number; renderStart: number; styleAndLayoutStart: number;
        scripts: Array<{ duration: number; executionStart: number; forcedStyleAndLayoutDuration: number; sourceURL: string; sourceFunctionName: string; sourceCharPosition: number; invoker: string }>;
      };
      this.animationFrames.push({ startMs: round(entry.startTime), durationMs: round(entry.duration), blockingDurationMs: round(entry.blockingDuration), renderStartMs: entry.renderStart, styleAndLayoutStartMs: entry.styleAndLayoutStart,
        scripts: entry.scripts.map((s) => ({ startMs: s.executionStart, durationMs: round(s.duration), forcedStyleAndLayoutMs: round(s.forcedStyleAndLayoutDuration), source: s.sourceURL, function: s.sourceFunctionName, character: s.sourceCharPosition, invoker: s.invoker })) });
    });
    const onError = (e: ErrorEvent) => this.errors.push({ timestampMs: round(performance.now()), message: e.message });
    window.addEventListener("error", onError);
    this.cleanup.push(() => window.removeEventListener("error", onError));
    const tick = (now: number) => {
      if (this.stopped) return;
      const duration = now - this.previousFrame;
      const phase = this.stages.findLast((stage) => stage.timestampMs <= this.previousFrame)?.stage ?? "page-bootstrap";
      if (this.frames.length < 6000) this.frames.push({ startMs: round(this.previousFrame), endMs: round(now), durationMs: round(duration), phase, endPhase: this.phase });
      const context = this.getContext?.();
      if (context) this.diagnostics.recordFrame(duration, now, { ...context, phase, actionIndex: 0, scrolling: false });
      this.previousFrame = now;
      this.frameId = requestAnimationFrame(tick);
    };
    this.frameId = requestAnimationFrame(tick);
    let heartbeatExpected = performance.now() + 16;
    const heartbeat = setInterval(() => {
      const now = performance.now();
      if (this.heartbeats.length < 2000) this.heartbeats.push({ timestampMs: round(now), delayMs: round(Math.max(0, now - heartbeatExpected)) });
      heartbeatExpected = now + 16;
    }, 16);
    this.cleanup.push(() => clearInterval(heartbeat));
    this.timer = setTimeout(() => this.finish(), 15_000);
  }

  bindContext(getContext: NonNullable<ColdRefreshRecorder["getContext"]>): void { this.getContext = getContext; }
  mark(stage: string): void {
    if (this.stopped || this.stages.some((s) => s.stage === stage)) return;
    this.phase = stage;
    this.stages.push({ stage, timestampMs: round(performance.now()) });
    if (stage === "transport-first-render") this.measureGpuCompletion(stage);
  }
  private measureGpuCompletion(stage: string): void {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) return;
    const sample: ColdRefreshRecorder["gpuCompletion"][number] = { stage, submittedMs: round(performance.now()), status: "pending" };
    this.gpuCompletion.push(sample);
    gl.flush();
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      if (this.stopped || gl.isContextLost()) return;
      const status = gl.clientWaitSync(sync, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) { timer = setTimeout(poll, 8); return; }
      sample.completedMs = round(performance.now());
      sample.latencyMs = round(sample.completedMs - sample.submittedMs);
      sample.status = status === gl.WAIT_FAILED ? "failed" : "completed";
      gl.deleteSync(sync);
    };
    timer = setTimeout(poll, 8);
    this.cleanup.push(() => { clearTimeout(timer); if (sample.status === "pending") gl.deleteSync(sync); });
  }
  instrumentGl(gl: WebGL2RenderingContext): void {
    if (this.stopped) return;
    this.gl = gl;
    const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    this.graphicsContext = { attributes: gl.getContextAttributes(),
      renderer: rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) };
    const shaders = new WeakMap<WebGLShader, { name: string; hash: string; length: number }>();
    const programs = new WeakMap<WebGLProgram, WebGLShader[]>();
    let activeProgram: WebGLProgram | null = null;
    const methods = ["shaderSource", "attachShader", "compileShader", "linkProgram", "getProgramParameter", "getShaderParameter", "getActiveUniform", "getActiveAttrib", "getUniformLocation", "getAttribLocation", "useProgram", "bufferData", "bufferSubData", "texImage2D", "drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "flush", "finish", "readPixels", "getError", "getParameter", "checkFramebufferStatus", "clientWaitSync", "getUniformIndices", "getActiveUniforms", "getActiveUniformBlockParameter", "validateProgram"] as const;
    for (const operation of methods) {
      const original = gl[operation] as (...args: unknown[]) => unknown;
      const wrapper = (...args: unknown[]) => {
        if (operation === "shaderSource") {
          const source = String(args[1]);
          let hash = 2166136261;
          for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
          shaders.set(args[0] as WebGLShader, { name: source.match(/#define SHADER_NAME (\S+)/)?.[1] ?? "maplibre-or-unnamed", hash: (hash >>> 0).toString(16), length: source.length });
          // Controlled diagnostic only: change an internal GLSL variable name,
          // preserving attributes, bindings, shader semantics and geometry.
          // A unique translated source avoids attributing a warm source-cache
          // result to an optimization; lower driver caches remain uncontrolled.
          if (this.isolateShaderCache && /#define SHADER_NAME (path|scatterplot)-layer/.test(source)) {
            args[1] = source.replace(/\bgeometry\b/g, `cold_geometry_${Math.trunc(performance.timeOrigin)}`);
          }
        }
        if (operation === "attachShader") {
          const program = args[0] as WebGLProgram;
          programs.set(program, [...(programs.get(program) ?? []), args[1] as WebGLShader]);
        }
        if (operation === "useProgram") activeProgram = args[0] as WebGLProgram | null;
        const start = performance.now();
        try { return original.apply(gl, args); } finally {
          const duration = performance.now() - start;
          const program = operation.includes("Program") ? args[0] as WebGLProgram : activeProgram;
          const needsProgram = duration >= 2 || operation === "linkProgram" || (!this.transportDrawSubmitted && operation.startsWith("draw"));
          const shader = operation === "compileShader" || operation === "getShaderParameter" || operation === "shaderSource" ? shaders.get(args[0] as WebGLShader) : undefined;
          const programShaders = needsProgram ? shader ? [shader] : program ? programs.get(program)?.map((shader) => shaders.get(shader)).filter((s) => s !== undefined) : undefined : undefined;
          if (operation === "linkProgram" && this.shaderPrograms.length < 500) this.shaderPrograms.push({ linkedAtMs: round(start), shaders: programShaders ?? [] });
          if (!this.transportDrawSubmitted && operation.startsWith("draw") && programShaders?.some((s) => /^(path|scatterplot)-layer/.test(s.name))) {
            this.transportDrawSubmitted = true;
            this.mark("transport-draw-submitted");
          }
          if (duration >= 2 && this.glCalls.length < 500) {
            const stack = new Error().stack ?? "";
            this.glCalls.push({ operation, startMs: round(start), durationMs: round(duration), parameter: operation === "getParameter" ? Number(args[0]) : operation === "getActiveUniformBlockParameter" ? Number(args[2]) : operation.endsWith("Parameter") ? Number(args[1]) : undefined,
              shaders: programShaders,
              origin: stack.includes("WEBGL") || stack.includes("Layer.") ? "deck" : stack.includes("maplibre") ? "maplibre" : "unknown", stack });
          }
        }
      };
      Object.defineProperty(gl, operation, { configurable: true, writable: true, value: wrapper });
      this.cleanup.push(() => { if (gl[operation] === wrapper) Object.defineProperty(gl, operation, { configurable: true, writable: true, value: original }); });
    }
    const extension = gl.getExtension("KHR_parallel_shader_compile");
    this.mark(extension ? "parallel-shader-extension-available" : "parallel-shader-extension-unavailable");
  }
  private observe(type: string, consume: (entry: PerformanceEntry) => void): void {
    if (!this.supported.includes(type)) return;
    const observer = new PerformanceObserver((list) => list.getEntries().forEach(consume));
    observer.observe({ type, buffered: true });
    this.observers.push(observer);
    this.cleanup.push(() => { observer.takeRecords().forEach(consume); observer.disconnect(); });
  }
  finish(): void {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.frameId);
    this.cleanup.forEach((fn) => fn());
    const trace = this.trace.stop();
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const context = this.getContext?.();
    const diagnostics = this.diagnostics.stop({ scenario: "cold-refresh" }, { camera: context?.camera, metrics: context?.metrics }, trace);
    const originForInterval = (start: number, end: number) => {
      const gl = this.glCalls.filter((call) => call.startMs < end && call.startMs + call.durationMs > start);
      const operations = trace.events.filter((event) => event.startMs < end && (event.endMs ?? event.startMs) >= start);
      const mainThread = operations.filter((event) => trace.eventAggregates?.[event.type]?.timingKind === "main-thread-span" && (event.durationMs ?? 0) > 0)
        .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));
      const asyncInFlight = operations.filter((event) => trace.eventAggregates?.[event.type]?.timingKind === "async-wall-time");
      return { webgl: gl, traceEvents: mainThread.slice(0, 40), overlappingTraceEventCount: operations.length, asyncInFlight: asyncInFlight.slice(0, 40), longTasks: this.tasks.filter((task) => task.startMs < end && task.startMs + task.durationMs > start) };
    };
    // Keep unmatched stalls explicit: wall time and GPU/driver waits are not CPU attribution.
    const sortedFrames = this.frames.map((f) => f.durationMs).filter((n) => n > 0).sort((a, b) => a - b);
    const frameBudgetMs = sortedFrames[Math.floor(sortedFrames.length / 2)] ?? 16.667;
    const microLagThresholdMs = Math.max(8, frameBudgetMs * 1.5);
    const stutters = this.frames.filter((f) => f.durationMs > microLagThresholdMs).map((frame) => {
      const origins = originForInterval(frame.startMs, frame.endMs);
      const heartbeats = this.heartbeats.filter((h) => h.timestampMs >= frame.startMs && h.timestampMs <= frame.endMs + 16);
      const animationFrames = this.animationFrames.filter((raw) => { const a = raw as { startMs: number; durationMs: number }; return a.startMs < frame.endMs && a.startMs + a.durationMs > frame.startMs; });
      const timersResponsive = frame.durationMs > 32 && heartbeats.filter((h) => h.timestampMs >= frame.startMs && h.timestampMs <= frame.endMs && h.delayMs < 8).length >= frame.durationMs / 32;
      const gpuQueueDelay = this.gpuCompletion.filter((g) => g.submittedMs < frame.endMs && (g.completedMs ?? Infinity) > frame.startMs && (g.latencyMs ?? 0) > 50);
      const mainThreadRanges = [...origins.longTasks, ...origins.traceEvents, ...origins.webgl]
        .map((entry) => [Math.max(frame.startMs, entry.startMs), Math.min(frame.endMs, entry.startMs + (entry.durationMs ?? 0))] as const).sort((a, b) => a[0] - b[0]);
      let busyUntil = frame.startMs;
      let mainThreadMeasuredMs = 0;
      for (const [start, end] of mainThreadRanges) { mainThreadMeasuredMs += Math.max(0, end - Math.max(start, busyUntil)); busyUntil = Math.max(busyUntil, end); }
      return { ...frame, ...origins, heartbeats, animationFrames, timersResponsive, gpuQueueDelay,
        mainThreadMeasuredMs: round(mainThreadMeasuredMs),
        stagesCrossed: this.stages.filter((s) => s.timestampMs > frame.startMs && s.timestampMs <= frame.endMs),
        attribution: timersResponsive && gpuQueueDelay.length && mainThreadMeasuredMs < frame.durationMs / 2 ? "gpu-queue-delay-correlated-main-thread-responsive" : origins.webgl.length ? "measured-webgl-call" : origins.longTasks.length ? "main-thread-see-script-and-trace-details" : timersResponsive ? "animation-frame-scheduling-gap-main-thread-responsive" : origins.traceEvents.length ? "instrumented-main-thread-spans-overlap" : "unattributed-or-frame-clock-throttling" };
    });
    const firstDrawMs = this.stages.find((stage) => stage.stage === "transport-draw-submitted")?.timestampMs;
    const afterDraw = firstDrawMs === undefined ? [] : this.frames.filter((frame) => frame.endMs > firstDrawMs);
    const afterDrawStutters = firstDrawMs === undefined ? [] : stutters.filter((frame) => frame.endMs - Math.max(firstDrawMs, frame.startMs) > microLagThresholdMs);
    const report = {
      schemaVersion: 3, scenario: "cold-refresh", profile: { id: "cold-refresh", version: 3, captureMs: 15_000, interactionCount: 0, asyncDeckShaderPreparation: this.prepareDeckShaders, isolateShaderCache: this.isolateShaderCache },
      assessment: { accepted: this.stages.some((s) => s.stage === "transport-first-render") && navigation?.type === "reload" && diagnostics.measurement.foregroundComparable && stutters.length === 0 && this.errors.length === 0 && diagnostics.errors.deck === 0 && diagnostics.errors.maplibre === 0 && trace.droppedEventCount === 0, remainingMicroLags: stutters.length },
      status: this.stages.some((s) => s.stage === "transport-first-render") ? "completed" : "failed",
      startedAt: this.startedAt, endedAt: new Date().toISOString(), durationMs: round(performance.now()),
      navigation: { type: navigation?.type, fullDocumentReload: navigation?.type === "reload", timeOrigin: performance.timeOrigin, diagnosticStartMs: round(this.started), domContentLoadedMs: navigation?.domContentLoadedEventEnd, loadMs: navigation?.loadEventEnd },
      graphicsContext: this.graphicsContext,
      cache: { applicationState: "new-document", webglContext: "new-context", httpCache: "browser-managed-not-cleared", driverShaderCache: "browser-managed-not-cleared" },
      capture: { frameSampleCount: this.frames.length, frameSampleCapacity: 6000, truncatedFrames: this.frames.length >= 6000, gpuFenceContext: "shared-maplibre-deck", gpuFencePollingMs: 8 },
      stages: this.stages, frameMetrics: { ...summarizeChaosFrameTimes(this.frames.map((f) => f.durationMs), performance.now() - this.started, 1000 / frameBudgetMs), estimatedRefreshHz: round(1000 / frameBudgetMs), microLagThresholdMs: round(microLagThresholdMs), microLagCount: stutters.length, frameTimesMs: this.frames.map((f) => f.durationMs) },
      afterTransportDraw: { startMs: firstDrawMs, completeFrameCount: afterDraw.filter((f) => f.startMs >= firstDrawMs!).length,
        maxFrameTimeMs: Math.max(0, ...afterDraw.map((f) => round(f.endMs - Math.max(firstDrawMs!, f.startMs)))), microLagCount: afterDrawStutters.length,
        firstDrawInterval: firstDrawMs === undefined ? undefined : this.frames.find((f) => f.startMs < firstDrawMs && f.endMs >= firstDrawMs),
        stutters: afterDrawStutters },
      diagnostics, trace, origins: { webgl: this.glCalls, shaderPrograms: this.shaderPrograms, gpuCompletion: this.gpuCompletion, longTasks: this.tasks, longAnimationFrames: this.animationFrames, heartbeats: this.heartbeats, stutters },
      resources: performance.getEntriesByType("resource").map((raw) => { const r = raw as PerformanceResourceTiming; return { name: r.name, type: r.initiatorType, startMs: round(r.startTime), durationMs: round(r.duration), transferBytes: r.transferSize, decodedBytes: r.decodedBodySize }; }).slice(0, 1000),
      errors: this.errors,
      limits: ["RAF intervals are not proof of GPU presentation.", "Buffered LongTasks/LoAF include document startup before the recorder; RAF starts at diagnosticStartMs.", "HTTP and driver shader caches cannot be cleared by this button.", "Optional isolateShaderCache renames a local Deck GLSL variable per document; original source hashes are reported. This is a controlled variant, not a purge of all driver caches.", "afterTransportDraw includes the measured portion of the first interval crossing the actual draw; the complete original interval is retained separately.", "Instrumented WebGL calls >=2ms retained, at most 500; capture overhead is included.", "GPU fence latency covers the shared command queue, includes poll/scheduling delay, and cannot isolate driver compilation from draw work.", "Trace spans overlap; async wall-time is not main-thread CPU.", "Unknown stalls remain unattributed, not declared fixed."],
    };
    this.trace.dispose();
    this.complete(report);
  }
}
