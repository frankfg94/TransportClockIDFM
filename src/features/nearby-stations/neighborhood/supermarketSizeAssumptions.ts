import type { NearbyPlace } from "../nearbyPlaces";
import { normalizeScoreText } from "./primitives";

export interface SupermarketSizeAssumption {
  id: string;
  label: string;
  brandWikidataIds: readonly string[];
  aliases: readonly string[];
  /** The rule guarantees a surface strictly greater than this value. */
  minimumSurfaceM2Exclusive: number;
}

/**
 * Brand-level size assumptions belong here so they stay visible and auditable.
 * Keep the lower bound as an assumption; never present it as a measured area.
 */
export const SUPERMARKET_SIZE_ASSUMPTIONS = [
  {
    id: "e-leclerc-over-1000m2",
    label: "E.Leclerc",
    brandWikidataIds: ["Q1273376"],
    aliases: ["E.Leclerc", "Leclerc"],
    minimumSurfaceM2Exclusive: 1_000,
  },
] as const satisfies readonly SupermarketSizeAssumption[];

export function getSupermarketSizeAssumption(
  place: NearbyPlace,
): (typeof SUPERMARKET_SIZE_ASSUMPTIONS)[number] | undefined {
  const wikidataIds = [place.tags?.["brand:wikidata"]]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(/[;,]/u).map((item) => item.trim().toLocaleUpperCase("en-US")));
  const identities = [place.brand, place.tags?.brand, place.name, place.tags?.name]
    .filter((value): value is string => Boolean(value))
    .map(normalizeBrandIdentity);

  return SUPERMARKET_SIZE_ASSUMPTIONS.find((assumption) => {
    if (assumption.brandWikidataIds.some((id) => wikidataIds.includes(id))) return true;
    return assumption.aliases.some((alias) => {
      const normalizedAlias = normalizeBrandIdentity(alias);
      return identities.some((identity) => identity === normalizedAlias || identity.startsWith(`${normalizedAlias} `));
    });
  });
}

function normalizeBrandIdentity(value: string): string {
  return normalizeScoreText(value)
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}
