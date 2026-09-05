import type { AppLocale } from "../../../i18n/types.js";

export type NextMapStyle = string | Record<string, unknown>;

export const DEFAULT_NEXT_VECTOR_STYLE_URL =
  "https://tiles.openfreemap.org/styles/positron";

export interface VectorStyleDiagnostic {
  valid: boolean;
  vectorSourceIds: string[];
  rasterSourceIds: string[];
  reason?: string;
}

/**
 * Validate a loaded MapLibre style without coupling the transport renderer
 * to a provider. Empty-source styles are accepted for deterministic local
 * tests; production styles should report at least one vector source.
 */
export function diagnoseVectorStyle(style: unknown): VectorStyleDiagnostic {
  if (!style || typeof style !== "object") {
    return { valid: false, vectorSourceIds: [], rasterSourceIds: [], reason: "style-not-an-object" };
  }
  const sources = (style as { sources?: unknown }).sources;
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) {
    return { valid: false, vectorSourceIds: [], rasterSourceIds: [], reason: "style-sources-missing" };
  }
  const vectorSourceIds: string[] = [];
  const rasterSourceIds: string[] = [];
  for (const [id, source] of Object.entries(sources)) {
    const type = source && typeof source === "object" ? (source as { type?: unknown }).type : undefined;
    if (type === "vector") vectorSourceIds.push(id);
    if (type === "raster" || type === "raster-dem" || type === "image" || type === "video") rasterSourceIds.push(id);
  }
  const layers = (style as { layers?: unknown }).layers;
  const hasOnlyBackground = Array.isArray(layers) && layers.every(
    (layer) => layer && typeof layer === "object" && (layer as { type?: unknown }).type === "background",
  );
  const valid = vectorSourceIds.length > 0 || (Object.keys(sources).length === 0 && hasOnlyBackground);
  return {
    valid,
    vectorSourceIds,
    rasterSourceIds,
    reason: valid ? undefined : vectorSourceIds.length === 0 ? "no-vector-source" : "invalid-style",
  };
}

export function resolveNextMapStyle(style: NextMapStyle | undefined): NextMapStyle {
  return style ?? DEFAULT_NEXT_VECTOR_STYLE_URL;
}

type MapLibreStyleLayer = {
  id?: unknown;
  type?: unknown;
};

export interface MapLibreLabelStyleAdapter {
  getStyle: () => { layers?: readonly MapLibreStyleLayer[] };
  getLayoutProperty: (layerId: string, name: "text-field") => unknown;
  setLayoutProperty: (layerId: string, name: "text-field", value: unknown) => void;
}

/**
 * OpenFreeMap's vector tiles expose localized name properties, while styles
 * commonly request the provider's default `{name}`/`name:latin` field. Keep a
 * local fallback so a missing translation never hides a basemap label.
 */
export function createMapLibreLocalizedTextField(locale: AppLocale): unknown[] {
  return [
    "coalesce",
    ["get", `name:${locale}`],
    ["get", `name_${locale}`],
    ["get", "name"],
  ];
}

/** Replace a basemap text field's name access with the selected app locale. */
export function localizeMapLibreTextField(
  textField: unknown,
  locale: AppLocale,
): unknown {
  if (typeof textField === "string") {
    return isNameTemplate(textField)
      ? createMapLibreLocalizedTextField(locale)
      : textField;
  }

  if (!Array.isArray(textField)) return textField;
  if (isNameGetter(textField) || isLocalizedNameExpression(textField)) {
    return createMapLibreLocalizedTextField(locale);
  }

  let changed = false;
  const localized = textField.map((part) => {
    if (!Array.isArray(part)) return part;
    const next = localizeMapLibreTextField(part, locale);
    if (!sameStyleValue(part, next)) changed = true;
    return next;
  });

  return changed ? localized : textField;
}

/** Apply the selected app locale to every name-based MapLibre symbol layer. */
export function applyMapLibreLabelLocale(
  map: MapLibreLabelStyleAdapter,
  locale: AppLocale,
): number {
  const layers = map.getStyle().layers;
  if (!Array.isArray(layers)) return 0;

  let changed = 0;
  for (const layer of layers) {
    if (layer.type !== "symbol" || typeof layer.id !== "string") continue;

    const current = map.getLayoutProperty(layer.id, "text-field");
    const next = localizeMapLibreTextField(current, locale);
    if (typeof next === "undefined" || sameStyleValue(current, next)) continue;

    map.setLayoutProperty(layer.id, "text-field", next);
    changed += 1;
  }

  return changed;
}

function isNameTemplate(value: string): boolean {
  return /^\s*\{name(?:(?::|_)[^}]+)?\}\s*$/iu.test(value);
}

function isNameGetter(value: unknown): value is unknown[] {
  return Array.isArray(value) && value[0] === "get" && isNameProperty(value[1]);
}

function isLocalizedNameExpression(value: unknown): boolean {
  if (!Array.isArray(value) || value[0] !== "coalesce") return false;
  const operands = value.slice(1);
  return operands.length >= 2 &&
    operands.some((operand) => isNameGetter(operand)) &&
    isNameGetter(operands.at(-1));
}

function isNameProperty(value: unknown): value is string {
  return typeof value === "string" && /^name(?:(?::|_)[a-z0-9-]+)?$/iu.test(value);
}

function sameStyleValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => sameStyleValue(value, right[index]));
}
