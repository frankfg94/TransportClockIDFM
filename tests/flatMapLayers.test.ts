import { describe, expect, it } from "vitest";
import { COORDINATE_SYSTEM, WebMercatorViewport, project, type LayerContext } from "@deck.gl/core";
import { PathStyleExtension } from "@deck.gl/extensions";
import { lngLatToWorld } from "@math.gl/web-mercator";
import type { ShaderModule } from "@luma.gl/shadertools";
import { FlatMapPathLayer, FlatMapScatterplotLayer } from "../src/features/transport-map/next/flatMapLayers";

function findModule(modules: ShaderModule[], name: string): ShaderModule | undefined {
  for (const module of modules) {
    if (module.name === name) return module;
    const found = findModule(module.dependencies ?? [], name);
    if (found) return found;
  }
}

describe("flat Mercator Deck layers", () => {
  it("specializes only flat Cartesian variants and preserves extension hooks and upstream modules", () => {
    const original = project.vs;
    for (const Layer of [FlatMapPathLayer, FlatMapScatterplotLayer]) {
      const layer = new Layer({ id: "flat", data: [], coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        extensions: [new PathStyleExtension({ dash: true })] });
      layer.context = { defaultShaderModules: [] } as unknown as LayerContext;
      layer.state = { pathTesselator: undefined } as never;
      const shaders = layer.getShaders();
      const specialized = findModule(shaders.modules, "project")!;
      expect(specialized.vs).not.toContain("project.coordinateSystem");
      expect(specialized.vs).not.toContain("project.projectionMode == PROJECTION_MODE_GLOBE");
      expect(specialized.vs).toContain("PROJECTION_MODE_WEB_MERCATOR_AUTO_OFFSET");
      expect(specialized.vs).toContain("position64Low");
      expect(specialized.getUniforms).toBe(project.getUniforms);
      expect(findModule(shaders.modules, "pathStyle")).toBeDefined();
      expect(shaders.vs).not.toContain(".billboard");
      const fallback = layer.clone({ billboard: true });
      fallback.context = layer.context;
      fallback.state = layer.state;
      expect(findModule(fallback.getShaders().modules, "project")!.vs).toBe(original);
    }
    expect(project.vs).toBe(original);
  });

  it.each([4, 8, 11.99, 12, 16, 20])("retains subpixel screen placement with fp64 offsets at zoom %s", (zoom) => {
    const viewport = new WebMercatorViewport({ longitude: 2.35, latitude: 48.85, zoom, width: 800, height: 600 });
    const uniforms = project.getUniforms({ viewport, coordinateSystem: COORDINATE_SYSTEM.CARTESIAN }) as any;
    const f = Math.fround;
    for (const screen of [[100, 100], [400, 300], [700, 500]]) {
      const lngLat = viewport.unproject(screen!);
      const common = lngLatToWorld(lngLat);
      const position = common.map((value, i) => {
        const high = f(value);
        const low = f(value - high);
        return uniforms.projectionMode === 4 ? f(f(high - uniforms.coordinateOrigin[i]) + low) : f(high + low);
      });
      const input = [position[0]!, position[1]!, 0, 1];
      const clip = [0, 1, 2, 3].map((row) => {
        let value = 0;
        for (let col = 0; col < 4; col++) value = f(value + f(f(uniforms.viewProjectionMatrix[col * 4 + row]) * input[col]!));
        return f(value + f(uniforms.center[row]));
      });
      const actual = [(clip[0]! / clip[3]! + 1) * 400, (1 - clip[1]! / clip[3]!) * 300];
      expect(Math.abs(actual[0]! - screen[0]!)).toBeLessThan(0.25);
      expect(Math.abs(actual[1]! - screen[1]!)).toBeLessThan(0.25);
    }
  });
});
