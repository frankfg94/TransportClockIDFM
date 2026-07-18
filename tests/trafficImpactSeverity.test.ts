import { describe, expect, it } from "vitest";
import {
  calculateTrafficImpactSeverity,
  calculateTrafficImpactTemporalMultiplier,
  classifyTrafficTopology,
  getTrafficImpactSeverityLevel,
  getTrafficTransferScore,
  TRAFFIC_IMPACT_SEVERITY_MODEL,
} from "../src/features/traffic/trafficImpactSeverity";
import type { TransferLineOption } from "../src/types/transit";

function transfer(
  id: string,
  family: TransferLineOption["family"],
): TransferLineOption {
  return { id, label: id, family };
}

describe("traffic impact severity", () => {
  it("weights structural connections, ignores buses and deduplicates lines", () => {
    const rer = getTrafficTransferScore([
      transfer("rer-a", "RER"),
      transfer("rer-a", "RER"),
    ]);
    const tram = getTrafficTransferScore([transfer("tram-3", "TRAM")]);
    const bus = getTrafficTransferScore([
      transfer("bus-42", "BUS"),
      transfer("night-1", "NOCTILIEN"),
    ]);

    expect(rer).toBe(TRAFFIC_IMPACT_SEVERITY_MODEL.transferWeights.RER);
    expect(rer).toBeGreaterThan(tram);
    expect(bus).toBe(0);
  });

  it("uses the exact documented thresholds", () => {
    expect(getTrafficImpactSeverityLevel(4.99)).toBe("low");
    expect(getTrafficImpactSeverityLevel(5)).toBe("medium");
    expect(getTrafficImpactSeverityLevel(11.99)).toBe("medium");
    expect(getTrafficImpactSeverityLevel(12)).toBe("high");
  });

  it("classifies simple lines as trunk ends and trunk core", () => {
    const stations = ["a", "b", "c", "d", "e"].map((key) => ({
      key,
      label: key,
    }));
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "d" },
      { source: "d", target: "e" },
    ];

    expect(classifyTrafficTopology(stations, edges)).toEqual({
      a: "trunk-end",
      b: "trunk-end",
      c: "trunk-core",
      d: "trunk-end",
      e: "trunk-end",
    });
  });

  it("distinguishes small and major branches without station tables", () => {
    const stations = ["a", "b", "c", "d", "e", "x"].map((key) => ({
      key,
      label: key,
    }));
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "d" },
      { source: "d", target: "e" },
      { source: "c", target: "x" },
    ];
    const roles = classifyTrafficTopology(stations, edges);

    expect(roles.x).toBe("small-branch");
    expect(roles.a).toBe("major-branch");
    expect(roles.c).toBe("trunk-core");
  });

  it("treats loops without termini as trunk core", () => {
    const stations = ["a", "b", "c"].map((key) => ({ key, label: key }));
    const roles = classifyTrafficTopology(stations, [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "a" },
    ]);

    expect(new Set(Object.values(roles))).toEqual(new Set(["trunk-core"]));
  });

  it("deduplicates stations and uses edge endpoints as score fallback", () => {
    const stations = [
      {
        key: "a",
        label: "A",
        transfers: [transfer("rer-a", "RER")],
      },
      { key: "b", label: "B" },
    ];
    const edges = [{ source: "a", target: "b" }];
    const deduplicated = calculateTrafficImpactSeverity({
      affectedStationKeys: ["a", "a"],
      stations,
      edges,
    });
    const edgeOnly = calculateTrafficImpactSeverity({
      affectedStationKeys: [],
      fallbackStationKeys: ["a", "b"],
      stations,
      edges,
    });

    expect(deduplicated.affectedStationCount).toBe(1);
    expect(deduplicated.stationContributions).toHaveLength(1);
    expect(edgeOnly.affectedStationCount).toBe(2);
    expect(edgeOnly.score).toBeGreaterThan(deduplicated.score);
  });

  it("exposes the same metadata used by each contribution", () => {
    const result = calculateTrafficImpactSeverity({
      affectedStationKeys: ["center"],
      stations: [
        {
          key: "center",
          label: "Center",
          transfers: [transfer("rer-a", "RER")],
        },
      ],
      edges: [],
    });
    const contribution = result.stationContributions[0];

    expect(contribution.baseScore).toBe(
      TRAFFIC_IMPACT_SEVERITY_MODEL.baseStationScore,
    );
    expect(contribution.transferScore).toBe(
      TRAFFIC_IMPACT_SEVERITY_MODEL.transferWeights.RER,
    );
    expect(contribution.topologyMultiplier).toBe(
      TRAFFIC_IMPACT_SEVERITY_MODEL.topologyMultipliers["trunk-core"],
    );
    expect(contribution.temporalMultiplier).toBe(
      TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.unspecifiedMultiplier,
    );
    expect(contribution.unadjustedContribution).toBe(
      contribution.contribution,
    );
    expect(result.score).toBe(
      (TRAFFIC_IMPACT_SEVERITY_MODEL.baseStationScore +
        TRAFFIC_IMPACT_SEVERITY_MODEL.transferWeights.RER) *
        TRAFFIC_IMPACT_SEVERITY_MODEL.topologyMultipliers["trunk-core"],
    );
  });
  it("reduces short evening interruptions and treats missing times as full-day", () => {
    const evening = calculateTrafficImpactTemporalMultiplier([
      { startMinute: 22 * 60 + 45, endMinute: 3 * 60 },
    ]);
    const sameDurationInDaytime = calculateTrafficImpactTemporalMultiplier([
      { startMinute: 9 * 60, endMinute: 13 * 60 + 15 },
    ]);
    const fullDay = calculateTrafficImpactTemporalMultiplier([
      { startMinute: 0, endMinute: 23 * 60 + 59 },
    ]);
    const unspecified = calculateTrafficImpactTemporalMultiplier([]);

    expect(evening.coveredMinutes).toBe(255);
    expect(evening.coverageRatio).toBe(0.18);
    expect(evening.multiplier).toBe(0.09);
    expect(evening.multiplier).toBeLessThan(sameDurationInDaytime.multiplier);
    expect(fullDay).toMatchObject({ multiplier: 1, assumesFullDay: true });
    expect(unspecified).toMatchObject({ multiplier: 1, assumesFullDay: true });
  });

  it("applies the station time coefficient to the documented contribution", () => {
    const temporal = calculateTrafficImpactTemporalMultiplier([
      { startMinute: 22 * 60 + 45, endMinute: 3 * 60 },
    ]);
    const result = calculateTrafficImpactSeverity({
      affectedStationKeys: ["center"],
      stations: [
        {
          key: "center",
          label: "Center",
          transfers: [transfer("rer-a", "RER")],
        },
      ],
      edges: [],
      temporalMultipliersByStationKey: new Map([
        ["center", temporal.multiplier],
      ]),
    });
    const contribution = result.stationContributions[0];

    expect(contribution.unadjustedContribution).toBe(7);
    expect(contribution.temporalMultiplier).toBe(0.09);
    expect(contribution.contribution).toBe(0.63);
    expect(result).toMatchObject({ score: 0.63, level: "low" });
  });

});

