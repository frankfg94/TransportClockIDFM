import { describe, expect, it } from "vitest";
import type { GtfsLineFrequencyResponse } from "../src/types/lineFrequency";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { NearbyHeavyTransportCandidate } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import type { NearbyStationEntry } from "../src/features/nearby-stations/nearbyStations";
import {
  buildNeighborhoodScore,
  getNeighborhoodScoreBand,
  getNeighborhoodScoreDisplay,
  type NeighborhoodScoreInput,
} from "../src/features/nearby-stations/neighborhoodScore";

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

describe("neighborhood score", () => {
  it("turns zero pharmacies into an explicit negative health fact", () => {
    const result = buildNeighborhoodScore(input({ places: [place("shop", "supermarket")] }));
    const health = result.categories.find((category) => category.id === "health");

    expect(health?.score).toBe(2);
    expect(health?.negativeFacts.map((fact) => fact.kind)).toContain("noPharmacy");
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
        schemaVersion: "1.1",
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
        schemaVersion: "1.1",
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
        schemaVersion: "1.1",
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
        schemaVersion: "1.1",
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
        schemaVersion: "1.1",
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
