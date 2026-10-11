import { LayerManager, type Layer, type LayerContext } from "@deck.gl/core";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { ShaderFactory, SharedRenderPipeline, type RenderPipelineProps, type SharedRenderPipelineProps } from "@luma.gl/core";
import { WebGLDevice, getShaderLayoutFromGLSL, type WEBGLShader } from "@luma.gl/webgl";
import { getColdRefreshRecorder } from "../performance/coldRefreshState";
import { FlatMapPathLayer, FlatMapScatterplotLayer } from "./flatMapLayers";

const keyFor = (vs: string, fs: string) => `${vs}\u0000${fs}`;
const shaderSource = (source: string) => source.startsWith("#version ") ? source : `#version 300 es\n${source}`;

/** Never query LINK_STATUS/layout until the driver's completion flag is true. */
export async function linkDeckProgram(
  gl: WebGL2RenderingContext, extension: KHR_parallel_shader_compile,
  vsSource: string, fsSource: string, cancelled: () => boolean,
  existingShaders?: { vs: WebGLShader; fs: WebGLShader },
): Promise<WebGLProgram | undefined> {
  const program = gl.createProgram();
  const vs = existingShaders?.vs ?? gl.createShader(gl.VERTEX_SHADER);
  const fs = existingShaders?.fs ?? gl.createShader(gl.FRAGMENT_SHADER);
  let retained = false;
  try {
    if (!program || !vs || !fs) throw new Error("Cannot prepare Deck shader program");
    if (!existingShaders) {
      gl.shaderSource(vs, vsSource);
      gl.shaderSource(fs, fsSource);
      gl.compileShader(vs);
      gl.compileShader(fs);
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    const deadline = performance.now() + 15_000;
    while (!gl.getProgramParameter(program, extension.COMPLETION_STATUS_KHR)) {
      if (cancelled() || gl.isContextLost()) return;
      if (performance.now() >= deadline) throw new Error("Deck shader preparation timed out");
      await new Promise<void>((resolve) => setTimeout(resolve, 8));
    }
    if (cancelled() || gl.isContextLost()) return;
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Deck shader link failed");
    retained = true;
    return program;
  } finally {
    if (!existingShaders && vs) gl.deleteShader(vs);
    if (!existingShaders && fs) gl.deleteShader(fs);
    if (program && !retained) gl.deleteProgram(program);
  }
}

/** A completed program, using luma's own layout reader after nonblocking polling. */
class PreparedWebGLPipeline extends SharedRenderPipeline {
  readonly device: WebGLDevice;
  readonly handle: WebGLProgram;
  readonly vs: WEBGLShader;
  readonly fs: WEBGLShader;
  readonly linkStatus = "success";
  readonly introspectedLayout;

  constructor(device: WebGLDevice, props: RenderPipelineProps, program: WebGLProgram) {
    super(device, { ...props, vs: props.vs!, fs: props.fs! } as SharedRenderPipelineProps);
    this.device = device;
    this.handle = program;
    this.vs = props.vs as WEBGLShader;
    this.fs = props.fs as WEBGLShader;
    this.introspectedLayout = getShaderLayoutFromGLSL(device.gl, program);
    // Preserve luma's sampler setup/validation contract for extension variants.
    const gl = device.gl;
    gl.useProgram(program);
    const textures = new Set(this.introspectedLayout.bindings.filter((binding) => binding.type === "texture").map((binding) => binding.name));
    let unit = 0;
    for (const uniform of this.introspectedLayout.uniforms ?? []) {
      if (!textures.has(uniform.name)) continue;
      const location = gl.getUniformLocation(program, uniform.name);
      if (location === null) continue;
      if (uniform.isArray && uniform.size > 1) {
        gl.uniform1iv(location, Int32Array.from({ length: uniform.size }, (_, index) => unit + index));
        unit += uniform.size;
      } else gl.uniform1i(location, unit++);
    }
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Prepared Deck program validation failed");
  }
  override destroy(): void {
    if (this.destroyed) return;
    this.device.gl.deleteProgram(this.handle);
    this.destroyResource();
  }
}

/**
 * Prepare the exact Path/Scatterplot shader variants before Deck initializes them.
 * The standard synchronous luma constructor introspects immediately after linking,
 * even with KHR polling enabled. Its device hook consumes our completed program
 * instead, so neither LINK_STATUS nor ACTIVE_ATTRIBUTES waits on an unfinished job.
 * The existing PipelineFactory still owns all cache keys and reference counting.
 */
export class DeckShaderPreparation {
  private readonly context: LayerContext;
  private readonly manager: LayerManager;
  private readonly ready = new Map<string, WebGLProgram>();
  private readonly consumed = new Set<string>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly variantKeys = new Map<string, string>();
  private readonly extensionIds = new WeakMap<object, number>();
  private nextExtensionId = 0;
  private readonly retainedShaders: WEBGLShader[] = [];
  private readonly original: WebGLDevice["_createSharedRenderPipelineWebGL"];
  private disposed = false;
  private readonly extension: KHR_parallel_shader_compile;

  static create(device: unknown): DeckShaderPreparation | undefined {
    if (!(device instanceof WebGLDevice)) return undefined;
    const extension = device.gl.getExtension("KHR_parallel_shader_compile");
    return extension ? new DeckShaderPreparation(device, extension) : undefined;
  }
  private constructor(private readonly device: WebGLDevice, extension: KHR_parallel_shader_compile) {
    this.extension = extension;
    this.manager = new LayerManager(device, {});
    this.context = this.manager.context;
    this.original = device._createSharedRenderPipelineWebGL;
    device._createSharedRenderPipelineWebGL = (props) => {
      const key = keyFor(props.vs?.source ?? "", props.fs?.source ?? "");
      const program = this.ready.get(key);
      if (!program || this.disposed || props.varyings?.length) return this.original.call(device, props);
      this.ready.delete(key);
      this.consumed.add(key);
      getColdRefreshRecorder()?.mark("prepared-deck-program-consumed");
      try { return new PreparedWebGLPipeline(device, props, program); }
      catch (error) {
        device.gl.deleteProgram(program);
        this.consumed.delete(key);
        console.error("Prepared Deck pipeline failed; using standard pipeline", error);
        return this.original.call(device, props);
      }
    };
  }

  /** Undefined means all applicable variants are already linked: no async delay. */
  prepare(layers: readonly Layer[]): Promise<void> | undefined {
    if (this.disposed) return;
    const work: Promise<void>[] = [];
    for (const layer of layers) {
      if (!(layer instanceof PathLayer || layer instanceof ScatterplotLayer)) continue;
      // These classes vary their GLSL only by the fixed props below and their
      // extension instances. Avoid assembling 20 KB of GLSL again on every
      // camera/selection publication once that exact variant is known.
      const constructor: unknown = layer.constructor;
      const cacheable = constructor === FlatMapPathLayer || constructor === FlatMapScatterplotLayer;
      const props = layer.props as unknown as Record<string, unknown>;
      const variant = cacheable ? JSON.stringify([
        layer instanceof PathLayer ? "path" : "scatterplot", props.coordinateSystem, props.billboard, Boolean(props.modelMatrix),
        props.widthUnits, props.radiusUnits, props.lineWidthUnits,
        layer.props.extensions.map((extension: object) => {
          let id = this.extensionIds.get(extension);
          if (id === undefined) { id = ++this.nextExtensionId; this.extensionIds.set(extension, id); }
          return id;
        }),
      ]) : undefined;
      const knownKey = variant ? this.variantKeys.get(variant) : undefined;
      if (knownKey && (this.ready.has(knownKey) || this.consumed.has(knownKey))) continue;
      const knownJob = knownKey ? this.pending.get(knownKey) : undefined;
      if (knownJob) { work.push(knownJob); continue; }
      const oldContext = layer.context;
      const oldState = layer.state;
      let shaders;
      try {
        layer.context = this.context;
        // PathStyleExtension selects its GLSL using the normal PathLayer state tag.
        if (!oldState) layer.state = layer instanceof PathLayer ? { pathTesselator: undefined } as never : {};
        const source = layer.getShaders();
        shaders = this.context.shaderAssembler.assembleGLSLShaderPair({
          ...source,
          id: layer.id,
          platformInfo: { type: this.device.type, shaderLanguage: this.device.info.shadingLanguage,
            shaderLanguageVersion: this.device.info.shadingLanguageVersion as 300,
            gpu: this.device.info.gpu, features: this.device.features as never },
        });
      } finally {
        layer.context = oldContext;
        layer.state = oldState;
      }
      const vs = shaderSource(shaders.vs);
      const fs = shaderSource(shaders.fs);
      const key = keyFor(vs, fs);
      if (variant) this.variantKeys.set(variant, key);
      if (this.ready.has(key) || this.consumed.has(key)) continue;
      let job = this.pending.get(key);
      if (!job) {
        job = this.link(key, vs, fs).finally(() => this.pending.delete(key));
        this.pending.set(key, job);
      }
      work.push(job);
    }
    return work.length ? Promise.all(work).then(() => undefined) : undefined;
  }

  private async link(key: string, vsSource: string, fsSource: string): Promise<void> {
    getColdRefreshRecorder()?.mark("deck-shader-preparation-started");
    // Use Deck's own shader cache, so promotion does not compile a second copy
    // of both shaders or attach orphaned shaders to the prepared program.
    const factory = ShaderFactory.getDefaultShaderFactory(this.device);
    const vs = factory.createShader({ stage: "vertex", source: vsSource }) as WEBGLShader;
    const fs = factory.createShader({ stage: "fragment", source: fsSource }) as WEBGLShader;
    this.retainedShaders.push(vs, fs);
    const program = await linkDeckProgram(this.device.gl, this.extension, vsSource, fsSource, () => this.disposed, { vs: vs.handle, fs: fs.handle });
    if (program) {
      this.ready.set(key, program);
      getColdRefreshRecorder()?.mark("deck-shader-preparation-completed");
    }
  }

  dispose(): void {
    this.disposed = true;
    this.device._createSharedRenderPipelineWebGL = this.original;
    for (const program of this.ready.values()) this.device.gl.deleteProgram(program);
    this.ready.clear();
    this.variantKeys.clear();
    const factory = ShaderFactory.getDefaultShaderFactory(this.device);
    for (const shader of this.retainedShaders) factory.release(shader);
    this.retainedShaders.length = 0;
    this.manager.finalize();
  }
}
