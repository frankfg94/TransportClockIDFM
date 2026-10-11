import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM, type UpdateParameters } from "@deck.gl/core";
import type { ShaderModule } from "@luma.gl/shadertools";

// Positions are already in Deck's Mercator common space. Keep Deck's low/high
// zoom fp64 offsets, but eliminate the geographic/globe projection branches and
// the unused billboard extrusion path from the GPU program.
const modules = new WeakMap<ShaderModule, ShaderModule>();
function flatModule(module: ShaderModule): ShaderModule {
  const cached = modules.get(module);
  if (cached) return cached;
  const result = { ...module, dependencies: module.dependencies?.map(flatModule),
    vs: module.name === "project" ? module.vs
      ?.replaceAll("project.coordinateSystem", "COORDINATE_SYSTEM_CARTESIAN")
      .replaceAll("project.modelMatrix", "mat4(1.0)")
      .replaceAll("project.projectionMode == PROJECTION_MODE_GLOBE", "false")
      .replaceAll("project.projectionMode == PROJECTION_MODE_IDENTITY", "false") : module.vs };
  modules.set(module, result);
  return result;
}

export class FlatMapPathLayer<T = any> extends PathLayer<T> {
  static override layerName = "FlatMapPathLayer";
  override updateState(params: UpdateParameters<this>) {
    const { props, oldProps } = params;
    const variantChanged = props.coordinateSystem !== oldProps.coordinateSystem || props.billboard !== oldProps.billboard
      || Boolean(props.modelMatrix) !== Boolean(oldProps.modelMatrix) || props.widthUnits !== oldProps.widthUnits;
    super.updateState(variantChanged ? { ...params, changeFlags: { ...params.changeFlags, extensionsChanged: true } } : params);
  }
  override getShaders() {
    const shaders = super.getShaders();
    if (this.props.coordinateSystem !== COORDINATE_SYSTEM.CARTESIAN || this.props.billboard || this.props.modelMatrix) return shaders;
    return { ...shaders, vs: shaders.vs?.replaceAll("path.billboard", "false")
      .replaceAll("path.widthUnits", this.props.widthUnits === "pixels" ? "UNIT_PIXELS" : "path.widthUnits"),
      modules: shaders.modules?.map(flatModule) };
  }
}

export class FlatMapScatterplotLayer<T = any> extends ScatterplotLayer<T> {
  static override layerName = "FlatMapScatterplotLayer";
  override updateState(params: UpdateParameters<this>) {
    const { props, oldProps } = params;
    const variantChanged = props.coordinateSystem !== oldProps.coordinateSystem || props.billboard !== oldProps.billboard
      || Boolean(props.modelMatrix) !== Boolean(oldProps.modelMatrix) || props.radiusUnits !== oldProps.radiusUnits || props.lineWidthUnits !== oldProps.lineWidthUnits;
    super.updateState(variantChanged ? { ...params, changeFlags: { ...params.changeFlags, extensionsChanged: true } } : params);
  }
  override getShaders() {
    const shaders = super.getShaders();
    if (this.props.coordinateSystem !== COORDINATE_SYSTEM.CARTESIAN || this.props.billboard || this.props.modelMatrix) return shaders;
    return { ...shaders, vs: shaders.vs?.replaceAll("scatterplot.billboard", "false")
      .replaceAll("scatterplot.radiusUnits", this.props.radiusUnits === "pixels" ? "UNIT_PIXELS" : "scatterplot.radiusUnits")
      .replaceAll("scatterplot.lineWidthUnits", this.props.lineWidthUnits === "pixels" ? "UNIT_PIXELS" : "scatterplot.lineWidthUnits"),
      modules: shaders.modules?.map(flatModule) };
  }
}
