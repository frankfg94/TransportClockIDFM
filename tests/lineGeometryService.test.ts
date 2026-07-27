import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchResolvedLineGeometry,
  preloadGtfsLineArtifacts,
} from "../src/services/lineGeometry";
import type { LineGeometryRequest } from "../src/features/line-map/lineGeometry";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("line geometry client service", () => {
  it("preloads every unique line in batches of 24 with at most two requests in flight", async () => {
    const pending: Array<{
      lineIds: string[];
      resolve: (response: Response) => void;
    }> = [];
    let active = 0;
    let maximumActive = 0;
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      const { lineIds } = JSON.parse(String(init?.body)) as { lineIds: string[] };
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      return new Promise<Response>((resolve) => {
        pending.push({
          lineIds,
          resolve: (response) => {
            active -= 1;
            resolve(response);
          },
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const lineIds = Array.from({ length: 50 }, (_, index) => `line:${index}`);
    const resultPromise = preloadGtfsLineArtifacts([...lineIds, "line:0", "line:24"]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(pending.map((request) => request.lineIds.length)).toEqual([24, 24]);
    const first = pending.shift()!;
    first.resolve(createPreloadResponse(first.lineIds));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(pending.at(-1)?.lineIds).toEqual(["line:48", "line:49"]);
    pending.splice(0).forEach((request) => {
      request.resolve(createPreloadResponse(request.lineIds));
    });

    await expect(resultPromise).resolves.toEqual({
      enabled: true,
      datasetVersion: "dataset-a",
      availableLineIds: lineIds,
      missingLineIds: [],
    });
    expect(maximumActive).toBe(2);
  });

  it("forwards the reload AbortSignal to the precise geometry request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            source: "direct",
            generatedAt: "2026-07-23T00:00:00.000Z",
            stops: [],
            branches: [],
            segments: [],
            entrances: [],
            attempts: [],
          }),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request: LineGeometryRequest = {
      lineId: "line:a",
      useGtfs: true,
      stops: [],
      branches: [],
    };

    await fetchResolvedLineGeometry(request, { signal: controller.signal });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      signal: controller.signal,
    });
  });
});

function createPreloadResponse(lineIds: string[]): Response {
  return new Response(
    JSON.stringify({
      enabled: true,
      datasetVersion: "dataset-a",
      availableLineIds: lineIds,
      missingLineIds: [],
    }),
  );
}
