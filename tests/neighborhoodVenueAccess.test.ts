import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessFoodMarket, foodMarketCandidates, scoreFoodMarkets } from "../src/features/nearby-stations/neighborhood/criteria/foodMarkets";
import { assessCinema, scoreCinemas } from "../src/features/nearby-stations/neighborhood/criteria/cinemas";
import { analyzeCinemas, analyzeFoodMarkets } from "../src/features/nearby-stations/neighborhood/venueAccess";
import { buildDailyLifeCategory } from "../src/features/nearby-stations/neighborhood/criteria/dailyLife";
import { buildNatureLeisureCategory } from "../src/features/nearby-stations/neighborhood/criteria/natureLeisure";
import type { NeighborhoodScoreInput } from "../src/features/nearby-stations/neighborhood/contracts";
import type { NearbyPlace, PlacesProvider } from "../src/features/nearby-stations/nearbyPlaces";
import type { NearbyJourney } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { NearbyWalkingRoute } from "../src/features/nearby-stations/nearbyWalkingRoutes";

const { matrix } = vi.hoisted(() => ({ matrix: vi.fn() }));
vi.mock("../src/services/nearbyWalkingRoutes", () => ({ getNearbyWalkingRouteMatrix: matrix }));

const origin = { lat: 48.75, lon: 2.30 };
const market: NearbyPlace = { ...origin, id: "market", name: "Marché alimentaire", kind: "marketplace",
  category: "food", areaM2: 120, distanceMeters: 300, tags: { opening_hours: "Sa 08:00-13:00" } };
const cinema: NearbyPlace = { ...origin, id: "cinema", name: "Cinéma", kind: "cinema",
  category: "culture", distanceMeters: 500 };
const provider: PlacesProvider = { searchNearby: async () => [], searchDestinations: async () => [] };
const signal = new AbortController().signal;
const directJourney: NearbyJourney = {
  durationSeconds: 300, transferCount: 0,
  sections: [
    { type: "walking", durationSeconds: 60 },
    { type: "waiting", durationSeconds: 60 },
    { type: "public_transport", durationSeconds: 180 },
  ],
};
function route(id: string, durationSeconds: number, fallback = false): NearbyWalkingRoute {
  return { id, durationSeconds, distanceMeters: 500, provider: fallback ? "straight-line" : "ign-bdtopo", fallback, coordinates: [] };
}

const baseInput = { placesLoaded: true, stations: [], stationsLoaded: true } satisfies Omit<NeighborhoodScoreInput, "places">;

beforeEach(() => matrix.mockReset());

describe("food market accessibility", () => {
  it("distinguishes small markets and separates quality from the walking threshold", () => {
    const [small, large] = foodMarketCandidates([
      market, { ...market, id: "large", areaM2: 3_000, tags: { opening_hours: "Tu,Th,Su 07:30-13:30" } },
    ]);
    expect(assessFoodMarket({ ...small!, walkSeconds: 900 })).toMatchObject({ size: "small", qualification: { kind: "bonus" } });
    expect(assessFoodMarket({ ...large!, walkSeconds: 900 })).toMatchObject({ sessions: 3, premium: true, qualification: { kind: "exceptional-bonus" } });
    expect(scoreFoodMarkets([{ ...large!, walkSeconds: 901 }])).toMatchObject({
      points: 0, facts: [{ kind: "foodMarketPremiumContext", polarity: "neutral" }],
    });
  });

  it("combines the mapped sections of the documented market without assuming its area", () => {
    const [candidate, duplicate] = foodMarketCandidates([
      { ...market, id: "way:81124460", distanceMeters: 450 },
      { ...market, id: "way:1296663566", distanceMeters: 120 },
    ]);
    expect(duplicate).toBeUndefined();
    expect(candidate).toMatchObject({ place: { id: "way:1296663566" }, record: { traders: 200 } });
    expect(candidate?.areaM2).toBeUndefined();
    expect(assessFoodMarket({ ...candidate!, walkSeconds: 146 })).toMatchObject({ premium: true, sessions: 3 });
  });

  it("keeps unknown surface separate and gives no bonus for an estimated walking time or an empty inventory", async () => {
    matrix.mockResolvedValue([route(market.id, 300, true)]);
    const incomplete = await analyzeFoodMarkets(origin, [{ ...market, areaM2: undefined }], provider, signal);
    expect(incomplete.status).toBe("error");
    expect(assessFoodMarket(incomplete.items[0]!)).toMatchObject({
      size: "unknown", qualification: { kind: "not-evaluated" },
    });
    const empty = await analyzeFoodMarkets(origin, [], provider, signal);
    expect(empty.status).toBe("missing");
    expect(scoreFoodMarkets(empty.items)).toEqual({ points: 0, facts: [] });
  });

  it("does not count a food market as a restaurant or as a generic shop", () => {
    const input = { ...baseInput, places: [market] };
    const [place] = foodMarketCandidates([market]);
    expect(buildDailyLifeCategory(input).score).toBe(2);
    expect(buildDailyLifeCategory({ ...input, foodMarkets: [{ ...place!, walkSeconds: 480 }] }).score).toBe(2.5);
  });
});

describe("cinema accessibility", () => {
  it("uses inclusive thresholds and grants a single bonus when both modes qualify", () => {
    expect(assessCinema({ place: cinema, walkSeconds: 600 }).qualification.kind).toBe("bonus");
    expect(assessCinema({ place: cinema, walkSeconds: 601, transit: directJourney }).mode).toBe("transit");
    expect(scoreCinemas([{ place: cinema, walkSeconds: 500, transit: directJourney }])).toMatchObject({
      points: 1, facts: [{ kind: "cinemaTransit", category: "nature-leisure" }],
    });
    expect(assessCinema({ place: cinema, walkSeconds: 601, transit: { ...directJourney, durationSeconds: 301 } }).qualification.kind).toBe("neutral");
  });

  it("uses the full public transport duration when the walk does not qualify", async () => {
    matrix.mockResolvedValue([route(cinema.id, 700)]);
    const probe = vi.fn(async () => [directJourney]);
    const access = await analyzeCinemas(origin, [cinema], probe, signal);
    expect(access.status).toBe("ready");
    expect(probe).toHaveBeenCalledOnce();
    expect(scoreCinemas(access.items)).toMatchObject({ points: 1, facts: [{ kind: "cinemaTransit", labelValues: { minutes: 5 } }] });
  });

  it("marks provider outages as unassessed and skips a redundant transit probe for an eligible walk", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("upstream unavailable"));
    matrix.mockResolvedValueOnce([route(cinema.id, 300, true)]).mockResolvedValueOnce([route(cinema.id, 300)]);
    const failed = await analyzeCinemas(origin, [cinema], probe, signal);
    expect(failed.status).toBe("error");
    expect(scoreCinemas(failed.items)).toMatchObject({ points: 0, facts: [{ kind: "cinemaAccessUnknown" }] });
    expect((await analyzeCinemas(origin, [cinema], probe, signal)).status).toBe("ready");
    expect(probe).toHaveBeenCalledOnce();
  });

  it("awards its dedicated point in Culture & Loisirs without counting the same venue as generic leisure", () => {
    const input = { ...baseInput, places: [cinema] };
    expect(buildNatureLeisureCategory({ ...input, cinemas: [{ place: cinema, walkSeconds: 601 }] }).score).toBeUndefined();
    expect(buildNatureLeisureCategory({ ...input, cinemas: [{ place: cinema, walkSeconds: 240 }] })).toMatchObject({
      score: 5, positiveFacts: [{ family: "cinema" }],
    });
  });
});
