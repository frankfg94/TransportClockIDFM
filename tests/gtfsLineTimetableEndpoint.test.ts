import type { H3Event } from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import endpoint from "../server/api/lines/[lineId]/timetable.get";
import type { GtfsManifest } from "../server/services/gtfs/types";
import type {
  GtfsTimetableLineIndex,
  GtfsTimetableLoadResult,
} from "../server/services/gtfs/timetableTypes";
import type { LineTopology } from "../server/services/topology/types";

const mocks = vi.hoisted(() => ({
  serviceDate: vi.fn(),
  timetable: vi.fn(),
  topology: vi.fn(),
  artifact: vi.fn(),
}));

vi.mock("../server/services/gtfs/frequencyComputation", () => ({
  getGtfsFrequencyServiceDate: mocks.serviceDate,
}));
vi.mock("../server/services/gtfs/timetableRuntime", () => ({
  loadGtfsTimetableForDate: mocks.timetable,
}));
vi.mock("../server/services/gtfs/runtime", () => ({
  loadGtfsLineArtifact: mocks.artifact,
}));
vi.mock("../server/services/topology/getLineTopology", () => ({
  getLineTopology: mocks.topology,
}));
vi.mock("../server/services/topology/netexCache", () => ({
  getNetexRuntimeEnv: vi.fn(() => ({})),
}));

const manifest: GtfsManifest = {
  schemaVersion: 1,
  sha256: "a".repeat(64),
  datasetVersion: "dataset-v1",
  sourceUpdatedAt: "2026-08-30T10:00:00Z",
  installedAt: "2026-08-30T11:00:00Z",
  cacheGeneration: 1,
  lineCount: 1,
  timetable: {
    schemaVersion: 1,
    path: `timetables/v1/${"a".repeat(64)}/run1`,
    startDate: "20260801",
    endDate: "20260930",
    lineCount: 1,
    tripCount: 1,
    fileCount: 1,
    bytes: 100,
  },
};
const index: GtfsTimetableLineIndex = {
  schemaVersion: 1,
  lineId: "line:L",
  stops: [
    { id: "a", name: "Alpha", parentId: "parent-a" },
    { id: "b", name: "Beta" },
  ],
  services: [],
  chunks: [],
  startDate: "20260801",
  endDate: "20260930",
  maxTimeSeconds: 86400,
  tripCount: 1,
};
const loaded: GtfsTimetableLoadResult = {
  status: "ready",
  manifest,
  index,
  trips: [
    {
      id: "trip-1",
      serviceDate: "20260901",
      directionId: "0",
      headsign: "Beta",
      calls: [
        {
          stopId: "a",
          sequence: 1,
          arrival: 3600,
          departure: 3660,
          pickupType: 0,
          dropOffType: 0,
        },
        {
          stopId: "b",
          sequence: 2,
          arrival: 4200,
          departure: 4200,
          pickupType: 1,
          dropOffType: 0,
        },
      ],
    },
  ],
};

function event(lineId: string | undefined, serviceDate?: string) {
  const headers = new Map<string, string>();
  const query = serviceDate ? `?serviceDate=${serviceDate}` : "";
  const path = `/api/lines/${lineId ? encodeURIComponent(lineId) : "missing"}/timetable${query}`;
  return {
    headers,
    event: {
      path,
      context: { params: { lineId } },
      node: {
        req: { url: path },
        res: { setHeader: (name: string, value: string) => headers.set(name, value) },
      },
    } as unknown as H3Event,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.serviceDate.mockReturnValue("20260831");
  mocks.timetable.mockResolvedValue(loaded);
  mocks.topology.mockResolvedValue(undefined);
  mocks.artifact.mockResolvedValue(undefined);
});

describe("GTFS timetable endpoint", () => {
  it("returns the selected line timetable without exposing the internal manifest shape", async () => {
    const request = event("line:L", "20260901");
    const result = await endpoint(request.event);

    expect(mocks.timetable).toHaveBeenCalledExactlyOnceWith(request.event, "line:L", "20260901");
    expect(result).toEqual({
      lineId: "line:L",
      serviceDate: "20260901",
      source: "gtfs",
      status: "ready",
      datasetVersion: "dataset-v1",
      sourceUpdatedAt: "2026-08-30T10:00:00Z",
      coverage: { startDate: "20260801", endDate: "20260930" },
      stops: [
        { id: "a", name: "Alpha", parentId: "parent-a" },
        { id: "b", name: "Beta", parentId: undefined },
      ],
      trips: loaded.trips,
    });
    expect(request.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("includes the resolved topology id used to filter NeTEx sections", async () => {
    const topology: LineTopology = {
      line: { id: "line:L", aliases: [], name: "Line", shortName: "L", mode: "rail" },
      stations: [
        { id: "a", name: "Alpha", degree: 1 },
        { id: "b", name: "Beta", degree: 1 },
      ],
      segments: [{ id: "a-b", from: "a", to: "b", patterns: [] }],
      patterns: [],
      branches: [],
      loops: [],
      branchPoints: [],
      terminals: ["a", "b"],
    };
    mocks.topology.mockResolvedValue(topology);

    const result = await endpoint(event("line:L", "20260901").event);

    expect(result.stops).toEqual([
      { id: "a", name: "Alpha", parentId: "parent-a", topologyId: "a" },
      { id: "b", name: "Beta", parentId: undefined, topologyId: "b" },
    ]);
  });

  it("uses the backend service date when no date is requested", async () => {
    const request = event("line:L");
    await endpoint(request.event);
    expect(mocks.serviceDate).toHaveBeenCalledOnce();
    expect(mocks.timetable).toHaveBeenCalledWith(request.event, "line:L", "20260831");
  });

  it.each([undefined, " ", "../L", "L\\bad", "L\u0000bad", "L".repeat(201)])(
    "rejects invalid line id %s",
    async (lineId) => {
      await expect(endpoint(event(lineId).event)).rejects.toMatchObject({ statusCode: 400 });
      expect(mocks.timetable).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid requested service date", async () => {
    await expect(endpoint(event("line:L", "2026-09-01").event)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mocks.timetable).not.toHaveBeenCalled();
  });
});
