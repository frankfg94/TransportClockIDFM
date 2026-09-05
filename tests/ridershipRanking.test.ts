import { describe, expect, it } from "vitest";
import { presentRidershipRanking } from "../src/services/ridershipRanking";
import { rankLine, rankStationCollections } from "../server/services/ridership/ridershipRanking";
import type { AnnualRidershipLineDocument, AnnualRidershipValue } from "../src/types/ridership";

describe("ridership rankings", () => {
  it("ranks lines within the same mode and compatible metric", () => {
    const metroA = createLine("metro-a", "METRO", 100);
    const metroB = createLine("metro-b", "METRO", 200);
    const metroC = createLine("metro-c", "METRO", 200);
    const otherMode = createLine("rer-a", "RER", 900);
    const otherYear = createLine("metro-old", "METRO", 900, { year: 2023 });
    const incompatibleMetric = createLine("metro-boardings", "METRO", 900, { metric: "annual_line_boardings" });
    const unavailable = createLine("metro-unavailable", "METRO", null);
    const lines = [metroA, metroB, metroC, otherMode, otherYear, incompatibleMetric, unavailable];

    expect(rankLine(metroA, lines)).toMatchObject({ rank: 4, total: 4, scope: "mode", mode: "METRO" });
    expect(rankLine(metroB, lines)).toMatchObject({ rank: 2, total: 4 });
    expect(rankLine(metroC, lines)).toMatchObject({ rank: 2, total: 4 });
    expect(rankLine(otherMode, lines)).toMatchObject({ rank: 1, total: 1, mode: "RER" });
    expect(rankLine(unavailable, lines)).toBeUndefined();
  });

  it("ranks stations by network, mode and line without summing conflicting identities", () => {
    const metro = createLine("metro-a", "METRO", 100, {}, [
      createStation("station-a", 100),
      createStation("station-b", 200),
    ]);
    const metroPeer = createLine("metro-b", "METRO", 200, {}, [
      createStation("station-a", 100),
      createStation("station-c", 50),
    ]);
    const rer = createLine("rer-a", "RER", 300, {}, [
      createStation("station-d", 300),
    ]);

    const rankings = rankStationCollections("station-a", metro, [metro, metroPeer, rer]);

    expect(rankings.network).toMatchObject({ rank: 3, total: 4 });
    expect(rankings.mode).toMatchObject({ rank: 2, total: 3, mode: "METRO" });
    expect(rankings.line).toMatchObject({ rank: 2, total: 2, lineId: "metro-a" });

    const conflicting = createLine("metro-conflict", "METRO", 150, {}, [createStation("station-a", 999)]);
    const conflictRankings = rankStationCollections("station-a", metro, [metro, conflicting]);
    expect(conflictRankings.network).toMatchObject({ rank: 2, total: 2 });
  });

  it("keeps the network ranking available from the active line when the canonical station is ambiguous", () => {
    const transilien = createLine("line-l", "TRANSILIEN", 100, {}, [
      createStation("station-defense", 120, {
        metric: "annual_station_boardings",
        unit: "boardings",
        year: 2025,
      }),
    ]);
    const metro = createLine("metro-a", "METRO", 200, {}, [
      createStation("station-defense", 900, {
        metric: "annual_station_boardings",
        unit: "boardings",
        year: 2025,
      }),
      createStation("station-peer", 50, {
        metric: "annual_station_boardings",
        unit: "boardings",
        year: 2025,
      }),
    ]);

    const rankings = rankStationCollections("station-defense", transilien, [transilien, metro]);

    expect(rankings.network).toMatchObject({ rank: 1, total: 2, year: 2025, metric: "annual_station_boardings", unit: "boardings" });
  });

  it("ranks IDFM rail entry validations across every rail station once and within the active line without creating a line total", () => {
    const rerB = createLine("rer-b", "RER", 0, {}, [
      createStation("station-gare-du-nord", 900_000, {
        year: 2024,
        qualifier: { stationIdentity: "zdc:71410" },
        sourceIds: ["idfm-rail-validations"],
      }),
      createStation("station-aulnay", 300_000, {
        year: 2024,
        qualifier: { stationIdentity: "zdc:71300" },
        sourceIds: ["idfm-rail-validations"],
      }),
      // Directional aliases of one physical control zone must not inflate the
      // RER B cohort either.
      createStation("station-gare-du-nord-other-quay", 900_000, {
        year: 2024,
        qualifier: { stationIdentity: "zdc:71410" },
        sourceIds: ["idfm-rail-validations"],
      }),
    ]);
    const metro = createLine("metro-12", "METRO", 0, {}, [
      // Same physical control zone as on another line: it must not be counted twice.
      createStation("station-gare-du-nord-alias", 900_000, {
        year: 2024,
        qualifier: { stationIdentity: "zdc:71410" },
        sourceIds: ["idfm-rail-validations"],
      }),
      createStation("station-montparnasse", 500_000, {
        year: 2024,
        qualifier: { stationIdentity: "zdc:71275" },
        sourceIds: ["idfm-rail-validations"],
      }),
    ]);
    const staleRATP = createLine("metro-1", "METRO", 0, {}, [
      createStation("station-ratp-only", 1_500_000, {
        year: 2021,
        qualifier: { network: "METRO" },
        sourceIds: ["ratp-annual-station-entries"],
      }),
    ]);

    const rankings = rankStationCollections("station-aulnay", rerB, [rerB, metro, staleRATP]);

    expect(rankings.network).toMatchObject({ rank: 3, total: 3, year: 2024 });
    expect(rankings.mode).toBeUndefined();
    expect(rankings.line).toMatchObject({ rank: 2, total: 2, year: 2024, lineId: "rer-b" });
    expect(rerB.primary.value).toBe(0);
    expect(rerB.primary.metric).toBe("annual_line_ridership");
  });

  it("keeps derived values rankable and excludes unavailable values", () => {
    const derived = createLine("metro-derived", "METRO", 50, { status: "derived" });
    const unavailable = createLine("metro-unavailable", "METRO", null);
    const higher = createLine("metro-higher", "METRO", 100);

    expect(rankLine(derived, [derived, unavailable, higher])).toMatchObject({ rank: 2, total: 2 });
  });

  it("compares available lines of one mode even when source years differ", () => {
    const rerA = createLine("rer-a", "RER", 100, { year: 2022, metric: "annual_line_boardings", unit: "boardings" });
    const rerB = createLine("rer-b", "RER", 200, { year: 2023, metric: "annual_line_boardings", unit: "boardings" });
    const rerC = createLine("rer-c", "RER", 300, { year: 2024, metric: "annual_line_boardings", unit: "boardings" });

    expect(rankLine(rerA, [rerA, rerB, rerC])).toMatchObject({
      rank: 3,
      total: 3,
      year: 2022,
      metric: "annual_line_boardings",
      unit: "boardings",
    });
  });

  it("uses the exact top-25-percent threshold and presents percentile values", () => {
    const ranking = {
      scope: "mode" as const,
      rank: 2,
      total: 8,
      year: 2024,
      metric: "annual_line_ridership" as const,
      unit: "journeys" as const,
    };

    expect(presentRidershipRanking(ranking)).toMatchObject({
      rank: 2,
      total: 8,
      topPercent: 25,
      percentile: expect.closeTo(85.7, 1),
      level: "very-high",
    });
    expect(presentRidershipRanking({ ...ranking, rank: 3 })?.level).toBe("high");
    expect(presentRidershipRanking(undefined)).toBeUndefined();
  });
});

function createLine(
  id: string,
  mode: AnnualRidershipLineDocument["mode"],
  value: number | null,
  overrides: Partial<AnnualRidershipValue> = {},
  stations: AnnualRidershipLineDocument["stations"] = [],
): AnnualRidershipLineDocument {
  return {
    id,
    code: id,
    label: id,
    mode,
    generatedAt: "2024-01-01T00:00:00.000Z",
    requestedYear: 2024,
    primary: {
      value,
      unit: "journeys",
      metric: "annual_line_ridership",
      year: 2024,
      status: "official",
      sourceIds: [],
      sourceRecordIds: [],
      ...overrides,
    },
    measures: [],
    stations,
  };
}

function createStation(
  id: string,
  value: number,
  overrides: Partial<AnnualRidershipValue> = {},
): AnnualRidershipLineDocument["stations"][number] {
  return {
    id,
    name: id,
    lineIds: [],
    measures: [],
    primary: {
      value,
      unit: "entries",
      metric: "annual_station_entries",
      year: 2024,
      status: "official",
      sourceIds: [],
      sourceRecordIds: [],
      ...overrides,
    },
  };
}
