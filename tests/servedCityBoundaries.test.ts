import { afterEach, describe, expect, it, vi } from "vitest";
import type { GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { IrisDataset } from "../src/features/transport-map/iris/irisApi";

vi.mock("../src/services/networkScheduler", () => ({
  runNetworkTask: (task: (signal: AbortSignal) => Promise<unknown>) => task(new AbortController().signal),
}));
vi.mock("../src/services/serverApi", () => ({ toServerApiUrl: (url: string) => url }));
const geometry = { type: "Polygon", coordinates: [[[2, 49], [3, 49], [3, 50], [2, 50], [2, 49]]] };
const boundary = { code: "60176", name: "Crépy-en-Valois", centroid: [2.5, 49.5], geometry };
const station = (id: string, lon = 2.8) => ({ id, lat: 49.2, lon }) as GlobalMapStation;

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("missing served city contours", () => {
  it("reports actual completions and exposes contours before the final request settles", async () => {
    let finishSecond!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => boundary })
      .mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve; })));
    const { fetchServedCityBoundaries } = await import("../src/features/transport-map/iris/servedCityBoundaries");
    const progress = vi.fn();
    const pending = fetchServedCityBoundaries([station("a"), station("duplicate"), station("b", 2.9)], progress);
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith({ completed: 1, total: 2, boundaries: [boundary], unavailable: false }));
    finishSecond({ ok: false, status: 503 });
    await pending;
    expect(progress.mock.calls.map(([value]) => value.completed)).toEqual([0, 1, 2]);
    expect(progress.mock.lastCall?.[0]).toEqual({ completed: 2, total: 2, boundaries: [boundary], unavailable: true });
  });
  it("only enriches stations outside IRIS coverage, even for a homonymous city", async () => {
    const { stationsMissingCityGeometry } = await import("../src/features/transport-map/iris/servedCityBoundaries");
    const iris = { bbox: [2, 49, 3, 50], neighborhoods: [{ communeName: "Crépy-en-Valois", geometry }] } as IrisDataset;
    expect(stationsMissingCityGeometry(iris, [station("covered"), station("outside", 4)]).map((item) => item.id))
      .toEqual(["outside"]);
  });

  it("keeps available contours on a partial failure, deduplicates and retries the failed station", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => boundary })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, json: async () => boundary });
    vi.stubGlobal("fetch", fetcher);
    const { fetchServedCityBoundaries } = await import("../src/features/transport-map/iris/servedCityBoundaries");
    const stations = [station("a"), station("same-point"), station("b", 2.9)];
    expect(await fetchServedCityBoundaries(stations)).toEqual({ boundaries: [boundary], unavailable: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await fetchServedCityBoundaries(stations)).toEqual({ boundaries: [boundary], unavailable: false });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects a contour that does not contain the requested station", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => boundary })));
    const { fetchServedCityBoundaries } = await import("../src/features/transport-map/iris/servedCityBoundaries");
    expect(await fetchServedCityBoundaries([station("outside", 4)])).toEqual({ boundaries: [], unavailable: true });
  });
});
