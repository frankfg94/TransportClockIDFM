import { isNearbyPlaceCommerce } from "../nearbyPlacePresentation";
import type { CompiledPlaceRecord } from "../../../services/places/compiledPlaces";
import type { ComparisonGreen, ComparisonNeighborhood } from "./types";

export type EconomyGroup = "commerce" | "offices" | "craft" | "health" | "other";

export const COMPARISON_EXCLUDED_TRANSPORT_MODES: ReadonlySet<string> = new Set(["BIKE"]);

export function perSquareKilometer(count: number, areaM2: number): number | undefined {
  return Number.isFinite(areaM2) && areaM2 > 0 ? count * 1_000_000 / areaM2 : undefined;
}

export function economyGroup(place: CompiledPlaceRecord): EconomyGroup {
  if (place.tags?.office) return "offices";
  if (place.tags?.craft) return "craft";
  if (place.tags?.healthcare || place.rankingCategory === "health") return "health";
  if (isNearbyPlaceCommerce(place)) return "commerce";
  return "other";
}

export function comparisonScope(neighborhoods: readonly ComparisonNeighborhood[], selectedCode: string | undefined, scope: "neighborhood" | "rest") {
  if (!selectedCode || !neighborhoods.some(item => item.codeIris === selectedCode)) return [];
  return neighborhoods.filter(item => (item.codeIris === selectedCode) === (scope === "neighborhood"));
}

export function summarizeComparisonGreen(rows: readonly (ComparisonGreen | undefined)[]) {
  if (!rows.length) return undefined;
  const canopyRows = rows.filter((row): row is ComparisonGreen & { canopy: NonNullable<ComparisonGreen["canopy"]> } =>
    Boolean(row?.canopy && Number.isFinite(row.canopy.areaM2) && row.canopy.areaM2 > 0
      && Number.isFinite(row.canopy.canopyM2) && row.canopy.canopyM2 >= 0));
  const regionalParks = rows.every(row => row?.publicParkAreaM2 !== undefined);
  const legacySpaces = rows.every(row => row?.areaM2 !== undefined && !row.error);
  const canopyAreaM2 = canopyRows.reduce((sum, row) => sum + row.canopy.areaM2, 0);
  return {
    // A measured zero remains a value; unavailable IRIS areas are excluded and
    // surfaced through coverage counts instead of turning the whole sum empty.
    canopy: canopyAreaM2 > 0 ? 100 * canopyRows.reduce((sum, row) => sum + row.canopy.canopyM2, 0) / canopyAreaM2 : undefined,
    canopyCoveredIris: canopyRows.length,
    canopyTotalIris: rows.length,
    canopyCoveredAreaM2: canopyAreaM2,
    parks: regionalParks ? rows.reduce((sum, row) => sum + row!.publicParkAreaM2!, 0)
      : legacySpaces ? rows.reduce((sum, row) => sum + row!.areaM2!, 0) : undefined,
  };
}
