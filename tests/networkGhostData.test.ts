import { describe, expect, it } from "vitest";
import {
  createGeographicViewport,
  createNetworkGhostLine,
  filterNetworkGhostTransfersByModes,
  filterNetworkGhostTransfers,
  getNetworkGhostModeKey,
  isSameNetworkGhostStationName,
  projectNetworkGhostQuays,
} from "../src/features/network-ghost";
import type { TransferLineOption } from "../src/types/transit";
import type { NetworkGhostAnchor, NetworkGhostTopology } from "../src/features/network-ghost";

describe("network ghost data", () => {
  it("projects every line into the main map viewport", () => {
    const viewport = createGeographicViewport(
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.4, lat: 48.9 },
      ],
      {
        viewBoxWidth: 1080,
        viewBoxHeight: 620,
        paddingX: 78,
        paddingY: 68,
      },
    )!;
    const line = createNetworkGhostLine(
      {
        id: "line:IDFM:C00025",
        label: "3146",
        family: "BUS",
        mode: "Bus",
        color: "ff5a00",
      },
      createTopology(),
      createAnchor(),
      viewport,
      0,
    );

    expect(line?.anchorStationId).toBe("station:a");
    expect(line?.color).toBe("#ff5a00");
    expect(line?.segments.map((segment) => segment.level)).toEqual([0, 1]);
    expect(line?.geometrySource).toBe("direct");
    expect(line?.branches).toEqual([
      { id: "complete", stopIds: ["station:a", "station:b", "station:c"] },
    ]);
    expect(line?.stations[0]).toMatchObject({ lon: 2.35, lat: 48.85 });
    expect(line?.stations.find((station) => station.id === "station:c")?.x).toBeGreaterThan(1);
  });

  it("builds displayed segments from the same canonical patterns used by geometry", () => {
    const viewport = createGeographicViewport(
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.4, lat: 48.9 },
      ],
      { viewBoxWidth: 1080, viewBoxHeight: 620, paddingX: 78, paddingY: 68 },
    )!;
    const topology = createTopology();
    topology.segments = [
      { id: "schematic-a-b", from: "station:a", to: "station:b" },
      { id: "orphan-a-c", from: "station:a", to: "station:c" },
    ];

    const line = createNetworkGhostLine(
      { id: "line:test", label: "394", family: "BUS" },
      topology,
      createAnchor(),
      viewport,
      0,
    )!;

    expect(
      line.segments.map((segment) => [segment.fromStationId, segment.toStationId].sort()),
    ).toEqual([
      ["station:a", "station:b"],
      ["station:b", "station:c"],
    ]);
    expect(line.segments.some((segment) => segment.id === "orphan-a-c")).toBe(false);
    expect(line.branches?.flatMap((branch) => branch.stopIds)).toContain("station:c");
  });

  it("keeps all transfers by default and removes only buses in structural mode", () => {
    const transfers = [
      { id: "bus:91", label: "91", family: "BUS" as const },
      { id: "metro:4", label: "4", family: "METRO" as const },
      { id: "tram:3", label: "T3", family: "TRAM" as const },
    ];

    expect(filterNetworkGhostTransfers(transfers, "all").map((line) => line.id)).toEqual([
      "metro:4",
      "tram:3",
      "bus:91",
    ]);
    expect(filterNetworkGhostTransfers(transfers, "structural").map((line) => line.id)).toEqual([
      "metro:4",
      "tram:3",
    ]);
  });

  it("filters requested display modes while keeping unlisted modes", () => {
    const transfers: TransferLineOption[] = [
      { id: "bus:1", label: "1", family: "BUS" },
      { id: "metro:1", label: "1", family: "METRO" },
      { id: "tram:1", label: "T1", family: "TRAM" },
      { id: "night:1", label: "N1", family: "NOCTILIEN" },
      { id: "rer:1", label: "A", family: "RER" },
      { id: "train:1", label: "J", family: "TRANSILIEN" },
    ];

    expect(getNetworkGhostModeKey(transfers[3])).toBe("noctilien");
    expect(
      filterNetworkGhostTransfersByModes(transfers, {
        bus: false,
        metro: true,
        tram: false,
        noctilien: true,
        rer: false,
        transilien: true,
      }).map((transfer) => transfer.id),
    ).toEqual(["metro:1", "night:1", "train:1"]);
  });

  it("deduplicates bus replacements when the structural line has the same presentation", () => {
    const transfers: TransferLineOption[] = [
      {
        id: "line:IDFM:C01731",
        label: "R",
        family: "TRANSILIEN",
        mode: "Train",
        color: "#e89bbd",
        textColor: "#111827",
      },
      {
        id: "line:IDFM:C01848",
        label: "R",
        family: "BUS",
        mode: "Bus",
        color: "#e89bbd",
        textColor: "#111827",
      },
      { id: "line:bus:194", label: "194", family: "BUS", mode: "Bus" },
    ];

    expect(filterNetworkGhostTransfers(transfers, "all").map((line) => line.id)).toEqual([
      "line:IDFM:C01731",
      "line:bus:194",
    ]);
  });

  it("classifies Transilien independently from buses and RER", () => {
    const transilien: TransferLineOption = {
      id: "line:IDFM:C01740",
      label: "L",
      family: "TRANSILIEN",
      mode: "Train",
    };

    expect(getNetworkGhostModeKey(transilien)).toBe("transilien");
    expect(
      filterNetworkGhostTransfersByModes([transilien], {
        bus: true,
        metro: true,
        tram: true,
        noctilien: true,
        rer: true,
        transilien: false,
      }),
    ).toEqual([]);
  });

  it("recognizes Noctilien lines even when the source classifies them as buses", () => {
    const transfers: TransferLineOption[] = [
      { id: "bus:1", label: "1", family: "BUS", mode: "Bus" },
      {
        id: "line:IDFM:C01234",
        label: "N14",
        family: "BUS",
        mode: "Bus",
      },
    ];

    expect(getNetworkGhostModeKey(transfers[1])).toBe("noctilien");
    expect(
      filterNetworkGhostTransfersByModes(transfers, {
        bus: true,
        metro: true,
        tram: true,
        noctilien: false,
        rer: true,
        transilien: true,
      }).map((transfer) => transfer.id),
    ).toEqual(["bus:1"]);
  });

  it("projects and deduplicates optional quays without blocking empty stations", () => {
    const viewport = createGeographicViewport(
      [
        { lon: 2.3, lat: 48.8 },
        { lon: 2.4, lat: 48.9 },
      ],
      {
        viewBoxWidth: 1080,
        viewBoxHeight: 620,
        paddingX: 78,
        paddingY: 68,
      },
    )!;
    const anchor = createAnchor();

    anchor.quays = [
      { id: "q1", name: "Quai 1", lon: 2.35, lat: 48.85 },
      { id: "q2", name: "Quai 2", lon: 2.35, lat: 48.85 },
    ];

    expect(projectNetworkGhostQuays(anchor, viewport)).toHaveLength(1);
    expect(projectNetworkGhostQuays({ ...anchor, quays: undefined }, viewport)).toEqual([]);
  });

  it("distinguishes neighbouring physical stations even when a line was anchored by proximity", () => {
    expect(isSameNetworkGhostStationName("Gare du Nord", "Gare du Nord")).toBe(true);
    expect(isSameNetworkGhostStationName("Gare du Nord", "La Chapelle")).toBe(false);
    expect(isSameNetworkGhostStationName("Gare du Nord", "Magenta")).toBe(false);
    expect(isSameNetworkGhostStationName("Gare du Nord", "Rue du Château Landon")).toBe(false);
  });

  it("recognizes named components of a compound interchange without accepting neighbours", () => {
    expect(isSameNetworkGhostStationName("Châtelet - Les Halles", "Châtelet")).toBe(true);
    expect(isSameNetworkGhostStationName("Châtelet - Les Halles", "Les Halles")).toBe(true);
    expect(isSameNetworkGhostStationName("Châtelet - Les Halles", "Étienne Marcel")).toBe(false);
    expect(isSameNetworkGhostStationName("Saint-Lazare / Haussmann", "Haussmann")).toBe(true);
  });
});

function createAnchor(): NetworkGhostAnchor {
  return {
    id: "selected",
    label: "Gare Alpha",
    lon: 2.35,
    lat: 48.85,
    mapX: 0.5,
    mapY: 0.5,
  };
}

function createTopology(): NetworkGhostTopology {
  return {
    stations: [
      {
        id: "station:a",
        name: "Alpha",
        lon: 2.35,
        lat: 48.85,
      },
      {
        id: "station:b",
        name: "Beta",
        lon: 2.38,
        lat: 48.87,
      },
      {
        id: "station:c",
        name: "Gamma",
        lon: 2.8,
        lat: 49.1,
      },
    ],
    segments: [
      { id: "a-b", from: "station:a", to: "station:b" },
      { id: "b-c", from: "station:b", to: "station:c" },
    ],
    patterns: [
      { id: "complete", stops: ["station:a", "station:b", "station:c"] },
      { id: "contained", stops: ["station:b", "station:c"] },
    ],
  };
}
