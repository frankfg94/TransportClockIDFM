import { describe, expect, it } from "vitest";
import {
  selectMaximalStopSequencePatterns,
  selectRepresentativeStopSequencePatterns,
} from "../src/features/line-map/topologyPatterns";
import { convertServerTopologyToLineRouteSequences } from "../src/services/idfm";

describe("selectMaximalStopSequencePatterns", () => {
  it("accepts topology payloads that omit patterns", () => {
    expect(selectMaximalStopSequencePatterns()).toEqual([]);
  });

  it("keeps route variants while removing duplicates and contained reverse paths", () => {
    const selected = selectMaximalStopSequencePatterns([
      { id: "main", stops: ["A", "B", "C", "D"] },
      { id: "duplicate", stops: ["A", "B", "C", "D"] },
      { id: "reverse-subpath", stops: ["C", "B"] },
      { id: "branch", stops: ["A", "B", "E"] },
      { id: "short-branch", stops: ["B", "E"] },
    ]);

    expect(selected.map((pattern) => pattern.id)).toEqual(["main", "branch"]);
  });

  it("lets the detailed map request complete patterns without changing the graph default", () => {
    const topology = {
      stations: [
        { id: "A", name: "Alpha" },
        { id: "B", name: "Beta" },
        { id: "C", name: "Gamma" },
      ],
      segments: [
        { id: "A--B", from: "A", to: "B" },
        { id: "B--C", from: "B", to: "C" },
      ],
      patterns: [
        {
          id: "main",
          terminalFrom: "Alpha",
          terminalTo: "Gamma",
          stops: ["A", "B", "C"],
        },
        {
          id: "contained",
          terminalFrom: "Beta",
          terminalTo: "Gamma",
          stops: ["B", "C"],
        },
      ],
    };

    expect(convertServerTopologyToLineRouteSequences(topology)).toHaveLength(2);
    expect(convertServerTopologyToLineRouteSequences(topology, true)).toMatchObject([
      {
        id: "main",
        stops: [{ id: "A" }, { id: "B" }, { id: "C" }],
      },
    ]);
  });
});

describe("selectRepresentativeStopSequencePatterns", () => {
  it("removes an extreme NeTEx trip-count outlier before selecting branches", () => {
    const selected = selectRepresentativeStopSequencePatterns([
      { id: "main", stops: ["A", "B", "C"], tripCount: 465 },
      { id: "return", stops: ["C", "B", "A"], tripCount: 307 },
      { id: "ghost", stops: ["X", "B", "A"], tripCount: 2 },
    ]);

    expect(selected.map((pattern) => pattern.id)).toEqual(["main"]);
  });

  it("keeps low-frequency patterns when the whole line is infrequent", () => {
    const selected = selectRepresentativeStopSequencePatterns([
      { id: "outbound", stops: ["A", "B"], tripCount: 2 },
      { id: "shuttle", stops: ["B", "C"], tripCount: 1 },
    ]);

    expect(selected.map((pattern) => pattern.id)).toEqual(["outbound", "shuttle"]);
  });
});
