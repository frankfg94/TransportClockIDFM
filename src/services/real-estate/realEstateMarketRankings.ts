import {
  DVF_MARKET_SCOPES,
  type DvfCityDescriptor,
  type DvfCityRank,
  type DvfMarketScope,
  type DvfRentalEstimate,
} from "./compiledRealEstate";

export type DvfMarketMetric = "price" | "rent" | "yield";

export type DvfCityMetricRankings = Partial<
  Record<DvfMarketMetric, Partial<Record<DvfMarketScope, DvfCityRank>>>
>;

export type DvfCityMetricRankingsByCode = Record<string, DvfCityMetricRankings>;

type RankingCity = Pick<DvfCityDescriptor, "code" | "rankByScope" | "medianPriceM2">;
type RankingRent = Pick<DvfRentalEstimate, "code" | "rentPerSquareMeter">;

interface RankedValue {
  code: string;
  value: number;
}

const MARKET_METRICS: readonly DvfMarketMetric[] = ["price", "rent", "yield"];

/**
 * Build the displayed metric rank for every commune against each market scope.
 * A commune outside a scope is inserted into that scope's value order, so all
 * four comparisons remain available for a hovered commune.
 */
export function buildDvfCityMetricRankings(
  cities: readonly RankingCity[],
  rentalEstimates: readonly RankingRent[],
): DvfCityMetricRankingsByCode {
  const rentByCityCode = new Map(rentalEstimates.map((estimate) => [
    estimate.code,
    estimate.rentPerSquareMeter,
  ] as const));
  const valuesByCityCode = new Map<string, Partial<Record<DvfMarketMetric, number>>>();

  for (const city of cities) {
    const rent = rentByCityCode.get(city.code);
    const price = city.medianPriceM2;
    const values: Partial<Record<DvfMarketMetric, number>> = {};
    if (isPositiveFinite(price)) values.price = price;
    if (isPositiveFinite(rent)) values.rent = rent;
    if (isPositiveFinite(price) && isPositiveFinite(rent)) values.yield = rent * 12 / price * 100;
    valuesByCityCode.set(city.code, values);
  }

  const rankingsByCityCode: DvfCityMetricRankingsByCode = {};
  for (const scope of DVF_MARKET_SCOPES) {
    const members = cities.filter((city) => city.rankByScope[scope] !== undefined);
    for (const metric of MARKET_METRICS) {
      const rankedValues = members
        .flatMap((city) => {
          const value = valuesByCityCode.get(city.code)?.[metric];
          return isPositiveFinite(value) ? [{ code: city.code, value }] : [];
        })
        .sort(compareRankedValues);
      if (!rankedValues.length) continue;

      const memberRankByCode = new Map(rankedValues.map((entry, index) => [entry.code, index + 1] as const));
      for (const city of cities) {
        const value = valuesByCityCode.get(city.code)?.[metric];
        if (!isPositiveFinite(value)) continue;

        const memberRank = memberRankByCode.get(city.code);
        const rank = memberRank ?? findInsertionIndex(rankedValues, { code: city.code, value }) + 1;
        const cityCount = rankedValues.length + (memberRank === undefined ? 1 : 0);
        const cityRankings = rankingsByCityCode[city.code] ??= {};
        const metricRankings = cityRankings[metric] ??= {};
        metricRankings[scope] = { rank, cityCount };
      }
    }
  }

  return rankingsByCityCode;
}

function compareRankedValues(left: RankedValue, right: RankedValue): number {
  return right.value - left.value || left.code.localeCompare(right.code, "fr-FR");
}

function findInsertionIndex(values: readonly RankedValue[], target: RankedValue): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (compareRankedValues(values[middle]!, target) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

function isPositiveFinite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}
