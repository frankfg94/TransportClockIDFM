import { describe, expect, it } from "vitest";
import type { GtfsLineFrequencyResponse } from "../src/types/lineFrequency";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { NearbyHeavyTransportCandidate } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import type { NearbyStationEntry } from "../src/features/nearby-stations/nearbyStations";
import type { PublicNeighborhoodVerdict } from "../src/features/nearby-stations/neighborhoodVerdictApi";
import {
  buildNeighborhoodScore,
  getNeighborhoodFrequencyRelevanceWeight,
  getNeighborhoodScoreBand,
  getNeighborhoodScoreDisplay,
  type NeighborhoodScoreInput,
} from "../src/features/nearby-stations/neighborhood";
import type { PublicServiceQuality } from "../src/features/nearby-stations/serviceQualityApi";

function place(id: string, kind: string, category: NearbyPlace["category"] = "shop", distanceMeters = 160): NearbyPlace {
  return { id, name: `${kind} ${id}`, kind, category, lon: 2.35, lat: 48.85, distanceMeters };
}

function line(id: string, code: string, mode: GlobalMapLine["mode"]): GlobalMapLine {
  return {
    id,
    index: id.length,
    code,
    label: code,
    mode,
    color: "#5146ff",
    textColor: "#fff",
    aliases: [],
    stationIds: [],
    geometryIds: [],
  };
}

function stationEntry(
  lines: GlobalMapLine[],
  distanceMeters = 280,
  coordinates: { lon: number; lat: number } = { lon: 2.35, lat: 48.85 },
): NearbyStationEntry {
  const station = {
    id: "station:test",
    index: 1,
    name: "Station test",
    normalizedName: "station test",
    aliases: [],
    rawRefs: ["station:test"],
    lineIds: lines.map((candidate) => candidate.id),
    ownerChunkId: "fixture",
    isHub: true,
    sourceCrs: "EPSG:2154" as const,
    sourceX: 650000,
    sourceY: 6860000,
    lon: coordinates.lon,
    lat: coordinates.lat,
    worldX: 0,
    worldY: 0,
    coordinateSource: "gtfs" as const,
    transformVersion: "lambert93-ntf-v1" as const,
  } satisfies GlobalMapStation;
  return {
    id: station.id,
    station: { ...station, memberStationIds: [station.id] },
    memberStations: [station],
    lines,
    distanceMeters,
    lineDistanceMeters: Object.fromEntries(lines.map((candidate) => [candidate.id, distanceMeters])),
    insideRadius: true,
  };
}

function journey(durationSeconds: number, transfers = 0) {
  return {
    id: `journey:${durationSeconds}`,
    durationSeconds,
    transferCount: transfers,
    sections: [
      { type: "street_network", mode: "walking", durationSeconds: 300 },
      { type: "public_transport", mode: "metro", durationSeconds: durationSeconds - 300, lineCode: "4" },
    ],
  };
}

function frequency(lineId: string, peakMinutes: number): GtfsLineFrequencyResponse {
  return {
    lineId,
    serviceDate: "20260101",
    source: "gtfs",
    status: "ready",
    topologyAvailable: true,
    branched: false,
    average: { peakMinutes },
    directions: [],
    sections: [],
    stationCount: 20,
    sampledStationCount: 10,
  };
}

function input(overrides: Partial<NeighborhoodScoreInput> = {}): NeighborhoodScoreInput {
  return {
    places: [],
    placesLoaded: true,
    stations: [],
    stationsLoaded: true,
    generatedAt: 1,
    ...overrides,
  };
}

function greenVerdict(
  nearbyGreenSpaces: NonNullable<PublicNeighborhoodVerdict["nearbyGreenSpaces"]>,
): PublicNeighborhoodVerdict {
  return {
    schemaVersion: "1.3",
    generatedAt: "2026-09-01T00:00:00.000Z",
    warnings: [],
    sources: [],
    categories: [],
    nearbyGreenSpaces,
  };
}

describe("neighborhood score", () => {
  it("adds nearby service reliability at 15% of the transport sub-score", () => {
    const metro = line("metro-1", "1", "METRO");
    const serviceQuality: PublicServiceQuality = {
      schemaVersion: "1.2",
      generatedAt: "2026-09-01T00:00:00.000Z",
      availableYears: [2023, 2024, 2025],
      lines: [{
        lineId: "metro:1",
        lineName: "1",
        mode: "METRO",
        aliases: ["1"],
        reliabilityScore: 100,
        labelKey: "very-reliable",
        scoreMethod: "metro-combined",
        trend: "improving",
        trendDelta: 1,
        yearsUsed: [2023, 2024, 2025],
        indicators: [],
      }],
      sources: [],
      warnings: [],
    };
    const withoutQuality = buildNeighborhoodScore(input({ stations: [stationEntry([metro])] }));
    const withQuality = buildNeighborhoodScore(input({ stations: [stationEntry([metro])], serviceQuality }));
    const baseTransport = withoutQuality.categories.find((category) => category.id === "transport");
    const qualityTransport = withQuality.categories.find((category) => category.id === "transport");

    expect(qualityTransport?.score).toBeGreaterThan(baseTransport?.score ?? 0);
    const qualityFact = [
      ...(qualityTransport?.positiveFacts ?? []),
      ...(qualityTransport?.negativeFacts ?? []),
      ...(qualityTransport?.neutralFacts ?? []),
    ].find((fact) => fact.kind === "transportServiceQuality");
    expect(qualityFact).toMatchObject({
      action: { href: "/lines-ranking" },
      evidence: { value: 100, unit: "/100" },
    });
  });

  it("turns zero pharmacies into an explicit negative health fact", () => {
    const result = buildNeighborhoodScore(input({ places: [place("shop", "supermarket")] }));
    const health = result.categories.find((category) => category.id === "health");

    expect(health?.score).toBe(2);
    expect(health?.negativeFacts.map((fact) => fact.kind)).toContain("noPharmacy");
  });

  it("shows a reachable hospital from a real walking route", () => {
    const hospital = place("hospital", "hospital", "service", 2_000);
    const result = buildNeighborhoodScore(input({
      places: [hospital],
      walkingRoutes: {
        [hospital.id]: {
          provider: "openrouteservice",
          distanceMeters: 2_100,
          durationSeconds: 29 * 60,
        },
      },
    }));
    const health = result.categories.find((category) => category.id === "health");
    const fact = health?.positiveFacts.find((candidate) => candidate.kind === "hospitalNearbyWalking");

    expect(fact?.labelValues).toMatchObject({ name: "hospital hospital", minutes: 29 });
    expect(fact?.evidence.proof).toBe("direct");
  });

  it("uses the nearby education POI and its real walking route", () => {
    const school: NearbyPlace = {
      ...place("school:sophie-barat", "school", "service", 700),
      name: "Groupe scolaire Sophie Barat",
      address: "50 Rue des Grillons, Châtenay-Malabry",
    };
    const result = buildNeighborhoodScore(input({
      places: [school],
      walkingRoutes: {
        [school.id]: {
          provider: "openrouteservice",
          distanceMeters: 1_350.7,
          durationSeconds: 972.5,
        },
      },
    }));
    const education = result.categories.find((category) => category.id === "education");
    const fact = education?.positiveFacts.find((candidate) => candidate.kind === "educationOtherNearby");

    expect(education?.available).toBe(true);
    expect(fact?.labelValues).toMatchObject({
      establishments: "Groupe scolaire Sophie Barat (17 min à pied)",
      count: 1,
    });
    expect(fact?.evidence.proof).toBe("direct");
  });

  it("groups education establishments by level while retaining every walking time", () => {
    const establishments: NearbyPlace[] = [
      { ...place("elementary-1", "school", "service"), name: "École élémentaire Thomas Masaryk" },
      { ...place("elementary-2", "school", "service", 240), name: "École primaire publique Jules Verne" },
      { ...place("maternelle-1", "school", "service", 300), name: "École maternelle Mouillebœufs" },
      { ...place("nursery-1", "kindergarten", "service", 360), name: "Crèche Les Coccinelles" },
      { ...place("nursery-2", "nursery", "service", 420), name: "Micro-crèche Ségoline" },
      { ...place("college-1", "school", "service", 480), name: "Collège Thomas Masaryk" },
      { ...place("high-school-1", "school", "service", 540), name: "Lycée Sophie Barat" },
      { ...place("other-1", "school", "service", 600), name: "Groupe scolaire Sophie Barat" },
    ];
    const result = buildNeighborhoodScore(input({
      places: establishments,
      walkingRoutes: Object.fromEntries(establishments.map((establishment, index) => [establishment.id, {
        provider: "openrouteservice",
        distanceMeters: 300 + index * 50,
        durationSeconds: (index + 4) * 60,
      }])),
    }));
    const education = result.categories.find((category) => category.id === "education");

    expect(education?.positiveFacts).toHaveLength(6);
    expect(education?.positiveFacts.map((fact) => fact.kind)).toEqual(expect.arrayContaining([
      "educationElementaryNearby",
      "educationMaternelleNearby",
      "educationNurseriesNearby",
      "educationCollegesNearby",
      "educationHighSchoolsNearby",
      "educationOtherNearby",
    ]));
    const elementary = education?.positiveFacts.find((fact) => fact.kind === "educationElementaryNearby");
    const nurseries = education?.positiveFacts.find((fact) => fact.kind === "educationNurseriesNearby");
    const colleges = education?.positiveFacts.find((fact) => fact.kind === "educationCollegesNearby");
    expect(elementary?.labelValues).toMatchObject({
      count: 2,
      establishments: "École élémentaire Thomas Masaryk (4 min à pied) · École primaire publique Jules Verne (5 min à pied)",
    });
    expect(nurseries?.labelValues?.establishments).toBe("Crèche Les Coccinelles (7 min à pied) · Micro-crèche Ségoline (8 min à pied)");
    expect(colleges?.labelValues?.establishments).toBe("Collège Thomas Masaryk (9 min à pied)");
  });

  it("saturates daily-life shop counts instead of rewarding raw volume indefinitely", () => {
    const ten = buildNeighborhoodScore(input({
      places: Array.from({ length: 10 }, (_, index) => place(String(index), "supermarket")),
    }));
    const oneHundred = buildNeighborhoodScore(input({
      places: Array.from({ length: 100 }, (_, index) => place(String(index), "supermarket")),
    }));
    const tenScore = ten.categories.find((category) => category.id === "daily-life")?.score;
    const oneHundredScore = oneHundred.categories.find((category) => category.id === "daily-life")?.score;

    expect(tenScore).toBe(oneHundredScore);
    expect(tenScore).toBeGreaterThan(0);
  });

  it("recognizes U Express as a nearby supermarket and collapses a butcher lot", () => {
    const uExpress: NearbyPlace = {
      id: "shop:u-express",
      name: "U Express",
      brand: "U Express",
      operator: "Système U",
      kind: "convenience",
      category: "shop",
      lon: 2.35,
      lat: 48.85,
      distanceMeters: 320,
      address: "4 rue du Marché, Ville",
    };
    const specialists: NearbyPlace[] = [
      { ...place("butcher", "butcher"), name: "Boucherie", address: "10 rue du Marché, Ville" },
      { ...place("deli", "deli"), name: "Traiteur", address: "10 rue du Marché, Ville" },
      { ...place("cheese", "cheese"), name: "Fromagerie", address: "10 rue du Marché, Ville", lon: 2.3501 },
    ];
    const result = buildNeighborhoodScore(input({ places: [uExpress, ...specialists] }));
    const daily = result.categories.find((category) => category.id === "daily-life");

    const supermarketFact = daily?.positiveFacts.find((fact) => fact.kind === "supermarketsNearby");
    expect(supermarketFact?.labelValues?.supermarkets).toContain("U Express");
    expect(supermarketFact?.labelValues?.supermarkets).toContain("4 min");
    expect(daily?.positiveFacts.find((fact) => fact.kind.startsWith("dailyStores"))?.labelValues?.count).toBe(2);
  });

  it("detects a rich shopping street from four specialist food categories under ten walking minutes", () => {
    const specialists = [
      place("cheese", "cheese", "shop", 160),
      place("butcher", "butcher", "shop", 200),
      place("deli", "deli", "shop", 240),
      place("bakery", "bakery", "shop", 280),
    ];
    const result = buildNeighborhoodScore(input({
      places: specialists,
      walkingRoutes: Object.fromEntries(specialists.map((candidate, index) => [candidate.id, {
        provider: "openrouteservice",
        distanceMeters: 120 + index * 30,
        durationSeconds: 240 + index * 30,
      }])),
    }));
    const daily = result.categories.find((category) => category.id === "daily-life");
    const fact = daily?.positiveFacts.find((candidate) => candidate.kind === "richCommercialStreet");

    expect(fact?.labelValues).toMatchObject({ count: 4, minutes: 10 });
    expect(fact?.evidence.proof).toBe("direct");
  });

  it("keeps the rich shopping street signal estimated until every walking route is real", () => {
    const specialists = [
      place("cheese", "cheese"),
      place("butcher", "butcher"),
      place("deli", "deli"),
      place("bakery", "bakery"),
    ];
    const result = buildNeighborhoodScore(input({ places: specialists }));
    const daily = result.categories.find((category) => category.id === "daily-life");

    expect(daily?.positiveFacts.find((candidate) => candidate.kind === "richCommercialStreetApprox")).toBeDefined();
  });

  it("shows a mapped tram within 400 metres with its direct walking estimate", () => {
    const tramT6 = line("line:tram:T6", "T6", "TRAM");
    const result = buildNeighborhoodScore(input({
      stations: [stationEntry([tramT6], 311)],
    }));
    const fact = result.categories
      .find((category) => category.id === "transport")
      ?.positiveFacts.find((candidate) => candidate.kind === "transportLineAtFoot");

    expect(fact?.labelValues?.line).toBe("Tramway T6");
    expect(fact?.labelValues?.minutes).toBe(4);
    expect(fact?.labelValues?.via).toBe(" à pied");
  });

  it("labels a transport access of two walking minutes or less as being at the address", () => {
    const tramT10 = line("line:tram:T10", "T10", "TRAM");
    const result = buildNeighborhoodScore(input({
      heavyCandidates: [{
        id: "station:t10",
        entry: stationEntry([tramT10], 160),
        station: stationEntry([tramT10], 160).memberStations[0]!,
        lines: [tramT10],
        distanceMeters: 160,
        access: { kind: "direct", walkingSeconds: 120, totalSeconds: 120 },
        accessByLine: {},
        projected: false,
      } satisfies NearbyHeavyTransportCandidate],
    }));
    const fact = result.categories
      .find((category) => category.id === "transport")
      ?.positiveFacts.find((candidate) => candidate.kind === "transportLineAtAddress");

    expect(fact?.labelValues?.line).toBe("Tramway T10");
    expect(fact?.labelValues?.minutes).toBe(2);
    expect(fact?.emphasis).toBe("exceptional");
    expect(result.positiveFacts[0]?.emphasis).toBe("exceptional");
  });

  it("uses calculated access, a fast Paris journey and a real frequency profile", () => {
    const metro = line("line:metro:4", "4", "METRO");
    const rer = line("line:rer:B", "B", "RER");
    const tram = line("line:tram:T10", "T10", "TRAM");
    const result = buildNeighborhoodScore(input({
      stations: [stationEntry([metro, rer, tram])],
      heavyCandidates: [{
        id: "station:test",
        entry: stationEntry([metro, rer, tram]),
        station: stationEntry([metro, rer, tram]).memberStations[0]!,
        lines: [metro, rer, tram],
        distanceMeters: 700,
        access: { kind: "direct", walkingSeconds: 387, totalSeconds: 387 },
        accessByLine: {},
        projected: false,
      } satisfies NearbyHeavyTransportCandidate],
      chateletJourneys: [journey(25 * 60)],
      frequencyProfiles: new Map([[metro.id, frequency(metro.id, 4)]]),
    }));
    const transport = result.categories.find((category) => category.id === "transport");

    expect(transport?.positiveFacts.map((fact) => fact.kind)).toEqual(expect.arrayContaining([
      "transportLineNearby",
      "transportOffer",
      "chateletUnder30",
      "frequencyVeryGood",
    ]));
    expect(transport?.positiveFacts.some((fact) => fact.labelValues?.line === "RER B")).toBe(true);
    expect(transport?.positiveFacts.find((fact) => fact.labelValues?.line === "RER B")?.labelValues?.via).toBe(" à pied");
    expect(transport?.positiveFacts.find((fact) => fact.labelValues?.line === "RER B")?.labelValues?.minutes).toBe(6);
    expect(transport?.positiveFacts.some((fact) => fact.labelValues?.line === "Tramway T10")).toBe(true);
    expect(transport?.displayScore).toBeGreaterThan(0);
  });

  it("shows peak frequency for every nearby important line and ignores buses", () => {
    const metro = line("line:metro:4", "4", "METRO");
    const tram = line("line:tram:T6", "T6", "TRAM");
    const bus = line("line:bus:62", "62", "BUS");
    const result = buildNeighborhoodScore(input({
      stations: [stationEntry([metro, tram, bus])],
      frequencyProfiles: new Map([
        [metro.id, frequency(metro.id, 4)],
        [tram.id, frequency(tram.id, 12)],
        [bus.id, frequency(bus.id, 2)],
      ]),
    }));
    const transport = result.categories.find((category) => category.id === "transport");
    const frequencyFacts = [
      ...(transport?.positiveFacts ?? []),
      ...(transport?.negativeFacts ?? []),
    ].filter((fact) => fact.kind === "frequencyVeryGood" || fact.kind === "frequencyLow");

    expect(frequencyFacts.map((fact) => fact.labelValues?.lines)).toEqual(expect.arrayContaining([
      "Métro 4",
      "Tramway T6",
    ]));
    expect(frequencyFacts).toHaveLength(2);
    expect(frequencyFacts.some((fact) => fact.labelValues?.lines === "Bus 62")).toBe(false);
    expect(frequencyFacts.find((fact) => fact.labelValues?.transport === "Tramway T6")?.labelValues?.transport).toBe("Tramway T6");
  });

  it("fades theoretical frequency by real access time and hides a remote rail line from scoring", () => {
    expect(getNeighborhoodFrequencyRelevanceWeight(5 * 60)).toBe(1);
    expect(getNeighborhoodFrequencyRelevanceWeight(10 * 60)).toBe(0.9);
    expect(getNeighborhoodFrequencyRelevanceWeight(15 * 60)).toBe(0.7);
    expect(getNeighborhoodFrequencyRelevanceWeight(20 * 60)).toBe(0.3);
    expect(getNeighborhoodFrequencyRelevanceWeight(25 * 60)).toBe(0.1);
    expect(getNeighborhoodFrequencyRelevanceWeight(26 * 60)).toBe(0);

    const transilienV = line("line:transilien:V", "V", "TRANSILIEN");
    const access = {
      kind: "connection" as const,
      walkingSeconds: 120,
      totalSeconds: 26 * 60,
      scoreSeconds: 26 * 60,
      travelSeconds: 26 * 60,
      feederLineCode: "T10",
      feederMode: "TRAM" as const,
    };
    const result = buildNeighborhoodScore(input({
      heavyCandidates: [{
        id: "station:transilien-v",
        entry: stationEntry([transilienV], 2_000),
        station: stationEntry([transilienV], 2_000).memberStations[0]!,
        lines: [transilienV],
        distanceMeters: 2_000,
        access,
        accessByLine: { [transilienV.id]: access },
        projected: true,
      } satisfies NearbyHeavyTransportCandidate],
      frequencyProfiles: new Map([[transilienV.id, frequency(transilienV.id, 15)]]),
    }));
    const transport = result.categories.find((category) => category.id === "transport");
    const frequencyFacts = [
      ...(transport?.positiveFacts ?? []),
      ...(transport?.negativeFacts ?? []),
      ...(transport?.neutralFacts ?? []),
    ].filter((fact) => fact.kind.startsWith("frequency"));

    expect(frequencyFacts).toHaveLength(0);
  });

  it("keeps a 15-to-25 minute frequency as a neutral named reference", () => {
    const rerC = line("line:rer:C", "C", "RER");
    const access = {
      kind: "connection" as const,
      walkingSeconds: 120,
      totalSeconds: 24 * 60,
      scoreSeconds: 24 * 60,
      travelSeconds: 24 * 60,
      feederLineCode: "T10",
      feederMode: "TRAM" as const,
    };
    const result = buildNeighborhoodScore(input({
      heavyCandidates: [{
        id: "station:rer-c",
        entry: stationEntry([rerC], 1_800),
        station: stationEntry([rerC], 1_800).memberStations[0]!,
        lines: [rerC],
        distanceMeters: 1_800,
        access,
        accessByLine: { [rerC.id]: access },
        projected: true,
      } satisfies NearbyHeavyTransportCandidate],
      frequencyProfiles: new Map([[rerC.id, frequency(rerC.id, 23.4)]]),
    }));
    const transport = result.categories.find((category) => category.id === "transport");
    const fact = transport?.neutralFacts.find((candidate) => candidate.kind === "frequencyRemote");

    expect(fact?.labelValues).toMatchObject({ transport: "RER C", minutes: 23.4 });
    expect(transport?.negativeFacts.some((candidate) => candidate.kind === "frequencyLow")).toBe(false);
  });

  it("does not flag a Transilien at exactly 15 minutes, but flags it beyond the threshold", () => {
    const transilien = line("line:transilien:V", "V", "TRANSILIEN");
    const stations = [stationEntry([transilien], 160)];
    const atThreshold = buildNeighborhoodScore(input({
      stations,
      frequencyProfiles: new Map([[transilien.id, frequency(transilien.id, 15)]]),
    }));
    const beyondThreshold = buildNeighborhoodScore(input({
      stations,
      frequencyProfiles: new Map([[transilien.id, frequency(transilien.id, 16)]]),
    }));

    const atThresholdTransport = atThreshold.categories.find((category) => category.id === "transport");
    const beyondThresholdTransport = beyondThreshold.categories.find((category) => category.id === "transport");
    expect(atThresholdTransport?.negativeFacts.some((fact) => fact.kind === "frequencyLow")).toBe(false);
    expect(atThresholdTransport?.neutralFacts.some((fact) => fact.kind === "frequencyContext")).toBe(true);
    expect(beyondThresholdTransport?.negativeFacts.some((fact) => fact.kind === "frequencyLow")).toBe(true);
    expect(beyondThresholdTransport?.negativeFacts.find((fact) => fact.kind === "frequencyLow")?.evidence.ruleKey)
      .toContain("frequencyLowTransilien");
  });

  it("shows a nearby moderate peak frequency as a neutral named reference", () => {
    const t10 = line("line:IDFM:C02528", "C02528", "TRAM");
    const result = buildNeighborhoodScore(input({
      stations: [stationEntry([t10], 160)],
      frequencyProfiles: new Map([[t10.id, frequency(t10.id, 6)]]),
    }));
    const transport = result.categories.find((category) => category.id === "transport");
    const fact = transport?.neutralFacts.find((candidate) => candidate.kind === "frequencyContext");

    expect(fact?.labelValues).toMatchObject({ transport: "Tramway T10", minutes: 6 });
    expect(transport?.positiveFacts.some((candidate) => candidate.kind.startsWith("frequency"))).toBe(false);
    expect(transport?.negativeFacts.some((candidate) => candidate.kind.startsWith("frequency"))).toBe(false);
  });

  it("marks a heavy line with an early last service as a transport watch point", () => {
    const metro = line("line:metro:4", "4", "METRO");
    const result = buildNeighborhoodScore(input({
      stations: [stationEntry([metro])],
      lastServiceByLine: new Map([[metro.id, { seconds: 20 * 60 * 60 }]]),
    }));
    const transport = result.categories.find((category) => category.id === "transport");
    const fact = transport?.negativeFacts.find((candidate) => candidate.kind === "lastServiceEarly");

    expect(fact?.labelValues).toMatchObject({ line: "Métro 4", time: "20:00" });
  });

  it("groups a co-located future GPE line and raises an exceptional three-line hub", () => {
    const metro13 = line("line:metro:13", "13", "METRO");
    const tramT6 = line("line:tram:T6", "T6", "TRAM");
    const rerB = line("line:rer:B", "B", "RER");
    const local = stationEntry([metro13, tramT6, rerB]);
    const result = buildNeighborhoodScore(input({
      stations: [local],
      heavyCandidates: [{
        id: "station:rer-b",
        entry: local,
        station: local.memberStations[0]!,
        lines: [rerB],
        distanceMeters: 900,
        access: {
          kind: "connection",
          walkingSeconds: 300,
          totalSeconds: 840,
          scoreSeconds: 840,
          feederMode: "TRAM",
          feederLineCode: "T6",
        },
        accessByLine: {},
        projected: true,
      } satisfies NearbyHeavyTransportCandidate],
      backendVerdict: {
        schemaVersion: "1.3",
        generatedAt: "2026-09-01T00:00:00.000Z",
        warnings: [],
        sources: [],
        futureProjects: [{
          id: "gpe:15:chatillon",
          name: "Châtillon–Montrouge",
          line: "15",
          lon: 2.35,
          lat: 48.85,
          walkingMinutes: 14,
          coLocatedCurrentLineCodes: ["13"],
        }],
        categories: [],
      },
    }));
    const transport = result.categories.find((category) => category.id === "transport");

    expect(transport?.positiveFacts.some((fact) => fact.kind === "transportHub" && fact.labelValues?.futureLine === "15")).toBe(true);
    expect(transport?.displayScore).toBeGreaterThanOrEqual(9);
  });

  it("does not repeat current or future line access when a combined hub fact covers them", () => {
    const metro13 = line("line:metro:13", "13", "METRO");
    const future15 = line("line:gpe:15", "15", "METRO");
    const local = stationEntry([metro13, future15], 800);
    const futureProject = {
      id: "gpe:15:chatillon",
      name: "Châtillon–Montrouge",
      line: "15",
      lon: 2.35,
      lat: 48.85,
      walkingMinutes: 14,
      coLocatedCurrentLineCodes: ["13"],
    };
    const result = buildNeighborhoodScore(input({
      stations: [local],
      heavyCandidates: [{
        id: "station:chatillon",
        entry: local,
        station: local.memberStations[0]!,
        lines: [metro13, future15],
        distanceMeters: 800,
        access: { kind: "direct", walkingSeconds: 840, totalSeconds: 840 },
        accessByLine: {},
        futureProjectsByLine: { [future15.id]: futureProject },
        projected: true,
      } satisfies NearbyHeavyTransportCandidate],
      backendVerdict: {
        schemaVersion: "1.3",
        generatedAt: "2026-09-01T00:00:00.000Z",
        warnings: [],
        sources: [],
        futureProjects: [futureProject],
        categories: [],
      },
    }));
    const transport = result.categories.find((category) => category.id === "transport");
    const accessFacts = transport?.positiveFacts.filter((fact) => fact.kind.startsWith("transportLine")) ?? [];

    expect(transport?.positiveFacts.some((fact) => fact.kind === "transportHub")).toBe(true);
    expect(accessFacts.some((fact) => fact.labelValues?.line === "Métro 13")).toBe(false);
    expect(accessFacts.some((fact) => fact.labelValues?.line === "Métro 15")).toBe(false);
  });

  it("uses a real current-line access for a co-located GPE station beyond 15 minutes on foot", () => {
    const metro13 = line("line:metro:13", "13", "METRO");
    const local = stationEntry([metro13], 900, { lon: 2.30177, lat: 48.81077 });
    const target = local.memberStations[0]!;
    const result = buildNeighborhoodScore(input({
      stations: [local],
      heavyCandidates: [{
        id: "station:chatillon-metro13",
        entry: local,
        station: target,
        lines: [metro13],
        distanceMeters: 900,
        access: {
          kind: "connection",
          walkingSeconds: 300,
          totalSeconds: 900,
          scoreSeconds: 840,
          feederMode: "TRAM",
          feederLineCode: "T6",
        },
        accessByLine: {},
        projected: true,
      } satisfies NearbyHeavyTransportCandidate],
      backendVerdict: {
        schemaVersion: "1.3",
        generatedAt: "2026-09-01T00:00:00.000Z",
        warnings: [],
        sources: [],
        futureProjects: [{
          id: "gpe:15:chatillon",
          name: "Châtillon–Montrouge",
          line: "15",
          lon: 2.302360404641419,
          lat: 48.811218369520546,
          walkingMinutes: 22,
        }],
        categories: [],
      },
    }));
    const hub = result.categories
      .find((category) => category.id === "transport")
      ?.positiveFacts.find((fact) => fact.kind === "transportHub");

    expect(hub?.labelValues?.currentLines).toBe("Métro 13");
    expect(hub?.labelValues?.futureLine).toBe("15");
    expect(hub?.labelValues?.minutes).toBe(14);
    expect(hub?.labelValues?.via).toBe("Tramway T6");
  });

  it("uses the future line's routed access when forming a co-located hub", () => {
    const metro13 = line("line:metro:13", "13", "METRO");
    const future15 = line("line:gpe:15", "15", "METRO");
    const current = stationEntry([metro13], 2_200, { lon: 2.30177, lat: 48.81077 });
    const future = stationEntry([future15], 2_200, { lon: 2.302360404641419, lat: 48.811218369520546 });
    const futureProject = {
      id: "gpe:15:chatillon",
      name: "Châtillon–Montrouge",
      line: "15",
      lon: 2.302360404641419,
      lat: 48.811218369520546,
      walkingMinutes: 37,
    };
    const result = buildNeighborhoodScore(input({
      stations: [current],
      heavyCandidates: [
        {
          id: "station:chatillon-metro13",
          entry: current,
          station: current.memberStations[0]!,
          lines: [metro13],
          distanceMeters: 2_200,
          access: {
            kind: "connection",
            walkingSeconds: 300,
            totalSeconds: 720,
            scoreSeconds: 720,
            feederMode: "TRAM",
            feederLineCode: "T6",
          },
          accessByLine: {},
          projected: true,
        } satisfies NearbyHeavyTransportCandidate,
        {
          id: "station:gpe:chatillon-15",
          entry: future,
          station: future.memberStations[0]!,
          lines: [future15],
          distanceMeters: 2_200,
          access: {
            kind: "connection",
            walkingSeconds: 420,
            totalSeconds: 840,
            scoreSeconds: 840,
            feederMode: "TRAM",
            feederLineCode: "T6",
          },
          accessByLine: {},
          futureProjectsByLine: { [future15.id]: futureProject },
          projected: true,
        } satisfies NearbyHeavyTransportCandidate,
      ],
      backendVerdict: {
        schemaVersion: "1.3",
        generatedAt: "2026-09-01T00:00:00.000Z",
        warnings: [],
        sources: [],
        futureProjects: [futureProject],
        categories: [],
      },
    }));
    const hub = result.categories
      .find((category) => category.id === "transport")
      ?.positiveFacts.find((fact) => fact.kind === "transportHub");

    expect(hub?.labelValues?.futureLine).toBe("15");
    expect(hub?.labelValues?.minutes).toBe(14);
    expect(hub?.labelValues?.via).toBe("Tramway T6");
  });

  it("shows real journeys to major stations under 40 minutes and real Noctilien access", () => {
    const result = buildNeighborhoodScore(input({
      journeyBenchmarks: [{
        id: "gare-du-nord",
        label: "Gare du Nord",
        journeys: [{
          id: "journey:gare-du-nord",
          durationSeconds: 1_661,
          transferCount: 1,
          sections: [
            { type: "street_network", mode: "walking", durationSeconds: 284 },
            { type: "public_transport", mode: "tram", durationSeconds: 357, lineCode: "T6" },
            { type: "transfer", mode: "walking", durationSeconds: 220 },
            { type: "waiting", durationSeconds: 180 },
            { type: "public_transport", mode: "metro", durationSeconds: 620, lineCode: "13" },
          ],
        }],
      }],
      noctilienJourneys: [{
        id: "night",
        durationSeconds: 12 * 60,
        sections: [{ type: "public_transport", mode: "bus", durationSeconds: 12 * 60, lineCode: "N14", lineMode: "NOCTILIEN" }],
      }],
    }));
    const transport = result.categories.find((category) => category.id === "transport");

    expect(transport?.positiveFacts.map((fact) => fact.kind)).toEqual(expect.arrayContaining(["majorStationUnder40", "noctilienAtNight"]));
    const majorStationFact = transport?.positiveFacts.find((fact) => fact.kind === "majorStationUnder40");
    expect(majorStationFact?.labelValues?.destination).toBe("Gare du Nord");
    expect(majorStationFact?.labelValues?.duration).toBe(28);
    expect(majorStationFact?.labelValues?.elapsed).toBe(28);
    expect(majorStationFact?.labelValues?.walking).toBe(8);
  });

  it("combines distinct Noctilien lines when each stop is reached on foot in under 15 minutes", () => {
    const result = buildNeighborhoodScore(input({
      noctilienJourneys: [
        {
          durationSeconds: 6 * 60,
          sections: [
            { type: "street_network", mode: "walking", durationSeconds: 264 },
            { type: "public_transport", mode: "bus", durationSeconds: 60, lineCode: "N62", lineMode: "NOCTILIEN" },
          ],
        },
        {
          durationSeconds: 7 * 60,
          sections: [
            { type: "street_network", mode: "walking", durationSeconds: 360 },
            { type: "public_transport", mode: "bus", durationSeconds: 60, lineCode: "N63", lineMode: "NOCTILIEN" },
          ],
        },
        {
          durationSeconds: 16 * 60,
          sections: [
            { type: "street_network", mode: "walking", durationSeconds: 901 },
            { type: "public_transport", mode: "bus", durationSeconds: 60, lineCode: "N14", lineMode: "NOCTILIEN" },
          ],
        },
      ],
    }));
    const facts = result.categories
      .find((category) => category.id === "transport")
      ?.positiveFacts.filter((fact) => fact.kind === "noctilienAtNight");

    expect(facts).toHaveLength(1);
    expect(facts?.[0]?.labelValues).toMatchObject({ line: "N62 et N63", minutes: 6 });
  });

  it("turns a real non-bus journey under 15 minutes into a large green-space strength", () => {
    const result = buildNeighborhoodScore(input({
      greenSpaceJourneys: [{
        greenSpace: {
          id: "domaine-sceaux",
          name: "Domaine de Sceaux",
          category: "Parc",
          surfaceM2: 1_654_972,
          lon: 2.28,
          lat: 48.7645,
          distanceMeters: 2_100,
          walkingMinutes: 28,
          estimatedWalkingMinutes: 28,
        },
        journeys: [{
          id: "journey:domaine-t10",
          durationSeconds: 17 * 60,
          sections: [
            { type: "street_network", mode: "walking", durationSeconds: 120 },
            { type: "waiting", durationSeconds: 3 * 60 },
            { type: "public_transport", mode: "tram", durationSeconds: 12 * 60, lineCode: "T10", lineMode: "TRAM" },
          ],
        }],
      }],
    }));
    const nature = result.categories.find((category) => category.id === "nature-leisure");
    const fact = nature?.positiveFacts.find((candidate) => candidate.kind === "greenSpaceTransitNearby");

    expect(nature?.available).toBe(true);
    expect(fact?.labelValues?.name).toBe("Domaine de Sceaux");
    expect(fact?.labelValues?.lines).toBe("T10");
    expect(fact?.labelValues?.minutes).toBe(14);
    expect(fact?.labelValues?.area).toBe("165 ha");
  });

  it.each([
    { surfaceM2: 100_000, walkingMinutes: 9, expected: true },
    { surfaceM2: 200_000, walkingMinutes: 14, expected: true },
    { surfaceM2: 50_000, walkingMinutes: 4, expected: true },
    { surfaceM2: 30_000, walkingMinutes: 4, expected: true },
    { surfaceM2: 100_000, walkingMinutes: 10, expected: false },
    { surfaceM2: 200_000, walkingMinutes: 15, expected: false },
  ])("applies the exceptional green-space surface/access barème (%j)", ({ surfaceM2, walkingMinutes, expected }) => {
    const result = buildNeighborhoodScore(input({
      backendVerdict: greenVerdict([{
        id: `green:${surfaceM2}:${walkingMinutes}`,
        name: "Parc test",
        category: "Parc",
        surfaceM2,
        lon: 2.35,
        lat: 48.85,
        distanceMeters: 300,
        walkingMinutes,
        estimatedWalkingMinutes: walkingMinutes,
      }]),
    }));
    const nature = result.categories.find((category) => category.id === "nature-leisure");
    const fact = nature?.positiveFacts.find((candidate) => candidate.kind === "greenSpaceExceptional");

    expect(Boolean(fact)).toBe(expected);
    if (expected) expect(fact?.emphasis).toBe("exceptional");
  });

  it("adds the many-sports and tennis advantages only from real walking routes", () => {
    const sports = Array.from({ length: 7 }, (_, index) => place(
      `sport-${index}`,
      index === 0 ? "tennis" : "pitch",
      "attraction",
      400 + index,
    ));
    const walkingRoutes = Object.fromEntries(sports.map((candidate, index) => [candidate.id, {
      provider: "openrouteservice",
      distanceMeters: 500 + index,
      durationSeconds: (index === 0 ? 6 : 7) * 60,
    }]));
    const result = buildNeighborhoodScore(input({ places: sports, walkingRoutes }));
    const nature = result.categories.find((category) => category.id === "nature-leisure");

    expect(nature?.positiveFacts.some((fact) => fact.kind === "sportsFacilitiesNearby")).toBe(true);
    expect(nature?.positiveFacts.some((fact) => fact.kind === "tennisCourtNearby")).toBe(true);
    expect(nature?.positiveFacts.find((fact) => fact.kind === "sportsFacilitiesNearby")?.labelValues)
      .toMatchObject({ count: 7, threshold: 7, minutes: 7 });
  });

  it("reports a tennis court stack ordered from the closest to the farthest", () => {
    const courts = [3, 5, 8, 9].map((_, index) => place(`court-${index}`, "tennis", "attraction", 200 + index * 50));
    const minutes = [3, 5, 8, 9];
    const walkingRoutes = Object.fromEntries(courts.map((court, index) => [court.id, {
      provider: "openrouteservice",
      distanceMeters: 200 + index * 50,
      durationSeconds: minutes[index]! * 60,
    }]));
    const result = buildNeighborhoodScore(input({ places: courts, walkingRoutes }));
    const nature = result.categories.find((category) => category.id === "nature-leisure");
    const stack = nature?.positiveFacts.find((fact) => fact.kind === "tennisCourtsStack");

    expect(nature?.positiveFacts.some((fact) => fact.kind === "tennisCourtNearby")).toBe(false);
    expect(stack?.labelValues).toMatchObject({ count: 4, minutes: 3 });
    expect(stack?.places?.map((court) => court.minutes)).toEqual([3, 5, 8, 9]);
    expect(stack?.places?.map((court) => court.distanceMeters)).toEqual([200, 250, 300, 350]);
  });

  it("keeps the tennis stack within the walking spread of its nearest court", () => {
    const courts = [3, 13, 14].map((_, index) => place(`spread-${index}`, "tennis", "attraction", 200 + index * 50));
    const minutes = [3, 13, 14];
    const walkingRoutes = Object.fromEntries(courts.map((court, index) => [court.id, {
      provider: "openrouteservice",
      distanceMeters: 200 + index * 50,
      durationSeconds: minutes[index]! * 60,
    }]));
    const result = buildNeighborhoodScore(input({ places: courts, walkingRoutes }));
    const nature = result.categories.find((category) => category.id === "nature-leisure");
    const stack = nature?.positiveFacts.find((fact) => fact.kind === "tennisCourtsStack");

    expect(stack?.labelValues).toMatchObject({ count: 2, minutes: 3 });
    expect(stack?.places?.map((court) => court.minutes)).toEqual([3, 13]);
  });

  it("keeps the single tennis court advantage when no second court is reachable", () => {
    const courts = [place("single-court", "tennis", "attraction", 240)];
    const walkingRoutes = { [courts[0]!.id]: {
      provider: "openrouteservice",
      distanceMeters: 240,
      durationSeconds: 3 * 60,
    } };
    const result = buildNeighborhoodScore(input({ places: courts, walkingRoutes }));
    const nature = result.categories.find((category) => category.id === "nature-leisure");
    const single = nature?.positiveFacts.find((fact) => fact.kind === "tennisCourtNearby");

    expect(nature?.positiveFacts.some((fact) => fact.kind === "tennisCourtsStack")).toBe(false);
    expect(single?.labelValues).toMatchObject({ minutes: 3, meters: 240 });
    expect(single?.places).toBeUndefined();
  });

  it("still ignores a tennis court reached in ten minutes or more", () => {
    const courts = [place("court-ten", "tennis", "attraction", 800)];
    const walkingRoutes = { [courts[0]!.id]: {
      provider: "openrouteservice",
      distanceMeters: 800,
      durationSeconds: 10 * 60,
    } };
    const result = buildNeighborhoodScore(input({ places: courts, walkingRoutes }));
    const nature = result.categories.find((category) => category.id === "nature-leisure");

    expect(nature?.positiveFacts.some((fact) => fact.kind === "tennisCourtNearby")).toBe(false);
    expect(nature?.positiveFacts.some((fact) => fact.kind === "tennisCourtsStack")).toBe(false);
  });

  it("recognizes named sports equipment when the source kind is generic", () => {
    const names = [
      "Centre sportif municipal",
      "Équipement sportif",
      "Terrain de sport",
      "Stade Jean Longuet",
      "Les Archers du Phénix",
      "Terrain de tennis",
      "Terrain de tennis",
    ];
    const sports = names.map((name, index) => ({
      ...place(`named-sport-${index}`, "place", "attraction", 300 + index),
      name,
    }));
    const walkingRoutes = Object.fromEntries(sports.map((candidate, index) => [candidate.id, {
      provider: "openrouteservice",
      distanceMeters: 350 + index,
      durationSeconds: 5 * 60,
    }]));
    const result = buildNeighborhoodScore(input({ places: sports, walkingRoutes }));
    const nature = result.categories.find((category) => category.id === "nature-leisure");

    expect(nature?.positiveFacts.some((fact) => fact.kind === "sportsFacilitiesNearby")).toBe(true);
  });

  it("keeps local sports strengths when a later backend nature verdict adds two green-space facts", () => {
    const sports = Array.from({ length: 7 }, (_, index) => place(
      `late-sport-${index}`,
      index === 0 ? "tennis" : "pitch",
      "attraction",
      400 + index,
    ));
    const walkingRoutes = Object.fromEntries(sports.map((candidate) => [candidate.id, {
      provider: "openrouteservice",
      distanceMeters: 500,
      durationSeconds: 7 * 60,
    }]));
    const result = buildNeighborhoodScore(input({
      places: sports,
      walkingRoutes,
      backendVerdict: {
        schemaVersion: "1.3",
        generatedAt: "2026-09-01T00:00:00.000Z",
        warnings: [],
        sources: [],
        categories: [{
          id: "nature-leisure",
          status: "available",
          score: 9,
          positiveFacts: [
            {
              id: "green-a",
              category: "nature-leisure",
              polarity: "positive",
              family: "managed-green-space:a",
              priority: 14,
              label: "Parc A à 12 min",
              explanation: "Parc documenté.",
              rule: "Repère",
              proof: "direct",
              observedAt: "2026-09-01T00:00:00.000Z",
              sourceIds: [],
            },
            {
              id: "green-b",
              category: "nature-leisure",
              polarity: "positive",
              family: "managed-green-space:b",
              priority: 13,
              label: "Parc B à 12 min",
              explanation: "Parc documenté.",
              rule: "Repère",
              proof: "direct",
              observedAt: "2026-09-01T00:00:00.000Z",
              sourceIds: [],
            },
          ],
          negativeFacts: [],
          limitations: [],
        }],
      },
    }));
    const nature = result.categories.find((category) => category.id === "nature-leisure");

    expect(nature?.positiveFacts.some((fact) => fact.kind === "sportsFacilitiesNearby")).toBe(true);
    expect(nature?.positiveFacts.some((fact) => fact.kind === "tennisCourtNearby")).toBe(true);
  });

  it("keeps a tennis court stack when a later backend nature verdict adds two green-space facts", () => {
    const minutes = [3, 5];
    const courts = minutes.map((_, index) => place(`late-court-${index}`, "tennis", "attraction", 200 + index * 40));
    const walkingRoutes = Object.fromEntries(courts.map((court, index) => [court.id, {
      provider: "openrouteservice",
      distanceMeters: 200 + index * 40,
      durationSeconds: minutes[index]! * 60,
    }]));
    const result = buildNeighborhoodScore(input({
      places: courts,
      walkingRoutes,
      backendVerdict: {
        schemaVersion: "1.3",
        generatedAt: "2026-09-01T00:00:00.000Z",
        warnings: [],
        sources: [],
        categories: [{
          id: "nature-leisure",
          status: "available",
          score: 9,
          positiveFacts: ["a", "b"].map((suffix, index) => ({
            id: `green-${suffix}`,
            category: "nature-leisure" as const,
            polarity: "positive" as const,
            family: `managed-green-space:${suffix}`,
            priority: 14 - index,
            label: `Parc ${suffix.toUpperCase()} à 12 min`,
            explanation: "Parc documenté.",
            rule: "Repère",
            proof: "direct" as const,
            observedAt: "2026-09-01T00:00:00.000Z",
            sourceIds: [],
          })),
          negativeFacts: [],
          limitations: [],
        }],
      },
    }));
    const nature = result.categories.find((category) => category.id === "nature-leisure");
    const stack = nature?.positiveFacts.find((fact) => fact.kind === "tennisCourtsStack");

    expect(nature?.positiveFacts.filter((fact) => fact.kind === "external")).toHaveLength(2);
    expect(stack?.labelValues).toMatchObject({ count: 2, minutes: 3 });
    expect(stack?.places?.map((court) => court.minutes)).toEqual([3, 5]);
  });

  it("turns a nearby sports club into a named nature and leisure strength", () => {
    const result = buildNeighborhoodScore(input({
      places: [place("tennis", "tennis", "attraction", 120)],
    }));
    const nature = result.categories.find((category) => category.id === "nature-leisure");

    expect(nature?.available).toBe(true);
    expect(nature?.positiveFacts[0]?.kind).toBe("leisurePlaceNearbyApprox");
    expect(nature?.positiveFacts[0]?.labelValues?.name).toBe("tennis tennis");
  });

  it("resolves an opaque T10 feeder before a nearby bus when labeling a heavy route", () => {
    const t10 = line("line:IDFM:C02528", "C02528", "TRAM");
    const bus412 = line("line:IDFM:bus-412", "412", "BUS");
    const rerB = line("line:IDFM:C01743", "C01743", "RER");
    const localEntry = stationEntry([t10, bus412], 205);
    const access = {
      kind: "connection" as const,
      walkingSeconds: 600,
      travelSeconds: 600,
      totalSeconds: 960,
      feederLineId: t10.id,
      feederLineCode: t10.code,
      feederMode: "TRAM" as const,
      feederRideSeconds: 360,
    };
    const result = buildNeighborhoodScore(input({
      stations: [localEntry],
      heavyCandidates: [{
        id: "station:rer:croix",
        entry: localEntry,
        station: localEntry.memberStations[0]!,
        lines: [rerB],
        distanceMeters: 4_000,
        access,
        accessByLine: { [rerB.id]: access },
        accessAlternativesByLine: { [rerB.id]: [access] },
        projected: true,
      } satisfies NearbyHeavyTransportCandidate],
    }));
    const transport = result.categories.find((category) => category.id === "transport");

    expect(transport?.positiveFacts.some((fact) =>
      fact.labelValues?.line === "RER B" && fact.labelValues.via === " via Tramway T10",
    )).toBe(true);
    expect(transport?.positiveFacts.find((fact) => fact.labelValues?.line === "RER B")?.labelValues?.minutes).toBe(10);
  });

  it("compares routed transport access with seconds precision before geographic tie-breakers", () => {
    const t10 = line("line:IDFM:C02528", "C02528", "TRAM");
    const bus412 = line("line:IDFM:bus-412", "412", "BUS");
    const rerB = line("line:IDFM:C01743", "C01743", "RER");
    const localEntry = stationEntry([t10, bus412], 205);
    const t10Access = {
      kind: "connection" as const,
      walkingSeconds: 600,
      totalSeconds: 962,
      feederLineId: t10.id,
      feederLineCode: t10.code,
      feederMode: "TRAM" as const,
    };
    const busAccess = {
      kind: "connection" as const,
      walkingSeconds: 600,
      totalSeconds: 1_001,
      feederLineId: bus412.id,
      feederLineCode: bus412.code,
      feederMode: "BUS" as const,
    };
    const result = buildNeighborhoodScore(input({
      stations: [localEntry],
      heavyCandidates: [
        {
          id: "station:rer:croix",
          entry: localEntry,
          station: localEntry.memberStations[0]!,
          lines: [rerB],
          distanceMeters: 4_000,
          access: t10Access,
          accessByLine: { [rerB.id]: t10Access },
          projected: true,
        } satisfies NearbyHeavyTransportCandidate,
        {
          id: "station:rer:robinson",
          entry: localEntry,
          station: localEntry.memberStations[0]!,
          lines: [rerB],
          distanceMeters: 1_500,
          access: busAccess,
          accessByLine: { [rerB.id]: busAccess },
          projected: true,
        } satisfies NearbyHeavyTransportCandidate,
      ],
    }));
    const transport = result.categories.find((category) => category.id === "transport");

    expect(transport?.positiveFacts.some((fact) =>
      fact.labelValues?.line === "RER B" && fact.labelValues.via === " via Tramway T10",
    )).toBe(true);
  });

  it("excludes unavailable categories from the overall score", () => {
    const result = buildNeighborhoodScore(input({ placesLoaded: false, stationsLoaded: false }));

    expect(result.score).toBeUndefined();
    expect(result.availableCategoryCount).toBe(0);
    expect(result.categories.every((category) => !category.available)).toBe(true);
  });

  it("adds the 10% security category without turning missing backend data into a weak point", () => {
    const result = buildNeighborhoodScore(input({
      placesLoaded: false,
      stationsLoaded: false,
      backendVerdict: {
        schemaVersion: "1.3",
        generatedAt: "2026-09-01T00:00:00.000Z",
        warnings: [],
        sources: [],
        categories: [
          { id: "security", status: "available", score: 8, positiveFacts: [], negativeFacts: [], limitations: [] },
          { id: "living-environment", status: "unavailable", positiveFacts: [], negativeFacts: [], limitations: ["missing"] },
        ],
      },
    }));
    const security = result.categories.find((category) => category.id === "security");
    expect(security?.weight).toBe(.10);
    expect(security?.score).toBe(8);
    expect(result.score).toBe(8);
    expect(result.coverageRatio).toBe(.10);
    expect(result.negativeFacts).toEqual([]);
  });

  it("keeps backend neutral indicators visible in their category", () => {
    const result = buildNeighborhoodScore(input({
      placesLoaded: false,
      stationsLoaded: false,
      backendVerdict: {
        schemaVersion: "1.3",
        generatedAt: "2026-09-01T00:00:00.000Z",
        warnings: [],
        sources: [],
        categories: [{
          id: "security",
          status: "available",
          score: 5,
          positiveFacts: [],
          negativeFacts: [],
          neutralFacts: [{
            id: "security:burglary",
            category: "security",
            polarity: "neutral",
            family: "burglary",
            priority: 5,
            label: "Cambriolages : 4 pour mille, percentile 50",
            explanation: "Taux 4 pour mille, percentile 50, année 2025.",
            rule: "Repère",
            proof: "derived",
            observedAt: "2026-09-01T00:00:00.000Z",
            sourceIds: [],
          }],
          limitations: [],
        }],
      },
    }));
    const security = result.categories.find((category) => category.id === "security");
    expect(security?.neutralFacts[0]?.label).toContain("percentile");
    expect(result.neutralFacts).toHaveLength(1);
  });

  it("rounds display values and keeps score bands deterministic", () => {
    expect(getNeighborhoodScoreDisplay(7.49)).toBe(7);
    expect(getNeighborhoodScoreDisplay(7.5)).toBe(8);
    expect(getNeighborhoodScoreBand(9)).toBe("excellent");
    expect(getNeighborhoodScoreBand(7)).toBe("good");
    expect(getNeighborhoodScoreBand(5)).toBe("medium");
    expect(getNeighborhoodScoreBand(3)).toBe("weak");
    expect(getNeighborhoodScoreBand(2.99)).toBe("very-weak");
  });
});
