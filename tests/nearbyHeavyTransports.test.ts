import { describe, expect, it } from "vitest";
import {
  chooseBestNearbyHeavyJourney,
  evaluateNearbyHeavyJourney,
  getNearbyHeavyCardinalDirection,
  getNearbyHeavyAccessPresentation,
  getNearbyWorkdayJourneyDateTime,
  getNearbyNightJourneyDateTime,
  limitNearbyHeavyProjectedStations,
  selectNearbyHeavyCandidateLines,
  NEARBY_HEAVY_DIRECT_WALK_MAX_METERS,
  NEARBY_HEAVY_FEEDER_WALK_MAX_SECONDS,
  NEARBY_HEAVY_LONG_WALK_HIDE_SECONDS,
  NEARBY_HEAVY_TOTAL_MAX_SECONDS,
  selectNearbyHeavyTargetCandidates,
  type NearbyJourney,
} from "../src/features/nearby-stations/nearbyHeavyTransports";
import { defaultNearbyHeavyTransportResolver } from "../src/features/nearby-stations/useNearbyHeavyTransports";
import type { NearbyStationEntry } from "../src/features/nearby-stations/nearbyStations";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";
import {
  buildStationCorrespondenceContext,
  queryStationCorrespondenceStations,
  STATION_CORRESPONDENCE_RADIUS_METERS,
} from "../src/features/transport-map/spatial/stationCorrespondences";

function walk(durationSeconds: number, distanceMeters: number) {
  return {
    type: "street_network",
    mode: "walking",
    durationSeconds,
    distanceMeters,
  } as const;
}

function feeder(durationSeconds: number, lineCode = "T10", lineMode: "TRAM" | "BUS" = "TRAM") {
  return {
    type: "public_transport",
    mode: lineMode === "BUS" ? "bus" : "tram",
    durationSeconds,
    lineId: `line:${lineCode}`,
    lineCode,
    lineMode,
  };
}

function heavy(durationSeconds: number, lineCode = "B", lineMode: "RER" | "METRO" = "RER") {
  return {
    type: "public_transport",
    mode: lineMode === "METRO" ? "metro" : "rer",
    durationSeconds,
    lineId: `line:${lineCode}`,
    lineCode,
    lineMode,
  };
}

function line(id: string, code: string, mode: GlobalMapLine["mode"]): GlobalMapLine {
  return { id, index: id.length, code, label: code, mode, color: "#5146ff", textColor: "#fff", aliases: [], stationIds: [], geometryIds: [] };
}

function station(id: string, name: string, lon: number, lineIds: string[], lat = 48.8): GlobalMapStation {
  const world = lonLatToWorld({ lon, lat });
  return {
    id, index: id.length, name, normalizedName: name.toLowerCase(), aliases: [], rawRefs: [id], lineIds,
    ownerChunkId: "fixture", isHub: lineIds.length > 1, sourceCrs: "EPSG:2154", sourceX: 0, sourceY: 0,
    lon, lat, worldX: world.x, worldY: world.y, coordinateSource: "netex", transformVersion: "lambert93-ntf-v1",
  };
}

function projectedCandidate(
  target: GlobalMapStation,
  targetLine: GlobalMapLine,
  distanceMeters: number,
  totalSeconds = 1_200,
) {
  const access = {
    kind: "connection" as const,
    walkingSeconds: 600,
    totalSeconds,
    feederLineCode: "T10",
  };
  const entry: NearbyStationEntry = {
    id: target.id,
    station: { ...target, memberStationIds: [target.id] },
    memberStations: [target],
    lines: [targetLine],
    distanceMeters,
    insideRadius: true,
  };
  return {
    id: target.id,
    entry,
    station: target,
    lines: [targetLine],
    distanceMeters,
    access,
    accessByLine: { [targetLine.id]: access },
    projected: true,
  };
}

describe("nearby heavy transport eligibility", () => {
  it("chooses the next weekday at 09:00 for a typical work commute", () => {
    expect(getNearbyWorkdayJourneyDateTime(new Date(2026, 8, 2, 0, 30))).toBe("20260902T090000");
    expect(getNearbyWorkdayJourneyDateTime(new Date(2026, 8, 4, 10, 0))).toBe("20260907T090000");
  });

  it("uses a distinct 03:00 probe for night transport", () => {
    expect(getNearbyNightJourneyDateTime(new Date(2026, 8, 2, 0, 30))).toBe("20260902T030000");
    expect(getNearbyNightJourneyDateTime(new Date(2026, 8, 2, 4, 0))).toBe("20260903T030000");
  });

  it("accepts a reliable T10 then RER B connection within 30 minutes", () => {
    const evaluation = evaluateNearbyHeavyJourney({
      journey: {
        durationSeconds: NEARBY_HEAVY_TOTAL_MAX_SECONDS,
        sections: [walk(300, 400), feeder(600, "T10", "TRAM"), heavy(900, "B", "RER")],
      },
      stationDistanceMeters: 4_346,
      localLineIds: new Set(["line:T10"]),
      localLineCodes: new Set(["T10"]),
    });

    expect(evaluation).toMatchObject({
      kind: "connection",
      feederLineCode: "T10",
      feederMode: "TRAM",
      feederRideSeconds: 600,
      totalSeconds: NEARBY_HEAVY_TOTAL_MAX_SECONDS,
    });
  });

  it("rejects a bus-based double connection even when it fits the time limit", () => {
    const evaluation = evaluateNearbyHeavyJourney({
      journey: {
        durationSeconds: 1_700,
        sections: [walk(300, 400), feeder(500, "194", "BUS"), heavy(900, "B", "RER")],
      },
      stationDistanceMeters: 4_346,
      localLineIds: new Set(["line:194"]),
      localLineCodes: new Set(["194"]),
    });

    expect(evaluation).toBeUndefined();
  });

  it("rejects a third transport segment after a reliable feeder and heavy line", () => {
    const evaluation = evaluateNearbyHeavyJourney({
      journey: {
        durationSeconds: 1_800,
        sections: [
          walk(300, 400),
          feeder(500, "T10", "TRAM"),
          heavy(700, "B", "RER"),
          heavy(300, "C", "RER"),
        ],
      },
      stationDistanceMeters: 4_346,
      localLineIds: new Set(["line:T10"]),
      localLineCodes: new Set(["T10"]),
    });

    expect(evaluation).toBeUndefined();
  });

  it("retains a multi-heavy-line hub outside one line's nearest-six candidates", () => {
    const rerB = line("line:rer:B", "B", "RER");
    const rerC = line("line:rer:C", "C", "RER");
    const massy = station(
      "station:massy-palaiseau",
      "Massy-Palaiseau",
      2.258767728257732,
      [rerB.id, rerC.id],
      48.72551907437077,
    );
    const closer = Array.from({ length: 6 }, (_, index) => station(
      `station:rer-b-${index}`,
      `RER B ${index}`,
      2.27 + index / 10_000,
      [rerB.id],
      48.73,
    ));
    const candidates = [
      ...closer.map((candidate, index) => ({ station: candidate, line: rerB, distanceMeters: 1_000 + index })),
      { station: massy, line: rerB, distanceMeters: 4_346 },
      { station: massy, line: rerC, distanceMeters: 4_346 },
    ];

    const selected = selectNearbyHeavyTargetCandidates(candidates, 6);

    expect(selected).toEqual(expect.arrayContaining([
      expect.objectContaining({ station: expect.objectContaining({ name: "Massy-Palaiseau" }), line: rerB }),
    ]));
  });

  it("accepts a direct walk at exactly 2 km and rejects the next metre", () => {
    const accepted = evaluateNearbyHeavyJourney({
      journey: { durationSeconds: 1_600, sections: [walk(1_600, NEARBY_HEAVY_DIRECT_WALK_MAX_METERS)] },
      stationDistanceMeters: 2_400,
    });
    const rejected = evaluateNearbyHeavyJourney({
      journey: { durationSeconds: 1_600, sections: [walk(1_600, NEARBY_HEAVY_DIRECT_WALK_MAX_METERS + 1)] },
      stationDistanceMeters: 2_400,
    });

    expect(accepted?.kind).toBe("direct");
    expect(rejected).toBeUndefined();
  });

  it("accepts a local feeder at 15 minutes and 30 minutes total", () => {
    const journey: NearbyJourney = {
      durationSeconds: NEARBY_HEAVY_TOTAL_MAX_SECONDS,
      sections: [walk(NEARBY_HEAVY_FEEDER_WALK_MAX_SECONDS, 1_100), feeder(900)],
    };
    const evaluation = evaluateNearbyHeavyJourney({
      journey,
      stationDistanceMeters: 3_800,
      localLineIds: new Set(["line:T10"]),
      localLineCodes: new Set(["T10"]),
    });

    expect(evaluation).toMatchObject({ kind: "connection", walkingSeconds: 900, totalSeconds: 1_800 });
  });

  it("accepts a bus access only when the corrected duration is at most 15 minutes", () => {
    const tooLong = evaluateNearbyHeavyJourney({
      journey: { durationSeconds: 1_440, sections: [walk(300, 250), feeder(1_140, "38", "BUS")] },
      stationDistanceMeters: 2_500,
      localLineCodes: new Set(["38"]),
    });
    const accepted = evaluateNearbyHeavyJourney({
      journey: {
        durationSeconds: 900,
        sections: [walk(300, 250), { type: "waiting", mode: "waiting", durationSeconds: 120 }, feeder(480, "38", "BUS")],
      },
      stationDistanceMeters: 2_500,
      localLineCodes: new Set(["38"]),
    });

    expect(tooLong).toBeUndefined();
    expect(accepted).toMatchObject({ scoreSeconds: 780, initialWaitSeconds: 120, feederMode: "BUS" });
  });

  it("removes only the initial wait and keeps waits between vehicles", () => {
    const evaluation = evaluateNearbyHeavyJourney({
      journey: {
        durationSeconds: 1_800,
        sections: [
          walk(300, 250),
          { type: "waiting", mode: "waiting", durationSeconds: 120 },
          feeder(480, "T10", "TRAM"),
          { type: "waiting", mode: "waiting", durationSeconds: 300 },
          heavy(600, "B", "RER"),
        ],
      },
      stationDistanceMeters: 3_000,
      localLineCodes: new Set(["T10"]),
    });

    expect(evaluation).toMatchObject({ initialWaitSeconds: 120, scoreSeconds: 1_680, movementSeconds: 1_380 });
  });

  it("does not count an explicit waiting section as an extra connection", () => {
    const evaluation = evaluateNearbyHeavyJourney({
      journey: {
        durationSeconds: 1_800,
        sections: [
          walk(600, 700),
          { type: "waiting", mode: "waiting", durationSeconds: 120 },
          feeder(1_080, "T10"),
        ],
      },
      stationDistanceMeters: 3_000,
      localLineCodes: new Set(["T10"]),
    });

    expect(evaluation).toMatchObject({
      kind: "connection",
      feederRideSeconds: 1_080,
      totalSeconds: 1_800,
      travelSeconds: 1_680,
    });
  });

  it("rejects a feeder one second over either threshold", () => {
    const tooMuchWalking = evaluateNearbyHeavyJourney({
      journey: { durationSeconds: 1_800, sections: [walk(901, 1_100), feeder(899)] },
      stationDistanceMeters: 3_800,
      localLineCodes: new Set(["T10"]),
    });
    const tooLong = evaluateNearbyHeavyJourney({
      journey: { durationSeconds: 1_801, sections: [walk(900, 1_100), feeder(901)] },
      stationDistanceMeters: 3_800,
      localLineCodes: new Set(["T10"]),
    });

    expect(tooMuchWalking).toBeUndefined();
    expect(tooLong).toBeUndefined();
  });

  it("rejects an additional transfer and keeps the best valid option", () => {
    const journeys: NearbyJourney[] = [
      {
        durationSeconds: 1_500,
        sections: [walk(600, 700), feeder(500, "T10"), feeder(400, "BUS 194")],
      },
      {
        durationSeconds: 1_700,
        sections: [walk(840, 900), feeder(860, "T10")],
      },
    ];

    const best = chooseBestNearbyHeavyJourney(journeys, {
      stationDistanceMeters: 3_000,
      localLineCodes: new Set(["T10"]),
    });

    expect(best).toMatchObject({ kind: "connection", totalSeconds: 1_700, feederLineCode: "T10" });
  });

  it("rejects a transit section that is not one of the nearby feeder lines", () => {
    const evaluation = evaluateNearbyHeavyJourney({
      journey: { durationSeconds: 1_200, sections: [walk(600, 700), feeder(600, "BUS 194")] },
      stationDistanceMeters: 3_000,
      localLineCodes: new Set(["T10"]),
    });

    expect(evaluation).toBeUndefined();
  });

  it("prefers a short feeder ride over a projected long walk", () => {
    const access = {
      kind: "connection" as const,
      walkingSeconds: NEARBY_HEAVY_LONG_WALK_HIDE_SECONDS + 1,
      totalWalkingSeconds: NEARBY_HEAVY_LONG_WALK_HIDE_SECONDS + 1,
      totalSeconds: 1_800,
      feederMode: "BUS" as const,
      feederRideSeconds: NEARBY_HEAVY_LONG_WALK_HIDE_SECONDS - 1,
    };

    expect(getNearbyHeavyAccessPresentation(access, true)).toEqual({
      kind: "feeder",
      minutes: 20,
      mode: "BUS",
    });
    expect(getNearbyHeavyAccessPresentation({ ...access, feederRideSeconds: 1_200 }, true)).toBeUndefined();
    expect(getNearbyHeavyAccessPresentation(access, false)).toEqual({
      kind: "feeder",
      minutes: 30,
      mode: "BUS",
    });
  });

  it("keeps one projected station per line and cardinal sector", () => {
    const metro13 = line("line:metro:13", "13", "METRO");
    const metro13Variant = line("line:metro:13:variant", "13", "METRO");
    const rerB = line("line:rer:B", "B", "RER");
    const origin = { lon: 2.3, lat: 48.8 };
    const chatillon = station("station:chatillon", "Châtillon Montrouge", 2.30177, [metro13.id], 48.81077);
    const malakoff = station("station:malakoff", "Malakoff-Rue Etienne Dolet", 2.29703, [metro13Variant.id], 48.81529);
    const robinson = station("station:robinson", "Robinson", 2.3, [rerB.id], 48.81);
    const croix = station("station:croix", "La Croix de Berny", 2.33, [rerB.id]);

    expect(getNearbyHeavyCardinalDirection(origin, chatillon)).toBe("N");
    expect(getNearbyHeavyCardinalDirection(origin, robinson)).toBe("N");
    expect(getNearbyHeavyCardinalDirection(origin, croix)).toBe("E");

    const selected = limitNearbyHeavyProjectedStations([
      projectedCandidate(malakoff, metro13Variant, 3_000, 900),
      projectedCandidate(chatillon, metro13, 2_200, 1_200),
      projectedCandidate(robinson, rerB, 2_600),
      projectedCandidate(croix, rerB, 2_700),
    ], origin);

    expect(selected.map((candidate) => candidate.station.name)).toEqual([
      "Malakoff-Rue Etienne Dolet",
      "Robinson",
      "La Croix de Berny",
    ]);
  });

  it("keeps the fastest projected station when two stations of one heavy line share a sector", () => {
    const rerB = line("line:rer:B", "B", "RER");
    const origin = { lon: 2.3, lat: 48.8 };
    const antony = station("station:antony", "Antony", 2.325, [rerB.id]);
    const croix = station("station:croix", "Croix de Berny", 2.335, [rerB.id]);

    expect(getNearbyHeavyCardinalDirection(origin, antony)).toBe("E");
    expect(getNearbyHeavyCardinalDirection(origin, croix)).toBe("E");

    const selected = limitNearbyHeavyProjectedStations([
      projectedCandidate(antony, rerB, 2_400, 1_200),
      projectedCandidate(croix, rerB, 3_400, 600),
    ], origin);

    expect(selected.map((candidate) => candidate.station.name)).toEqual(["Croix de Berny"]);
  });

  it("selects unique heavy lines from a hub without including local feeders", () => {
    const rerB = line("line:rer:B", "B", "RER");
    const rerA = line("line:rer:A", "A", "RER");
    const transilienJ = line("line:transilien:J", "J", "TRANSILIEN");
    const bus = line("line:bus:194", "194", "BUS");
    const tram = line("line:tram:T10", "T10", "TRAM");

    expect(selectNearbyHeavyCandidateLines({
      lines: [rerB, bus, rerA, transilienJ, rerB, tram],
    }).map((candidateLine) => candidateLine.code)).toEqual(["A", "B", "J"]);
  });

  it("resolves the reference T10 to RER B and Cormeilles to Transilien J fixtures", async () => {
    const t10 = line("line:t10", "T10", "TRAM");
    const rerB = line("line:rer:B", "B", "RER");
    const transilienJ = line("line:transilien:J", "J", "TRANSILIEN");
    const feederStation = station("station:t10", "T10", 2.3005, [t10.id]);
    const rerStation = station("station:rer", "Croix de Berny", 2.31, [rerB.id]);
    const jStation = station("station:j", "Cormeilles-en-Parisis", 2.32, [transilienJ.id]);
    const network: TransportMapNetwork = {
      lines: [t10, rerB, transilienJ],
      stations: [feederStation, rerStation, jStation],
      entrances: [],
      regionalPaths: [],
      pathsById: new Map(),
      linesById: new Map([[t10.id, t10], [rerB.id, rerB], [transilienJ.id, transilienJ]]),
      stationsById: new Map([[feederStation.id, feederStation], [rerStation.id, rerStation], [jStation.id, jStation]]),
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    };
    const localEntry: NearbyStationEntry = {
      id: feederStation.id,
      station: { ...feederStation, memberStationIds: [feederStation.id] },
      memberStations: [feederStation],
      lines: [t10],
      distanceMeters: 100,
      insideRadius: true,
    };
    const candidates = await defaultNearbyHeavyTransportResolver.resolve({
      origin: { lon: 2.3, lat: 48.8 },
      network,
      localEntries: [localEntry],
      activeModes: ["RER", "TRANSILIEN", "TRAM"],
      radiusMeters: 600,
      journeyProvider: {
        async findJourneys(request) {
          if (request.destination.lon === rerStation.lon) {
            return [{ durationSeconds: 1_800, sections: [walk(600, 700), feeder(1_200, "T10")] }];
          }
          return [{ durationSeconds: 1_500, sections: [walk(1_500, 1_900)] }];
        },
      },
    });

    expect(candidates.map((candidate) => candidate.lines[0]?.code)).toEqual(["B", "J"]);
    expect(candidates.find((candidate) => candidate.lines[0]?.code === "B")?.access.kind).toBe("connection");
    expect(candidates.find((candidate) => candidate.lines[0]?.code === "B")?.projected).toBe(true);
    expect(candidates.find((candidate) => candidate.lines[0]?.code === "J")?.access.kind).toBe("direct");
  });

  it("resolves a future heavy station through the same tram and walking probes", async () => {
    const t6 = line("line:tram:T6", "T6", "TRAM");
    const localStation = station("station:t6", "T6 Châtillon", 2.3019, [t6.id], 48.8109);
    const network: TransportMapNetwork = {
      lines: [t6],
      stations: [localStation],
      entrances: [],
      regionalPaths: [],
      pathsById: new Map(),
      linesById: new Map([[t6.id, t6]]),
      stationsById: new Map([[localStation.id, localStation]]),
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    };
    const localEntry: NearbyStationEntry = {
      id: localStation.id,
      station: { ...localStation, memberStationIds: [localStation.id] },
      memberStations: [localStation],
      lines: [t6],
      distanceMeters: 100,
      insideRadius: true,
    };
    const futureProject = {
      id: "gpe-GA20",
      name: "Châtillon - Montrouge",
      line: "15",
      lon: 2.302360404641419,
      lat: 48.811218369520546,
      walkingMinutes: 37,
    };
    const requests: Array<{ id: string | undefined; lon: number; lat: number; datetime?: string }> = [];
    const candidates = await defaultNearbyHeavyTransportResolver.resolve({
      origin: { lon: 2.278538, lat: 48.798422 },
      network,
      localEntries: [localEntry],
      activeModes: ["METRO", "TRAM"],
      radiusMeters: 600,
      journeyDateTime: "20260907T090000",
      futureProjects: [futureProject],
      journeyProvider: {
        async findJourneys(request) {
          requests.push({
            id: request.destination.id,
            lon: request.destination.lon,
            lat: request.destination.lat,
            datetime: request.datetime,
          });
          return [{
            durationSeconds: 840,
            sections: [walk(240, 320), feeder(600, "T6", "TRAM")],
          }];
        },
      },
      walkingRouteProvider: async () => ({
        durationSeconds: 1_200,
        distanceMeters: 1_500,
        provider: "openrouteservice",
      }),
    });

    const candidate = candidates.find((item) => item.lines.some((itemLine) => itemLine.code === "15"));
    expect(candidate?.projected).toBe(true);
    expect(candidate?.access).toMatchObject({
      kind: "connection",
      scoreSeconds: 840,
      feederMode: "TRAM",
      feederLineCode: "T6",
    });
    expect(candidate?.futureProjectsByLine?.[candidate.lines[0]?.id ?? ""]?.id).toBe("gpe-GA20");
    expect(requests[0]).toMatchObject({
      id: "station:gpe:gpe-ga20",
      lon: futureProject.lon,
      lat: futureProject.lat,
      datetime: "20260907T090000",
    });
  });

  it("probes a daytime feeder when the current answer is a nocturnal line", async () => {
    const t10 = line("line:t10", "T10", "TRAM");
    const n62 = line("line:n62", "N62", "NOCTILIEN");
    const rerB = line("line:rer:B", "B", "RER");
    const localT10 = station("station:t10", "Les Peintres", 2.3005, [t10.id]);
    const localN62 = station("station:n62", "Les Peintres", 2.3006, [n62.id]);
    const rerStation = station("station:rer", "Croix de Berny", 2.31, [rerB.id]);
    const network: TransportMapNetwork = {
      lines: [t10, n62, rerB],
      stations: [localT10, localN62, rerStation],
      entrances: [],
      regionalPaths: [],
      pathsById: new Map(),
      linesById: new Map([[t10.id, t10], [n62.id, n62], [rerB.id, rerB]]),
      stationsById: new Map([[localT10.id, localT10], [localN62.id, localN62], [rerStation.id, rerStation]]),
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    };
    const localEntry: NearbyStationEntry = {
      id: localT10.id,
      station: { ...localT10, memberStationIds: [localT10.id] },
      memberStations: [localT10],
      lines: [t10, n62],
      distanceMeters: 140,
      insideRadius: true,
    };
    const requests: Array<{ datetime?: string }> = [];
    const candidates = await defaultNearbyHeavyTransportResolver.resolve({
      origin: { lon: 2.3, lat: 48.8 },
      network,
      localEntries: [localEntry],
      activeModes: ["RER", "TRAM", "NOCTILIEN"],
      radiusMeters: 600,
      journeyProvider: {
        async findJourneys(request) {
          requests.push({ datetime: request.datetime });
          return request.datetime
            ? [{ durationSeconds: 1_700, sections: [walk(600, 700), feeder(1_100, "T10")] }]
            : [{ durationSeconds: 1_500, sections: [walk(600, 700), feeder(900, "N62")] }];
        },
      },
    });

    expect(candidates[0]?.access.feederLineCode).toBe("T10");
    expect(requests.some((request) => Boolean(request.datetime))).toBe(true);
  });

  it("uses an explicit commute datetime instead of issuing a live-time probe", async () => {
    const rerB = line("line:rer:B", "B", "RER");
    const target = station("station:rer", "La Croix de Berny", 2.31, [rerB.id]);
    const network: TransportMapNetwork = {
      lines: [rerB],
      stations: [target],
      entrances: [],
      regionalPaths: [],
      pathsById: new Map(),
      linesById: new Map([[rerB.id, rerB]]),
      stationsById: new Map([[target.id, target]]),
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    };
    const requests: Array<{ datetime?: string }> = [];
    await defaultNearbyHeavyTransportResolver.resolve({
      origin: { lon: 2.3, lat: 48.8 },
      network,
      localEntries: [],
      activeModes: ["RER"],
      radiusMeters: 600,
      journeyDateTime: "20260902T090000",
      journeyProvider: {
        async findJourneys(request) {
          requests.push({ datetime: request.datetime });
          return [{ durationSeconds: 900, sections: [walk(900, 1_200)] }];
        },
      },
    });

    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((request) => request.datetime === "20260902T090000")).toBe(true);
  });

  it("prefers a confirmed walk under ten minutes over a bus access", async () => {
    const bus = line("line:bus:38", "38", "BUS");
    const rer = line("line:rer:B", "B", "RER");
    const busStop = station("station:bus:38", "Arrêt 38", 2.3001, [bus.id]);
    const target = station("station:rer:b", "RER B", 2.304, [rer.id]);
    const network: TransportMapNetwork = {
      lines: [bus, rer],
      stations: [busStop, target],
      entrances: [],
      regionalPaths: [],
      pathsById: new Map(),
      linesById: new Map([[bus.id, bus], [rer.id, rer]]),
      stationsById: new Map([[busStop.id, busStop], [target.id, target]]),
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    };
    const candidates = await defaultNearbyHeavyTransportResolver.resolve({
      origin: { lon: 2.3, lat: 48.8 },
      network,
      localEntries: [
        {
          id: busStop.id,
          station: { ...busStop, memberStationIds: [busStop.id] },
          memberStations: [busStop],
          lines: [bus],
          distanceMeters: 100,
          insideRadius: true,
        },
        {
          id: target.id,
          station: { ...target, memberStationIds: [target.id] },
          memberStations: [target],
          lines: [rer],
          distanceMeters: 300,
          insideRadius: true,
        },
      ],
      activeModes: ["RER", "BUS"],
      radiusMeters: 600,
      includeLocalCandidates: true,
      journeyProvider: {
        async findJourneys() {
          return [{ durationSeconds: 900, sections: [walk(300, 250), feeder(600, "38", "BUS")] }];
        },
      },
      walkingRouteProvider: async () => ({
        durationSeconds: 360,
        distanceMeters: 480,
        provider: "openrouteservice",
      }),
    });
    const candidate = candidates.find((item) => item.lines.some((candidateLine) => candidateLine.id === rer.id));

    expect(candidate?.access).toMatchObject({ kind: "direct", scoreSeconds: 360, walkingSeconds: 360 });
  });

  it("keeps the daytime T10 and rejects a current bus 412 over the 15-minute access limit", async () => {
    const t10 = line("line:tram:T10", "T10", "TRAM");
    const bus412 = line("line:bus:412", "412", "BUS");
    const rerB = line("line:rer:B", "B", "RER");
    const t10Station = station("station:t10", "Les Peintres", 2.3005, [t10.id]);
    const busStation = station("station:412", "Croix de Berny", 2.3006, [bus412.id]);
    const rerStation = station("station:rer:croix", "La Croix de Berny", 2.31, [rerB.id]);
    const network: TransportMapNetwork = {
      lines: [t10, bus412, rerB],
      stations: [t10Station, busStation, rerStation],
      entrances: [],
      regionalPaths: [],
      pathsById: new Map(),
      linesById: new Map([[t10.id, t10], [bus412.id, bus412], [rerB.id, rerB]]),
      stationsById: new Map([[t10Station.id, t10Station], [busStation.id, busStation], [rerStation.id, rerStation]]),
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    };
    const entryFor = (mapStation: GlobalMapStation, mapLine: GlobalMapLine): NearbyStationEntry => ({
      id: mapStation.id,
      station: { ...mapStation, memberStationIds: [mapStation.id] },
      memberStations: [mapStation],
      lines: [mapLine],
      distanceMeters: 140,
      insideRadius: true,
    });

    const candidates = await defaultNearbyHeavyTransportResolver.resolve({
      origin: { lon: 2.3, lat: 48.8 },
      network,
      localEntries: [entryFor(t10Station, t10), entryFor(busStation, bus412)],
      activeModes: ["RER", "TRAM", "BUS"],
      radiusMeters: 600,
      journeyProvider: {
        async findJourneys(request) {
          return request.datetime
            ? [{ durationSeconds: 900, sections: [walk(300, 250), feeder(600, "T10", "TRAM")] }]
            : [{ durationSeconds: 1_200, sections: [walk(300, 250), feeder(900, "412", "BUS")] }];
        },
      },
    });

    const candidate = candidates.find((item) => item.lines.some((itemLine) => itemLine.id === rerB.id));
    expect(candidate?.access.feederLineCode).toBe("T10");
    expect(candidate?.accessAlternatives?.map((access) => access.feederLineCode)).toEqual(["T10"]);
    expect(candidate?.accessAlternativesByLine?.[rerB.id]?.map((access) => access.feederLineCode)).toEqual(["T10"]);
  });

  it("uses the shared 350 m station correspondence radius for a projected Transilien target", async () => {
    const transilienJ = line("line:transilien:J", "J", "TRANSILIEN");
    const bus3005 = line("line:bus:30-05", "30-05", "BUS");
    const bus3032 = line("line:bus:30-32", "30-32", "BUS");
    const bus3012 = line("line:bus:30-12", "30-12", "BUS");
    const target = station("station:j:cormeilles", "Gare de Cormeilles-en-Parisis", 2.32, [transilienJ.id]);
    const nearbyBusStop = station("station:bus:30-05", "Gare de Cormeilles en Parisis", 2.3215, [bus3005.id]);
    const nearbyBusStop2 = station("station:bus:30-32", "Joffre - Gare", 2.322, [bus3032.id]);
    const outsideBusStop = station("station:bus:30-12", "Arrêt trop éloigné", 2.3252, [bus3012.id]);
    const network: TransportMapNetwork = {
      lines: [transilienJ, bus3005, bus3032, bus3012],
      stations: [target, nearbyBusStop, nearbyBusStop2, outsideBusStop],
      entrances: [],
      regionalPaths: [],
      pathsById: new Map(),
      linesById: new Map([
        [transilienJ.id, transilienJ],
        [bus3005.id, bus3005],
        [bus3032.id, bus3032],
        [bus3012.id, bus3012],
      ]),
      stationsById: new Map([
        [target.id, target],
        [nearbyBusStop.id, nearbyBusStop],
        [nearbyBusStop2.id, nearbyBusStop2],
        [outsideBusStop.id, outsideBusStop],
      ]),
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    };

    const correspondenceStations = queryStationCorrespondenceStations(network, target);
    expect(correspondenceStations.map((result) => result.station.id)).toContain(nearbyBusStop.id);
    expect(correspondenceStations.map((result) => result.station.id)).not.toContain(outsideBusStop.id);
    const correspondence = buildStationCorrespondenceContext(
      [target],
      correspondenceStations,
      network.linesById,
      { allowedModes: ["BUS"] },
    );
    expect(correspondence.lines.map((candidate) => candidate.code)).toEqual(["30-05", "30-32"]);
    expect(STATION_CORRESPONDENCE_RADIUS_METERS).toBe(350);

    const candidates = await defaultNearbyHeavyTransportResolver.resolve({
      origin: { lon: 2.3, lat: 48.8 },
      network,
      localEntries: [],
      activeModes: ["TRANSILIEN", "BUS"],
      radiusMeters: 600,
      journeyProvider: {
        async findJourneys() {
          return [{ durationSeconds: 900, sections: [walk(300, 240), feeder(600, "30-05", "BUS")] }];
        },
      },
    });

    const candidate = candidates.find((item) => item.lines.some((candidateLine) => candidateLine.id === transilienJ.id));
    expect(candidate?.projected).toBe(true);
    expect(candidate?.access.feederLineCode).toBe("30-05");
    expect(candidate?.correspondenceLines?.map((candidateLine) => candidateLine.code)).toEqual(["30-05", "30-32"]);

    const busDisabledCandidates = await defaultNearbyHeavyTransportResolver.resolve({
      origin: { lon: 2.3, lat: 48.8 },
      network,
      localEntries: [],
      activeModes: ["TRANSILIEN"],
      radiusMeters: 600,
      journeyProvider: {
        async findJourneys() {
          return [{ durationSeconds: 1_200, sections: [walk(300, 240), feeder(900, "30-05", "BUS")] }];
        },
      },
    });
    expect(busDisabledCandidates).toEqual([]);
  });
});
