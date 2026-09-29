import { describe, expect, it } from "vitest";
import type { DvfMarketScope } from "../src/services/real-estate/compiledRealEstate";
import { buildDvfCityMetricRankings } from "../src/services/real-estate/realEstateMarketRankings";

function city(code: string, medianPriceM2: number, scopes: readonly DvfMarketScope[]) {
  return {
    code,
    medianPriceM2,
    rankByScope: Object.fromEntries(scopes.map((scope) => [scope, { rank: 1, cityCount: 1 }])),
  };
}

describe("real-estate commune market rankings", () => {
  it("ranks price, rent, and gross yield within all four scopes", () => {
    const rankings = buildDvfCityMetricRankings(
      [
        city("75001", 10_000, ["paris-intramuros", "idf"]),
        city("92001", 9_000, ["petite-couronne", "idf"]),
        city("77001", 7_000, ["grande-couronne", "idf"]),
      ],
      [
        { code: "75001", rentPerSquareMeter: 100 },
        { code: "92001", rentPerSquareMeter: 80 },
        { code: "77001", rentPerSquareMeter: 90 },
      ],
    );

    expect(rankings["75001"]?.price?.idf).toEqual({ rank: 1, cityCount: 3 });
    expect(rankings["75001"]?.rent?.idf).toEqual({ rank: 1, cityCount: 3 });
    expect(rankings["75001"]?.yield?.idf).toEqual({ rank: 2, cityCount: 3 });
    expect(rankings["75001"]?.price?.["paris-intramuros"]).toEqual({ rank: 1, cityCount: 1 });
    expect(rankings["75001"]?.price?.["petite-couronne"]).toEqual({ rank: 1, cityCount: 2 });
    expect(rankings["75001"]?.price?.["grande-couronne"]).toEqual({ rank: 1, cityCount: 2 });
  });

  it("omits rent and yield ranks when a commune has no rent estimate", () => {
    const rankings = buildDvfCityMetricRankings(
      [city("75001", 10_000, ["paris-intramuros", "idf"])],
      [],
    );

    expect(rankings["75001"]?.price?.idf).toEqual({ rank: 1, cityCount: 1 });
    expect(rankings["75001"]?.rent).toBeUndefined();
    expect(rankings["75001"]?.yield).toBeUndefined();
  });
});
