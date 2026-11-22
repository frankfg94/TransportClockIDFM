import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessFoodMarket, foodMarketCandidates, scoreFoodMarkets } from "../src/features/nearby-stations/neighborhood/criteria/foodMarkets";
import { assessCinema, scoreCinemas } from "../src/features/nearby-stations/neighborhood/criteria/cinemas";
import { analyzeCinemas, analyzeFoodMarkets, analyzeFoodMarketTransit, loadFoodMarketCandidates } from "../src/features/nearby-stations/neighborhood/venueAccess";
import { translate } from "../src/i18n";
import { foodMarketSchedule, transportSectionValues } from "../src/features/nearby-stations/neighborhood/factPresentation";
import { buildNeighborhoodScore } from "../src/features/nearby-stations/neighborhood/score";
import { buildDailyLifeCategory } from "../src/features/nearby-stations/neighborhood/criteria/dailyLife";
import { buildNatureLeisureCategory } from "../src/features/nearby-stations/neighborhood/criteria/natureLeisure";
import type { NeighborhoodFact, NeighborhoodScoreInput } from "../src/features/nearby-stations/neighborhood/contracts";
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

function label(fact: NeighborhoodFact) {
  const t = translate.bind(undefined, "fr");
  return t(fact.labelKey!, transportSectionValues(fact, fact.labelValues, t));
}

beforeEach(() => matrix.mockReset());

describe("food market accessibility", () => {
  it("gives a half point to premium markets strictly between 15 and 30 minutes", () => {
    const [small, large] = foodMarketCandidates([
      market, { ...market, id: "large", areaM2: 3_000, tags: { opening_hours: "Tu,Th,Su 07:30-13:30" } },
    ]);
    expect(assessFoodMarket({ ...small!, walkSeconds: 900 })).toMatchObject({ size: "small", qualification: { kind: "bonus" } });
    expect(assessFoodMarket({ ...large!, walkSeconds: 900 })).toMatchObject({ sessions: 3, premium: true, qualification: { kind: "exceptional-bonus" } });
    expect(scoreFoodMarkets([{ ...large!, walkSeconds: 901 }])).toMatchObject({
      points: 0.5, facts: [{ kind: "foodMarketPremium", polarity: "positive", contributionWeight: 0.5 }],
    });
    expect(scoreFoodMarkets([{ ...large!, walkSeconds: 1_799 }]).points).toBe(0.5);
    expect(scoreFoodMarkets([{ ...large!, walkSeconds: 1_800 }]).points).toBe(0);
    expect(scoreFoodMarkets([{ ...small!, walkSeconds: 901 }]).points).toBe(0);
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
    const incomplete = await analyzeFoodMarkets(origin, foodMarketCandidates([{ ...market, areaM2: undefined }]), signal);
    expect(incomplete.status).toBe("error");
    expect(assessFoodMarket(incomplete.items[0]!)).toMatchObject({
      size: "unknown", qualification: { kind: "not-evaluated" },
    });
    const empty = await analyzeFoodMarkets(origin, [], signal);
    expect(empty.status).toBe("missing");
    expect(scoreFoodMarkets(empty.items)).toEqual({ points: 0, facts: [] });
  });

  it("does not count a food market as a restaurant or as a generic shop", () => {
    const input = { ...baseInput, places: [market] };
    const [place] = foodMarketCandidates([market]);
    expect(buildDailyLifeCategory(input).score).toBe(2);
    expect(buildDailyLifeCategory({ ...input, foodMarkets: [{ ...place!, walkSeconds: 480 }] }).score).toBe(2.5);
  });

  it("shows a measured walk even outside the scoring threshold", () => {
    const [candidate] = foodMarketCandidates([market]);
    const { points, facts: [fact] } = scoreFoodMarkets([{ ...candidate!, walkSeconds: 1_280 }]);
    expect(points).toBe(0);
    expect(fact?.polarity).toBe("neutral");
    expect(label(fact!)).toBe("Marché alimentaire · 22 min à pied");
  });

  it("uses an OSM footprint as the surface fallback and retains a published surface", () => {
    const observed = { ...market, id: "way:100", areaM2: undefined, tags: { opening_hours: "Tu,Th,Su 07:30-13:30" } };
    const footprints = new Map([[observed.id, 4_279]]);
    const [estimated] = foodMarketCandidates([observed], [], footprints);
    const [published] = foodMarketCandidates([{ ...observed, areaM2: 700 }], [], footprints);
    const access = { ...estimated!, walkSeconds: 600 };
    expect(assessFoodMarket(access)).toMatchObject({ size: "large", premium: true });
    expect(assessFoodMarket({ ...published!, walkSeconds: 600 })).toMatchObject({ size: "small", premium: false });
    const t = translate.bind(undefined, "fr");
    const [fact] = scoreFoodMarkets([access]).facts;
    expect(transportSectionValues(fact!, fact!.tooltipValues, t)?.area).toBe("≈4279 m² (emprise au sol OSM)");
  });

  it("uses the higher size indicated by area or trader count and respects the upper bounds", () => {
    const [candidate] = foodMarketCandidates([market]);
    const size = (areaM2: number, listedTraders: number) => assessFoodMarket({ ...candidate!, areaM2, listedTraders }).size;
    expect(size(999, 24)).toBe("small");
    expect(size(0, 4)).toBe("unknown");
    expect(size(0, 5)).toBe("small");
    expect(size(1_000, 25)).toBe("medium");
    expect(size(3_000, 0)).toBe("large");
    expect(size(0, 75)).toBe("large");
    expect(size(8_000, 200)).toBe("large");
    expect(size(8_001, 0)).toBe("exceptional");
    expect(size(0, 201)).toBe("exceptional");
  });

  it("labels a documented premium hall on its direct-transit row and awards the extended bonus", () => {
    const hall = { ...market, id: "way:123", name: "Halles", city: "Ville exemple", areaM2: undefined };
    const [candidate] = foodMarketCandidates([hall], [{ distanceMeters: hall.distanceMeters, place: {
      ...origin, id: "tourism:123", osmPlaceId: hall.id, name: "Marché central", city: hall.city, cityCode: "00000",
      address: "Place du marché", sessionsPerWeek: 3, openingHours: "Tu,Fr,Su 08:00-13:00", sourceUrl: "https://ville.example/marche",
    } }], new Map([[hall.id, 3_600]]));
    const journey = { ...directJourney, durationSeconds: 1_020, sections: [
      { type: "walking", durationSeconds: 120, timingSource: "estimated" as const },
      { type: "public_transport", durationSeconds: 900, lineCode: "T1" },
    ] };
    const scored = scoreFoodMarkets([], [{ market: candidate!, journey }]);
    expect(scored).toMatchObject({ points: 0.5, facts: [{ kind: "foodMarketPremiumTransit", polarity: "positive", contributionWeight: 0.5 }] });
    expect(label(scored.facts[0]!)).toBe("Halles (Ville exemple) · marché premium · ≈17 min 00 s via T1 en direct");
    expect(scoreFoodMarkets([{ ...candidate!, id: "closer", walkSeconds: 800 }], [{ market: candidate!, journey }]).points).toBe(1.25);
  });

  it("renders a distinct schedule row per weekday and groups seasonal times within that day", () => {
    const t = translate.bind(undefined, "fr");
    const formatMonth = (index: number) => ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."][index]!;
    const weekly = foodMarketSchedule("Tu, Fr 08:30-13:00; Su 08:00–13:00", t, formatMonth);
    expect(weekly.rows.map(row => [row.label, row.slots[0]!.time])).toEqual([
      ["Mardi", "08:30–13:00"], ["Vendredi", "08:30–13:00"], ["Dimanche", "08:00–13:00"],
    ]);
    const seasonal = foodMarketSchedule("Nov-Mar Fr,Su 08:00-13:00; Apr-Oct Fr,Su 08:00-14:00", t, formatMonth);
    expect(seasonal.rows.map(row => row.label)).toEqual(["Vendredi", "Dimanche"]);
    expect(seasonal.rows[0]?.slots).toEqual([
      { period: "nov.–mars", time: "08:00–13:00" }, { period: "avr.–oct.", time: "08:00–14:00" },
    ]);
  });

  it("shows documented and estimated direct journeys, while excluding transfers and journeys of 30 minutes or more", async () => {
    const hall = { ...market, id: "hall", name: "Halles", city: "Ville exemple", distanceMeters: 1_800 };
    const amap = { ...market, id: "amap", name: "AMAP du quartier" };
    const second = { ...market, id: "second", name: "Marché du Centre" };
    const distant = { ...market, id: "distant", name: "Marché éloigné" };
    const searchNearby = vi.fn(async () => [amap, hall, second, distant]);
    const transitSection = { type: "public_transport", durationSeconds: 300, lineCode: "T1" };
    const fast = { ...directJourney, durationSeconds: 900, sections: [
      { type: "walking", durationSeconds: 200 }, { type: "waiting", durationSeconds: 200 }, transitSection,
      { type: "walking", durationSeconds: 200 },
    ] };
    const estimated = { ...fast, durationSeconds: 1_021, sections: [
      { type: "walking", durationSeconds: 721, walkingProvider: "straight-line" }, transitSection,
    ] };
    const probe = vi.fn(async (place: NearbyPlace) => [
      { ...fast, durationSeconds: 1800 },
      { ...fast, durationSeconds: 400, sections: [transitSection, transitSection] },
      ...(place.id === hall.id ? [estimated] : place.id === second.id ? [fast] : []),
    ]);
    const candidates = await loadFoodMarketCandidates(origin, { ...provider, searchNearby }, signal);
    const items = await analyzeFoodMarketTransit(candidates, probe, signal);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(items).toMatchObject([{ market: { id: "hall", food: false }, journey: estimated }, { market: { id: "second" }, journey: fast }]);
    const [candidate] = foodMarketCandidates([market]);
    const category = buildDailyLifeCategory({
      ...baseInput, places: [market], foodMarkets: [{ ...candidate!, walkSeconds: 480 }, { ...candidates[0]!, walkSeconds: 1_680 }],
      marketTransit: items,
    });
    expect(category.score).toBe(2.5);
    expect(category.positiveFacts.filter(fact => fact.family === "food-market").map(label)).toEqual([
      "Marché alimentaire · 8 min à pied", "Marché du Centre · 15 min 00 s via T1 en direct",
    ]);
    expect(category.neutralFacts.map(label)).toEqual(["Halles (Ville exemple) · 28 min à pied · ≈17 min 01 s via T1 en direct"]);
    expect(category.neutralFacts[0]?.travel?.journey).toBe(estimated);
  });

  it("keeps every in-range market in the daily-life section when merging a back-end verdict", () => {
    const markets = foodMarketCandidates(Array.from({ length: 8 }, (_, index) => ({
      ...market, id: `market-${index}`, name: `Marché alimentaire ${index}`,
    }))).map((candidate, index) => ({ ...candidate, walkSeconds: [600, 900, 901, 1_000, 1_300, 1_600, 1_799, 1_800][index] }));
    const result = buildNeighborhoodScore({
      ...baseInput, places: [market], foodMarkets: markets,
      backendVerdict: { schemaVersion: "1.3", generatedAt: "2026-09-01T00:00:00.000Z", warnings: [], sources: [],
        categories: [{ id: "daily-life", status: "available", positiveFacts: [], negativeFacts: [], neutralFacts: [], limitations: [] }] },
    });
    const category = result.categories.find(item => item.id === "daily-life");
    expect(category?.positiveFacts.filter(fact => fact.family === "food-market")).toHaveLength(2);
    expect(category?.neutralFacts.filter(fact => fact.family === "food-market")).toHaveLength(5);
  });
});

describe("cinema accessibility", () => {
  it("retains the direct cinema journey if pedestrian routing fails", async () => {
    matrix.mockRejectedValueOnce(new Error("route unavailable"));
    const analysis = await analyzeCinemas(origin, [cinema], async () => [directJourney], signal);
    expect(analysis.items[0]?.transit).toEqual(directJourney);
    expect(scoreCinemas(analysis.items).facts[0]?.kind).toBe("cinemaTransit");
  });
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

  it("keeps an eligible walk if the direct transit provider is unavailable", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("upstream unavailable"));
    matrix.mockResolvedValueOnce([route(cinema.id, 300, true)]).mockResolvedValueOnce([route(cinema.id, 300)]);
    const failed = await analyzeCinemas(origin, [cinema], probe, signal);
    expect(failed.status).toBe("error");
    expect(scoreCinemas(failed.items)).toMatchObject({ points: 0, facts: [{ kind: "cinemaAccessUnknown" }] });
    expect((await analyzeCinemas(origin, [cinema], probe, signal)).status).toBe("ready");
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("shows a faster direct ride alongside a qualifying walk, excluding connections and omitting unknown size", async () => {
    matrix.mockResolvedValue([route(cinema.id, 540)]);
    const ride = { type: "public_transport", lineCode: "T1", durationSeconds: 200 };
    const direct = { ...directJourney, durationSeconds: 420, sections: [
      { type: "walking", durationSeconds: 160, walkingProvider: "straight-line" }, { type: "waiting", durationSeconds: 60 }, ride,
    ] };
    const probe = vi.fn(async () => [
      { ...directJourney, durationSeconds: 250, transferCount: 1, sections: [ride, ride] }, direct,
    ]);
    const access = await analyzeCinemas(origin, [cinema], probe, signal);
    expect(probe).toHaveBeenCalledOnce();
    const result = scoreCinemas(access.items);
    expect(result).toMatchObject({ points: 1, facts: [{ travel: { journey: direct } }] });
    expect(label(result.facts[0]!)).toBe("Cinéma · 9 min à pied · ≈7 min 00 s via T1 en direct");
    const estimatedShort = { ...direct, durationSeconds: 290 };
    expect(scoreCinemas([{ ...access.items[0]!, walkSeconds: 660, transit: estimatedShort }]).points).toBe(0);
  });

  it("classifies a cinema only when its footprint is available", () => {
    const withSurface = scoreCinemas([{ place: cinema, walkSeconds: 660, footprintAreaM2: 680 }]);
    expect(label(withSurface.facts[0]!)).toBe("Cinéma · 11 min à pied · Petit cinéma");
    const larger = scoreCinemas([{ place: { ...cinema, areaM2: 2_000 }, walkSeconds: 660, footprintAreaM2: 680 }]);
    expect(label(larger.facts[0]!)).toBe("Cinéma · 11 min à pied · Grand cinéma");
  });

  it("scores a direct trip under five minutes by cinema size", () => {
    const access = { place: cinema, walkSeconds: 676, transit: { ...directJourney, durationSeconds: 287,
      sections: directJourney.sections.map((section, index) => index === 0 ? { ...section, timingSource: "estimated" as const } : section) } };
    expect(scoreCinemas([{ ...access, footprintAreaM2: 700 }])).toMatchObject({ points: 0.5, facts: [{ contributionWeight: 0.5 }] });
    expect(scoreCinemas([{ ...access, footprintAreaM2: 900 }]).points).toBe(1);
    expect(scoreCinemas([{ ...access, footprintAreaM2: 1_500 }]).points).toBe(1);
    expect(scoreCinemas([{ ...access, footprintAreaM2: 900, transit: { ...access.transit, durationSeconds: 300 } }]).points).toBe(0);
  });

  it("awards its dedicated point in Culture & Loisirs without counting the same venue as generic leisure", () => {
    const input = { ...baseInput, places: [cinema] };
    expect(buildNatureLeisureCategory({ ...input, cinemas: [{ place: cinema, walkSeconds: 601 }] }).score).toBeUndefined();
    expect(buildNatureLeisureCategory({ ...input, cinemas: [{ place: cinema, walkSeconds: 240 }] })).toMatchObject({
      score: 5, positiveFacts: [{ family: "cinema" }],
    });
  });
});
