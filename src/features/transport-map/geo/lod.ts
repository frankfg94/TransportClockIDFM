import type { GlobalMapLodDefinition } from "../contracts/manifest";

export const DEFAULT_LOD_DEFINITIONS: GlobalMapLodDefinition[] = [
  { level: 0, minZoom: 0, maxZoom: 11, maxErrorMeters: 1000 },
  { level: 1, minZoom: 11, maxZoom: 14, maxErrorMeters: 250 },
  { level: 2, minZoom: 14, maxZoom: 17, maxErrorMeters: 25 },
  { level: 3, minZoom: 17, maxZoom: 24, maxErrorMeters: 0.25 },
];

export function selectLodForZoom(
  zoom: number,
  definitions: GlobalMapLodDefinition[] = DEFAULT_LOD_DEFINITIONS,
): GlobalMapLodDefinition {
  const sorted = [...definitions].sort((left, right) => left.level - right.level);
  return (
    sorted.find((lod) => zoom >= lod.minZoom && zoom < lod.maxZoom) ??
    sorted.at(-1) ??
    DEFAULT_LOD_DEFINITIONS[0]!
  );
}

export function modeBit(modeIndex: number): number {
  return 1 << modeIndex;
}

