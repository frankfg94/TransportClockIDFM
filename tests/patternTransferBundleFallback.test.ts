import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DepartureCallingPattern,
  StationSearchOption,
  TransitBoardConfig,
} from "../src/types/transit";

vi.mock("../src/services/idfm", () => ({
  fetchStationTransfers: vi.fn(async (station: StationSearchOption) => [
    {
      id: `line:IDFM:${station.label === "Station B" ? "C01372" : "C01371"}`,
      label: station.label === "Station B" ? "2" : "1",
      family: "METRO",
      mode: "metro",
    },
  ]),
  fetchTransitFamilyOptions: vi.fn(async () => []),
  searchLineStations: vi.fn(async (): Promise<StationSearchOption[]> => [
    {
      id: "stop_area:IDFM:A",
      label: "Station A",
      monitoringRef: "STIF:StopArea:SP:A:",
      scheduleStopAreaRef: "stop_area:IDFM:A",
    },
    {
      id: "stop_area:IDFM:B",
      label: "Station B",
      monitoringRef: "STIF:StopArea:SP:B:",
      scheduleStopAreaRef: "stop_area:IDFM:B",
    },
  ]),
  searchTransitLines: vi.fn(async () => []),
}));

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("pattern transfer bundle fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("falls back to dynamic hydration when the transfer bundle is empty", async () => {
    const { hydrateDeparturePatternTransfers } = await import(
      "../src/features/service-pattern/patternTransfers"
    );
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          version: 1,
          generatedAt: "2026-06-02T10:00:00.000Z",
          lineId: "line:IDFM:C01727",
          lineLabel: "RER B",
          transfersByStopAreaRef: {},
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      ),
    );

    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
    vi.stubGlobal("fetch", fetchMock);

    const hydrated = await hydrateDeparturePatternTransfers(
      createBoard(),
      createPattern(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transfer-bundles",
      expect.objectContaining({
        body: expect.stringContaining('"transferResolverMode":"nearby"'),
        method: "POST",
      }),
    );
    expect(hydrated.calls[0]?.transferLines?.map((line) => line.label)).toEqual([
      "1",
    ]);
  });

  it("keeps partial bundle transfers and dynamically fills missing stations", async () => {
    const idfm = await import("../src/services/idfm");
    const { hydrateDeparturePatternTransfers } = await import(
      "../src/features/service-pattern/patternTransfers"
    );
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          version: 1,
          generatedAt: "2026-06-02T10:00:00.000Z",
          lineId: "line:IDFM:C01727",
          lineLabel: "RER B",
          transfersByStopAreaRef: {
            "stop_area:IDFM:A": [
              {
                id: "line:IDFM:C01379",
                label: "9",
                family: "METRO",
                mode: "metro",
              },
            ],
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      ),
    );

    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
    vi.stubGlobal("fetch", fetchMock);

    const hydrated = await hydrateDeparturePatternTransfers(
      createBoard(),
      createPattern(["Station A", "Station B"]),
    );

    expect(idfm.fetchStationTransfers).toHaveBeenCalledTimes(1);
    expect(idfm.fetchStationTransfers).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Station B" }),
      "line:IDFM:C01727",
      { transferScope: "connected" },
    );
    expect(hydrated.calls[0]?.transferLines?.map((line) => line.label)).toEqual([
      "9",
    ]);
    expect(hydrated.calls[1]?.transferLines?.map((line) => line.label)).toEqual([
      "2",
    ]);
  });
});

function createBoard(): TransitBoardConfig {
  return {
    id: "rer-b",
    title: "Station A",
    line: {
      color: "#5291ce",
      longName: "RER B",
      mode: "rer",
      ref: "line:IDFM:C01727",
      shortName: "B",
      textColor: "#ffffff",
    },
    schedule: {
      lineRef: "line:IDFM:C01727",
    },
  } as TransitBoardConfig;
}

function createPattern(labels = ["Station A"]): DepartureCallingPattern {
  return {
    calls: labels.map((label, index) => ({
        current: true,
        id: `call-${label.toLowerCase().replace(/\s+/gu, "-")}`,
        label,
        served: true,
        stopAreaRef: `stop_area:IDFM:${index === 0 ? "A" : "B"}`,
      })),
    departureId: "rer-b-test",
    destination: "Saint-Remy-les-Chevreuse",
    serviceType: "omnibus",
  };
}

