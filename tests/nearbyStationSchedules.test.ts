import { describe, expect, it } from "vitest";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";
import {
  addTopologyScheduleStopAreaRef,
  createNearbyDirectionGroupsFromTopology,
  createNearbyTooltipDirectionsFromTopology,
  matchNearbyStationToIdfmStation,
  mergeNearbyScheduleRefreshItems,
  selectNearbyScheduleCandidates,
  selectSupplementalScheduleCandidates,
  type NearbyStationScheduleItem,
} from "../src/features/nearby-stations/nearbyStationSchedules";
import type { NearbyHeavyTransportCandidate } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { NearbyStationEntry } from "../src/features/nearby-stations/nearbyStations";
import type {
  BoardDeparturesResult,
  LineRouteSequence,
  StationSearchOption,
  TransitBoardConfig,
} from "../src/types/transit";

function createLine(id: string, mode: GlobalMapLine["mode"], code = id): GlobalMapLine {
  return {
    id,
    index: 1,
    code,
    label: code,
    mode,
    color: "#5146ff",
    textColor: "#ffffff",
    aliases: [],
    stationIds: [],
    geometryIds: [],
  };
}

function createStation(
  id: string,
  name: string,
  lon: number,
  lineIds: string[],
  city = "Paris",
): GlobalMapStation {
  const lat = 48.8566;
  const world = lonLatToWorld({ lon, lat });
  return {
    id,
    index: 1,
    name,
    normalizedName: name.toLowerCase(),
    city,
    aliases: [],
    rawRefs: [id],
    lineIds,
    ownerChunkId: "fixture",
    isHub: lineIds.length > 1,
    sourceCrs: "EPSG:2154",
    sourceX: 650000,
    sourceY: 6860000,
    lon,
    lat,
    worldX: world.x,
    worldY: world.y,
    coordinateSource: "netex",
    transformVersion: "lambert93-ntf-v1",
  };
}

function createEntry(
  station: GlobalMapStation,
  lines: GlobalMapLine[],
  distanceMeters: number,
  insideRadius = true,
): NearbyStationEntry {
  return {
    id: station.id,
    station: { ...station, memberStationIds: [station.id] },
    memberStations: [station],
    lines,
    distanceMeters,
    insideRadius,
  };
}

function idfmStation(
  id: string,
  label: string,
  lon?: number,
  lat?: number,
  city = "Paris",
): StationSearchOption {
  return { id, label, city, lon, lat, monitoringRef: `monitoring:${id}` };
}

describe("nearby station schedule selection", () => {
  it("enables theoretical schedules from topology stop-area refs", () => {
    const station = idfmStation("station:clam", "Gymnase du Fort", 2.27, 48.79);
    const resolved = addTopologyScheduleStopAreaRef(station, [{
      id: "gare-de-clamart",
      label: "Gare de Clamart",
      match: { monitoringRefs: ["STIF:StopArea:SP:70505:"] },
    }]);

    expect(resolved.scheduleStopAreaRef).toBe("stop_area:IDFM:70505");
  });

  it("selects the nearest station per line plus every station within 100 m", () => {
    const metro = createLine("line:metro:6", "METRO", "6");
    const bus = createLine("line:bus:42", "BUS", "42");
    const nearest = createStation("station:nearest", "Nation", 2.35, [metro.id]);
    const close = createStation("station:close", "Nation", 2.351, [metro.id, bus.id]);
    const far = createStation("station:far", "Nation", 2.352, [metro.id]);
    const outside = createStation("station:outside", "Nation", 2.353, [bus.id]);

    const candidates = selectNearbyScheduleCandidates([
      createEntry(nearest, [metro], 80),
      createEntry(close, [metro, bus], 165),
      createEntry(far, [metro], 220),
      createEntry(outside, [bus], 120, false),
    ], ["METRO", "BUS"]);

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "station:nearest:line:metro:6",
      "station:close:line:metro:6",
      "station:close:line:bus:42",
    ]);
  });

  it("keeps separate line candidates at a shared physical station", () => {
    const metro = createLine("line:metro:1", "METRO", "1");
    const tram = createLine("line:tram:T6", "TRAM", "T6");
    const station = createStation("station:hub", "Châtelet", 2.35, [metro.id, tram.id]);
    const candidates = selectNearbyScheduleCandidates(
      [createEntry(station, [metro, tram], 120)],
      ["METRO", "TRAM"],
    );

    expect(candidates.map((candidate) => candidate.line.id)).toEqual([
      metro.id,
      tram.id,
    ]);
  });

  it("builds both SIRI directions from the precalculated topology quays", () => {
    const tram = createLine("line:IDFM:C01795", "TRAM", "T6");
    const outbound = createStation("station:FR::Quay:50111111:FR1", "Robert Wagner", 2.35, [tram.id]);
    const inbound = createStation("station:FR::Quay:50222222:FR1", "Robert Wagner", 2.3501, [tram.id]);
    const entry = createEntry(outbound, [tram], 80);
    entry.memberStations = [outbound, inbound];
    entry.station = {
      ...outbound,
      memberStationIds: [outbound.id, inbound.id],
    };
    const candidate = {
      id: `${entry.id}:${tram.id}`,
      stationId: entry.id,
      line: tram,
      entry,
      mapStation: outbound,
      distanceMeters: 80,
    };
    const currentStation = (id: string, quayId: string) => ({
      id,
      label: "Robert Wagner",
      station: { id, label: "Robert Wagner", monitoringRef: "" },
      quays: [{ id: quayId, name: "Quai" }],
    });
    const terminal = (id: string, label: string) => ({
      id,
      label,
      station: { id, label, monitoringRef: "" },
    });
    const sequences: LineRouteSequence[] = [
      {
        id: "t6-outbound",
        label: "Viroflay Rive Droite",
        direction: "Viroflay Rive Droite",
        stops: [
          currentStation("stop:robert-wagner", "FR::Quay:50111111:FR1"),
          terminal("stop:viroflay", "Viroflay Rive Droite"),
        ],
      },
      {
        id: "t6-inbound",
        label: "Châtillon - Montrouge",
        direction: "Châtillon - Montrouge",
        stops: [
          currentStation("stop:robert-wagner", "FR::Quay:50222222:FR1"),
          terminal("stop:chatillon", "Châtillon - Montrouge"),
        ],
      },
    ];

    expect(createNearbyDirectionGroupsFromTopology(candidate, sequences)).toEqual([
      expect.objectContaining({
        label: "Viroflay Rive Droite",
        match: expect.objectContaining({
          destinationIncludes: ["Viroflay Rive Droite"],
          navitiaStopPointRefs: ["FR::Quay:50111111:FR1"],
        }),
      }),
      expect.objectContaining({
        label: "Châtillon - Montrouge",
        match: expect.objectContaining({ navitiaStopPointRefs: ["FR::Quay:50222222:FR1"] }),
      }),
    ]);
  });

  it("derives tooltip orientations from the direction terminal coordinates", () => {
    const tram = createLine("line:tram:T6", "TRAM", "T6");
    const current = createStation("station:current", "Robert Wagner", 2.35, [tram.id]);
    const entry = createEntry(current, [tram], 80);
    const candidate = {
      id: `${entry.id}:${tram.id}`,
      stationId: entry.id,
      line: tram,
      entry,
      mapStation: current,
      distanceMeters: 80,
    };
    const stop = {
      id: current.id,
      label: current.name,
      station: {
        id: current.id,
        label: current.name,
        monitoringRef: "",
        lon: current.lon,
        lat: current.lat,
      },
    };
    const eastTerminal = createStation("station:east", "East terminal", 2.37, [tram.id]);
    const southTerminal = createStation("station:south", "South terminal", 2.35, [tram.id]);

    expect(createNearbyTooltipDirectionsFromTopology(candidate, [
      {
        id: "east",
        label: "East terminal",
        direction: "East terminal",
        stops: [
          stop,
          {
            id: eastTerminal.id,
            label: eastTerminal.name,
            station: {
              id: eastTerminal.id,
              label: eastTerminal.name,
              monitoringRef: "",
              lon: eastTerminal.lon,
              lat: eastTerminal.lat,
            },
          },
        ],
      },
      {
        id: "south",
        label: "South terminal",
        direction: "South terminal",
        stops: [
          stop,
          {
            id: southTerminal.id,
            label: southTerminal.name,
            station: {
              id: southTerminal.id,
              label: southTerminal.name,
              monitoringRef: "",
              lon: southTerminal.lon,
              lat: southTerminal.lat - 0.01,
            },
          },
        ],
      },
    ])).toEqual([
      { id: "east-terminal", label: "East terminal", orientation: "east" },
      { id: "south-terminal", label: "South terminal", orientation: "south" },
    ]);
  });

  it("does not expose a line member that is outside the actual radius", () => {
    const metro = createLine("line:metro:1", "METRO", "1");
    const bus = createLine("line:bus:42", "BUS", "42");
    const station = createStation("station:hub", "Châtelet", 2.35, [metro.id, bus.id]);
    const entry = createEntry(station, [metro, bus], 80);
    entry.lineDistanceMeters = { [metro.id]: 80, [bus.id]: 220 };
    entry.lineInsideRadius = { [metro.id]: true, [bus.id]: false };

    expect(selectNearbyScheduleCandidates([entry], ["METRO", "BUS"]).map((candidate) => candidate.line.id)).toEqual([
      metro.id,
    ]);
  });

  it("prefers an exact name in the same city and rejects ambiguous coordinate matches", () => {
    const metro = createLine("line:metro:1", "METRO", "1");
    const mapStation = createStation("station:map", "Les Peupliers", 2.35, [metro.id], "Paris");
    const candidate = createEntry(mapStation, [metro], 100);

    const exact = idfmStation("idfm:exact", "Les Peupliers", 2.38, 48.87, "Paris");
    const sameNameOtherCity = idfmStation("idfm:other", "Les Peupliers", 2.35, 48.8566, "Lyon");
    expect(matchNearbyStationToIdfmStation(candidate && {
      id: `${candidate.id}:${metro.id}`,
      stationId: candidate.id,
      line: metro,
      entry: candidate,
      mapStation,
      distanceMeters: candidate.distanceMeters,
    }, [sameNameOtherCity, exact])?.id).toBe(exact.id);

    const first = idfmStation("idfm:first", "Station A", 2.3503, 48.8566);
    const second = idfmStation("idfm:second", "Station B", 2.3508, 48.8566);
    const coordinateCandidate = createEntry(mapStation, [metro], 100);
    const scheduleCandidate = {
      id: `${coordinateCandidate.id}:${metro.id}`,
      stationId: coordinateCandidate.id,
      line: metro,
      entry: coordinateCandidate,
      mapStation,
      distanceMeters: coordinateCandidate.distanceMeters,
    };

    expect(matchNearbyStationToIdfmStation(scheduleCandidate, [first, second])).toBeUndefined();
  });

  it("keeps heavy access metadata when building supplemental schedule candidates", () => {
    const rer = createLine("line:rer:B", "RER", "B");
    const station = createStation("station:rer", "Croix de Berny", 2.29, [rer.id], "Antony");
    const entry = createEntry(station, [rer], 2_300, true);
    const candidate: NearbyHeavyTransportCandidate = {
      id: entry.id,
      entry,
      station,
      lines: [rer],
      distanceMeters: 2_300,
      access: { kind: "connection", walkingSeconds: 720, totalSeconds: 1_620, feederLineCode: "T10" },
      accessByLine: { [rer.id]: { kind: "connection", walkingSeconds: 720, totalSeconds: 1_620, feederLineCode: "T10" } },
      projected: true,
    };

    const [schedule] = selectSupplementalScheduleCandidates([candidate], ["RER"]);
    expect(schedule).toMatchObject({
      stationId: entry.id,
      line: rer,
      access: { kind: "connection", feederLineCode: "T10" },
    });
  });

  it("keeps a supplemental heavy station when another station on the line is closer", () => {
    const rer = createLine("line:rer:B", "RER", "B");
    const localStation = createStation("station:robinson", "Robinson", 2.29, [rer.id], "Châtenay-Malabry");
    const heavyStation = createStation("station:croix", "La Croix de Berny", 2.31, [rer.id], "Antony");
    const localEntry = createEntry(localStation, [rer], 450);
    const supplementalEntry = createEntry(heavyStation, [rer], 2_700);
    const supplemental: NearbyHeavyTransportCandidate = {
      id: supplementalEntry.id,
      entry: supplementalEntry,
      station: heavyStation,
      lines: [rer],
      distanceMeters: 2_700,
      access: { kind: "connection", walkingSeconds: 540, totalSeconds: 1_320, feederLineCode: "T10" },
      accessByLine: { [rer.id]: { kind: "connection", walkingSeconds: 540, totalSeconds: 1_320, feederLineCode: "T10" } },
      projected: true,
    };

    const candidates = selectNearbyScheduleCandidates(
      [localEntry],
      ["RER"],
      100,
      selectSupplementalScheduleCandidates([supplemental], ["RER"]),
    );

    expect(candidates.map((candidate) => candidate.stationId)).toEqual([
      localEntry.id,
      supplementalEntry.id,
    ]);
  });

  it("keeps a hydrated board mounted while the next refresh is loading", () => {
    const metro = createLine("line:metro:1", "METRO", "1");
    const station = createStation("station:hub", "Châtelet", 2.35, [metro.id]);
    const entry = createEntry(station, [metro], 120);
    const candidate = {
      id: `${entry.id}:${metro.id}`,
      stationId: entry.id,
      line: metro,
      entry,
      mapStation: station,
      distanceMeters: 120,
    };
    const board = { line: { shortName: "1" } } as unknown as TransitBoardConfig;
    const result = {
      departures: [],
      directionGroups: [{ id: "direction:one", label: "La Défense", departures: [] }],
    } as unknown as BoardDeparturesResult;

    const hydrated: NearbyStationScheduleItem = {
      ...candidate,
      state: "visible" as const,
      board,
      result,
    };
    const refreshed = mergeNearbyScheduleRefreshItems(
      [{ ...candidate, distanceMeters: 140 }],
      [hydrated],
    );

    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]).toMatchObject({
      id: candidate.id,
      distanceMeters: 140,
      state: "visible",
      board,
      result,
    });
  });
});
