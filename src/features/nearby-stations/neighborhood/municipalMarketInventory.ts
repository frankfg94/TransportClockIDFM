export interface MunicipalMarket {
  id: string;
  name: string;
  city: string;
  cityCode: string;
  address: string;
  lat: number;
  lon: number;
  openingHours?: string;
  areaM2?: number;
  listedTraders?: number;
  sessionsPerWeek: number;
  sourceUrl: string;
  sourceName?: string;
  osmPlaceId?: string;
}

export const MUNICIPAL_MARKETS_ASSET = "/data/places/municipal-markets.json";
let inventory: Promise<MunicipalMarket[]> | undefined;

export function loadMunicipalMarkets(): Promise<MunicipalMarket[]> {
  inventory ??= fetch(MUNICIPAL_MARKETS_ASSET, { signal: AbortSignal.timeout(6_000) })
    .then(async response => {
      if (!response.ok) throw new Error(`Municipal markets HTTP ${response.status}`);
      const value = await response.json() as { schemaVersion?: number; markets?: MunicipalMarket[] };
      if (value.schemaVersion !== 1 || !Array.isArray(value.markets)) throw new Error("Invalid municipal market inventory");
      return value.markets;
    })
    .catch(() => {
      inventory = undefined;
      return [];
    });
  return inventory;
}
