import { describe, expect, it } from "vitest";
import { parsePreloadLineIds } from "../server/api/gtfs/preload.post";
import { parseRequest, parseResolveRequests } from "../server/api/line-geometry/resolve.post";

const request = {
  lineId: "line:IDFM:C01383",
  useGtfs: false,
  stops: [
    { id: "A", lon: 2.3, lat: 48.8 },
    { id: "B", lon: 2.31, lat: 48.81 },
  ],
  branches: [{ id: "main", stopIds: ["A", "B"] }],
};

describe("line geometry request limits", () => {
  it("keeps the production method independent from injected GTFS data", () => {
    expect(parseRequest({ ...request, gtfs: { shapes: "must be ignored" } })).toEqual(request);
  });

  it("accepts grouped requests while preserving their order", () => {
    const parsed = parseResolveRequests({
      requests: [request, { ...request, lineId: "line:IDFM:C01384" }],
    });

    expect(parsed.batched).toBe(true);
    expect(parsed.requests.map((candidate) => candidate.lineId)).toEqual([
      "line:IDFM:C01383",
      "line:IDFM:C01384",
    ]);
  });

  it("rejects oversized batches and invalid station references", () => {
    expect(() =>
      parseResolveRequests({
        requests: Array.from({ length: 13 }, (_, index) => ({
          ...request,
          lineId: `line:${index}`,
        })),
      }),
    ).toThrow("requests must contain 1 to 12 lines");

    expect(() =>
      parseRequest({
        ...request,
        branches: [{ id: "main", stopIds: ["A", "unknown"] }],
      }),
    ).toThrow("Branch stopIds must reference submitted stops");
  });
});

describe("GTFS station preload request", () => {
  it("deduplicates are required client-side and the server caps fan-out", () => {
    expect(parsePreloadLineIds({ lineIds: ["line:a", "line:b"] })).toEqual(["line:a", "line:b"]);
    expect(() => parsePreloadLineIds({ lineIds: ["line:a", "line:a"] })).toThrow("unique values");
    expect(() =>
      parsePreloadLineIds({
        lineIds: Array.from({ length: 25 }, (_, index) => `line:${index}`),
      }),
    ).toThrow("1 to 24");
  });
});
