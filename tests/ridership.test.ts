import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAnnualRidershipCache,
  fetchAnnualRidershipLine,
  fetchAnnualRidershipStation,
  fetchMonthlyRidershipLine,
} from "../src/services/ridership";

describe("annual ridership service", () => {
  beforeEach(() => {
    clearAnnualRidershipCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches one request for the selected line", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      id: "line:IDFM:C01371",
      code: "C01371",
      label: "1",
      mode: "METRO",
      generatedAt: "2026-01-01T00:00:00.000Z",
      requestedYear: 2024,
      sources: [],
      primary: { value: 100, unit: "journeys", status: "official", sourceIds: [], sourceRecordIds: [] },
      measures: [],
      stations: [],
    })));
    vi.stubGlobal("fetch", fetcher);

    const first = await fetchAnnualRidershipLine("line:IDFM:C01371");
    const second = await fetchAnnualRidershipLine("line:IDFM:C01371");

    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "/api/ridership/lines/line%3AIDFM%3AC01371",
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("encodes a station request and its optional line context", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      id: "station:IDFM:100",
      name: "Station test",
      lineIds: ["line:IDFM:C01371"],
      measures: [],
      primary: { value: 100, unit: "entries", status: "official", sourceIds: [], sourceRecordIds: [] },
      sources: [],
      rankings: {},
    })));
    vi.stubGlobal("fetch", fetcher);

    await fetchAnnualRidershipStation("station:IDFM:100", "line:IDFM:C01371");
    await fetchAnnualRidershipStation("station:IDFM:100", "line:IDFM:C01371");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "/api/ridership/stations/station%3AIDFM%3A100?lineId=line%3AIDFM%3AC01371",
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("encodes and memoizes a monthly line request", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      schemaVersion: 1,
      id: "line:IDFM:C01371",
      code: "C01371",
      label: "1",
      mode: "METRO",
      color: "#000000",
      textColor: "#ffffff",
      metric: "monthly_line_validations",
      unit: "entries",
      generatedAt: "2026-01-01T00:00:00.000Z",
      availableYears: [2024],
      series: [],
      trends: {},
      coverage: {},
      cohort: { cohortGeneratedAt: "2026-01-01T00:00:00.000Z", includedStationIds: [], excludedStations: [] },
      stations: [],
      milestones: [],
      sources: [],
      methodology: {},
    })));
    vi.stubGlobal("fetch", fetcher);

    await fetchMonthlyRidershipLine("line:IDFM:C01371");
    await fetchMonthlyRidershipLine("line:IDFM:C01371");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "/api/ridership/lines/line%3AIDFM%3AC01371/monthly",
    );
  });
});
