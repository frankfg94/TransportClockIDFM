import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingTransferBundleRequestsForTests,
  clearTransferBundleForBoard,
  clearTransferBundles,
  collectTransferBundleTargets,
  deleteTransferBundle,
  isCompleteTransferBundleResponse,
  listTransferBundles,
  loadTransferBundleForPattern,
  loadTransferBundleResultForPattern,
  pruneExpiredTransferBundles,
  resolveTransferBundleNearbyDistanceMeters,
  saveTransferBundle,
  TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS,
  type TransferBundleStorage,
} from "../src/features/service-pattern/transferBundles";
import type { DepartureCallingPattern, TransitBoardConfig } from "../src/types/transit";

class MemoryStorage implements TransferBundleStorage {
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

describe("transfer bundles", () => {
  afterEach(() => {
    clearPendingTransferBundleRequestsForTests();
    vi.unstubAllGlobals();
  });

  it("collects unique stop-area refs from calls and topology", () => {
    const pattern: DepartureCallingPattern = {
      departureId: "test",
      destination: "A",
      serviceType: "omnibus",
      calls: [
        {
          id: "call-a",
          label: "Station A",
          current: true,
          served: true,
          stopAreaRef: "stop_area:IDFM:A",
        },
      ],
      lineTopology: [
        {
          id: "sequence",
          label: "Sequence",
          stops: [
            createStop("Station A", "stop_area:IDFM:A"),
            createStop("Station B", "stop_area:IDFM:B"),
          ],
        },
      ],
    };

    expect(collectTransferBundleTargets(pattern)).toEqual([
      { stopAreaRef: "stop_area:IDFM:A", label: "Station A", city: undefined },
      { stopAreaRef: "stop_area:IDFM:B", label: "Station B", city: undefined },
    ]);
  });

  it("uses a nearby radius tuned for each transport type", () => {
    expect(resolveTransferBundleNearbyDistanceMeters("metro")).toBe(
      TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS.metro,
    );
    expect(resolveTransferBundleNearbyDistanceMeters("rer")).toBe(600);
    expect(resolveTransferBundleNearbyDistanceMeters("transilien")).toBe(600);
    expect(resolveTransferBundleNearbyDistanceMeters("tram")).toBe(350);
    expect(resolveTransferBundleNearbyDistanceMeters("bus")).toBe(200);
    expect(resolveTransferBundleNearbyDistanceMeters("unknown")).toBe(300);
  });

  it("keeps NeTEx quay refs so the server can resolve them to stop areas", () => {
    const pattern: DepartureCallingPattern = {
      departureId: "t6",
      destination: "Viroflay",
      serviceType: "omnibus",
      calls: [
        {
          id: "call-parc-andre-malraux",
          label: "Parc Andre Malraux",
          current: true,
          served: true,
          stopAreaRef: "FR::Quay:50146322:FR1",
        },
      ],
    };

    expect(collectTransferBundleTargets(pattern)).toEqual([
      {
        stopAreaRef: "FR::Quay:50146322:FR1",
        label: "Parc Andre Malraux",
        city: undefined,
      },
    ]);
  });

  it("detects incomplete bundle responses without forcing a slow fallback", () => {
    expect(
      isCompleteTransferBundleResponse(
        [
          {
            stopAreaRef: "FR::Quay:50149051:FR1",
            label: "Chatillon - Montrouge",
          },
        ],
        {
          version: 1,
          generatedAt: "2026-06-02T10:00:00.000Z",
          lineId: "line:IDFM:C01794",
          lineLabel: "Tram T6",
          transfersByStopAreaRef: {},
        },
      ),
    ).toBe(false);
  });

  it("accepts partial bundle responses so unresolved stations do not block display", async () => {
    const storage = new MemoryStorage();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          version: 1,
          generatedAt: "2026-06-02T10:00:00.000Z",
          lineId: "line:IDFM:C01794",
          lineLabel: "Tram T6",
          transfersByStopAreaRef: {
            "FR::Quay:50149051:FR1": [
              {
                id: "line:IDFM:C01383",
                label: "13",
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
    const pattern: DepartureCallingPattern = {
      departureId: "t6",
      destination: "Viroflay",
      serviceType: "omnibus",
      calls: [
        {
          id: "call-chatillon",
          label: "Chatillon - Montrouge",
          current: true,
          served: true,
          stopAreaRef: "FR::Quay:50149051:FR1",
        },
        {
          id: "call-unresolved",
          label: "Station non resolue",
          current: false,
          served: true,
          stopAreaRef: "FR::Quay:missing:FR1",
        },
      ],
    };

    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);

    const transfers = await loadTransferBundleForPattern(
      createBoard("line:IDFM:C01794", "Tram T6"),
      pattern,
      15,
    );

    expect(transfers["FR::Quay:50149051:FR1"]?.map((line) => line.label)).toEqual([
      "13",
    ]);
    expect(transfers["FR::Quay:missing:FR1"]).toBeUndefined();
    expect(listTransferBundles(storage)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not persist a bundle response that contains none of the requested targets", async () => {
    const storage = new MemoryStorage();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          version: 1,
          generatedAt: "2026-06-02T10:00:00.000Z",
          lineId: "line:IDFM:C01742",
          lineLabel: "RER A",
          transfersByStopAreaRef: {},
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      ),
    );
    const pattern: DepartureCallingPattern = {
      departureId: "rer-a",
      destination: "Poissy",
      serviceType: "omnibus",
      calls: [
        {
          id: "call-auber",
          label: "Auber",
          current: true,
          served: true,
          stopAreaRef: "FR::monomodalStopPlace:45873:FR1",
        },
      ],
    };

    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadTransferBundleResultForPattern(
      createBoard("line:IDFM:C01742", "RER A"),
      pattern,
      15,
      { transferResolverMode: "nearby" },
    );

    expect(result.complete).toBe(false);
    expect(result.missingTargetRefs).toEqual(["FR::monomodalStopPlace:45873:FR1"]);
    expect(listTransferBundles(storage)).toEqual([]);
  });

  it("deduplicates concurrent bundle requests for the same target batch", async () => {
    const storage = new MemoryStorage();
    const pattern: DepartureCallingPattern = {
      departureId: "rer-b",
      destination: "Saint-Remy",
      serviceType: "omnibus",
      calls: [
        {
          id: "call-a",
          label: "Station A",
          current: true,
          served: true,
          stopAreaRef: "stop_area:IDFM:A",
        },
      ],
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            version: 1,
            generatedAt: "2026-06-02T10:00:00.000Z",
            lineId: "line:IDFM:C01727",
            lineLabel: "RER B",
            transfersByStopAreaRef: {
              "stop_area:IDFM:A": [],
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
    );

    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      loadTransferBundleForPattern(
        createBoard("line:IDFM:C01727", "RER B"),
        pattern,
        15,
      ),
      loadTransferBundleForPattern(
        createBoard("line:IDFM:C01727", "RER B"),
        pattern,
        15,
      ),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends every transfer target in a single backend bundle request", async () => {
    const storage = new MemoryStorage();
    const calls = Array.from({ length: 25 }, (_, index) => ({
      current: index === 0,
      id: `call-${index}`,
      label: `Station ${index}`,
      served: true,
      stopAreaRef: `stop_area:IDFM:${index}`,
    }));
    const pattern: DepartureCallingPattern = {
      departureId: "rer-a",
      destination: "Terminus",
      serviceType: "omnibus",
      calls,
    };
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        nearbyDistanceMeters: number;
        requestConcurrency: number;
        targets: Array<{ stopAreaRef: string }>;
      };

      expect(payload.nearbyDistanceMeters).toBe(600);
      expect(payload.requestConcurrency).toBe(2);

      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      await new Promise((resolve) => setTimeout(resolve, 10));

      inFlight -= 1;

      return new Response(
        JSON.stringify({
          version: 1,
          generatedAt: "2026-06-02T10:00:00.000Z",
          lineId: "line:IDFM:C01742",
          lineLabel: "RER A",
          transferResolverMode: "nearby",
          transfersByStopAreaRef: Object.fromEntries(
            payload.targets.map((target) => [
              target.stopAreaRef,
              [{ id: "line:IDFM:C01371", label: "1" }],
            ]),
          ),
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    });

    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadTransferBundleResultForPattern(
      createBoard("line:IDFM:C01742", "RER A", "rer"),
      pattern,
      15,
      { requestConcurrency: 2, transferResolverMode: "nearby" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).targets).toHaveLength(
      25,
    );
    expect(result.complete).toBe(true);
    expect(Object.keys(result.transfersByStopAreaRef)).toHaveLength(25);
  });

  it("sends one complete backend bundle request by default", async () => {
    const storage = new MemoryStorage();
    const calls = Array.from({ length: 21 }, (_, index) => ({
      current: index === 0,
      id: `call-${index}`,
      label: `Station ${index}`,
      served: true,
      stopAreaRef: `stop_area:IDFM:${index}`,
    }));
    const pattern: DepartureCallingPattern = {
      departureId: "rer-a",
      destination: "Terminus",
      serviceType: "omnibus",
      calls,
    };
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        nearbyDistanceMeters: number;
        requestConcurrency: number;
        targets: Array<{ stopAreaRef: string }>;
      };

      expect(payload.nearbyDistanceMeters).toBe(600);
      expect(payload.requestConcurrency).toBe(1);

      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      await new Promise((resolve) => setTimeout(resolve, 10));

      inFlight -= 1;

      return new Response(
        JSON.stringify({
          version: 1,
          generatedAt: "2026-06-02T10:00:00.000Z",
          lineId: "line:IDFM:C01742",
          lineLabel: "RER A",
          transferResolverMode: "nearby",
          transfersByStopAreaRef: Object.fromEntries(
            payload.targets.map((target) => [
              target.stopAreaRef,
              [{ id: "line:IDFM:C01371", label: "1" }],
            ]),
          ),
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    });

    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadTransferBundleResultForPattern(
      createBoard("line:IDFM:C01742", "RER A", "rer"),
      pattern,
      15,
      { transferResolverMode: "nearby" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).targets).toHaveLength(
      21,
    );
    expect(result.complete).toBe(true);
  });

  it("progressively completes a Cloudflare-partial bundle and reuses it after refresh", async () => {
    const storage = new MemoryStorage();
    const calls = Array.from({ length: 21 }, (_, index) => ({
      current: index === 0,
      id: `call-${index}`,
      label: `Station ${index}`,
      served: true,
      stopAreaRef: `FR::Quay:${50000000 + index}:FR1`,
    }));
    const pattern: DepartureCallingPattern = {
      departureId: "metro-14",
      destination: "Aeroport d'Orly",
      serviceType: "omnibus",
      calls,
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        targets: Array<{ stopAreaRef: string }>;
      };
      const resolvedTargets = payload.targets.slice(0, 6);

      return new Response(
        JSON.stringify({
          version: 1,
          generatedAt: "2026-06-11T10:00:00.000Z",
          lineId: "line:IDFM:C01384",
          lineLabel: "Ligne 14",
          nearbyDistanceMeters: 450,
          requestConcurrency: 1,
          transferResolverMode: "nearby",
          transfersByStopAreaRef: Object.fromEntries(
            resolvedTargets.map((target) => [
              target.stopAreaRef,
              [{ id: "line:IDFM:C01371", label: "1" }],
            ]),
          ),
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    });

    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);

    const board = createBoard("line:IDFM:C01384", "Ligne 14", "metro");
    const firstLoad = await loadTransferBundleResultForPattern(
      board,
      pattern,
      15,
      {
        localCacheEnabled: true,
        localCacheStorage: storage,
        transferResolverMode: "nearby",
      },
    );

    expect(firstLoad.complete).toBe(true);
    expect(Object.keys(firstLoad.transfersByStopAreaRef)).toHaveLength(21);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      fetchMock.mock.calls.map((call) =>
        JSON.parse(String(call[1]?.body)).targets.length,
      ),
    ).toEqual([21, 15, 9, 3]);
    expect(listTransferBundles(storage)).toMatchObject([
      {
        lineId: "line:IDFM:C01384",
        stopAreaCount: 21,
      },
    ]);

    const refreshedLoad = await loadTransferBundleResultForPattern(
      board,
      pattern,
      15,
      {
        localCacheEnabled: true,
        localCacheStorage: storage,
        transferResolverMode: "nearby",
      },
    );

    expect(refreshedLoad.complete).toBe(true);
    expect(Object.keys(refreshedLoad.transfersByStopAreaRef)).toHaveLength(21);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("sends the configured request spacing to the transfer bundle endpoint", async () => {
    const storage = new MemoryStorage();
    const pattern: DepartureCallingPattern = {
      departureId: "rer-a",
      destination: "Terminus",
      serviceType: "omnibus",
      calls: [
        {
          current: true,
          id: "call-a",
          label: "Station A",
          served: true,
          stopAreaRef: "stop_area:IDFM:A",
        },
      ],
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        requestSpacingMs: number;
        targets: Array<{ stopAreaRef: string }>;
      };

      expect(payload.requestSpacingMs).toBe(1000);

      return new Response(
        JSON.stringify({
          version: 1,
          generatedAt: "2026-06-02T10:00:00.000Z",
          lineId: "line:IDFM:C01742",
          lineLabel: "RER A",
          transferResolverMode: "nearby",
          transfersByStopAreaRef: Object.fromEntries(
            payload.targets.map((target) => [
              target.stopAreaRef,
              [{ id: "line:IDFM:C01371", label: "1" }],
            ]),
          ),
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    });

    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadTransferBundleResultForPattern(
      createBoard("line:IDFM:C01742", "RER A", "rer"),
      pattern,
      15,
      {
        requestSpacingMs: 1000,
        transferResolverMode: "nearby",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.complete).toBe(true);
  });

  it("normalizes every resolver request to the nearby backend strategy", async () => {
    const storage = new MemoryStorage();
    const pattern: DepartureCallingPattern = {
      departureId: "rer-b",
      destination: "Saint-Remy",
      serviceType: "omnibus",
      calls: [
        {
          id: "call-a",
          label: "Station A",
          current: true,
          served: true,
          stopAreaRef: "stop_area:IDFM:A",
        },
      ],
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        transferResolverMode: "nearby";
      };

      return new Response(
        JSON.stringify({
          version: 1,
          generatedAt: "2026-06-02T10:00:00.000Z",
          lineId: "line:IDFM:C01727",
          lineLabel: "RER B",
          transferResolverMode: payload.transferResolverMode,
          transfersByStopAreaRef: {
            "stop_area:IDFM:A": [
              {
                id: `line:${payload.transferResolverMode}`,
                label: payload.transferResolverMode,
              },
            ],
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    });

    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);

    await loadTransferBundleResultForPattern(
      createBoard("line:IDFM:C01727", "RER B", "rer"),
      pattern,
      15,
      { transferResolverMode: "auto" },
    );
    await loadTransferBundleResultForPattern(
      createBoard("line:IDFM:C01727", "RER B", "rer"),
      pattern,
      15,
      { transferResolverMode: "nearby" },
    );

    expect(
      fetchMock.mock.calls
        .map((call) => JSON.parse(String(call[1]?.body)).transferResolverMode)
        .sort(),
    ).toEqual(["nearby", "nearby"]);
  });

  it("saves, lists, merges and deletes local bundles", () => {
    const storage = new MemoryStorage();
    const now = Date.parse("2026-06-02T10:00:00.000Z");

    saveTransferBundle(
      {
        version: 1,
        generatedAt: new Date(now).toISOString(),
        lineId: "line:IDFM:C00004",
        lineLabel: "Ligne 4",
        transfersByStopAreaRef: {
          "stop_area:IDFM:A": [{ id: "line:IDFM:M1", label: "1" }],
        },
      },
      15,
      storage,
      now,
    );
    saveTransferBundle(
      {
        version: 1,
        generatedAt: new Date(now + 1).toISOString(),
        lineId: "line:IDFM:C00004",
        lineLabel: "Ligne 4",
        transfersByStopAreaRef: {
          "stop_area:IDFM:B": [{ id: "line:IDFM:M2", label: "2" }],
        },
      },
      15,
      storage,
      now + 1,
    );

    expect(listTransferBundles(storage)).toMatchObject([
      {
        lineLabel: "Ligne 4",
        stopAreaCount: 2,
        transferCount: 2,
        retentionDays: 15,
      },
    ]);

    const [savedBundle] = listTransferBundles(storage);

    deleteTransferBundle(savedBundle?.id ?? "", storage);
    expect(listTransferBundles(storage)).toEqual([]);
  });

  it("clears only the bundle for a board line before a retry", () => {
    const storage = new MemoryStorage();
    const now = Date.parse("2026-06-02T10:00:00.000Z");

    saveTransferBundle(
      {
        version: 1,
        generatedAt: new Date(now).toISOString(),
        lineId: "line:IDFM:C01727",
        lineLabel: "RER B",
        transfersByStopAreaRef: {
          "stop_area:IDFM:A": [],
        },
      },
      15,
      storage,
      now,
    );
    saveTransferBundle(
      {
        version: 1,
        generatedAt: new Date(now).toISOString(),
        lineId: "line:IDFM:C00013",
        lineLabel: "Ligne 13",
        transfersByStopAreaRef: {
          "stop_area:IDFM:B": [],
        },
      },
      15,
      storage,
      now,
    );

    clearTransferBundleForBoard(createBoard("line:IDFM:C01727", "RER B"), storage);

    expect(listTransferBundles(storage).map((bundle) => bundle.lineLabel)).toEqual([
      "Ligne 13",
    ]);
  });

  it("prunes expired bundles and can clear every bundle", () => {
    const storage = new MemoryStorage();
    const now = Date.parse("2026-06-02T10:00:00.000Z");

    saveTransferBundle(
      {
        version: 1,
        generatedAt: new Date(now).toISOString(),
        lineId: "line:IDFM:C00014",
        lineLabel: "Ligne 14",
        transfersByStopAreaRef: {
          "stop_area:IDFM:A": [],
        },
      },
      1,
      storage,
      now - 2 * 24 * 60 * 60 * 1000,
    );

    pruneExpiredTransferBundles(storage, now);
    expect(listTransferBundles(storage)).toEqual([]);

    saveTransferBundle(
      {
        version: 1,
        generatedAt: new Date(now).toISOString(),
        lineId: "line:IDFM:C00013",
        lineLabel: "Ligne 13",
        transfersByStopAreaRef: {
          "stop_area:IDFM:A": [],
        },
      },
      15,
      storage,
      now,
    );
    clearTransferBundles(storage);
    expect(listTransferBundles(storage)).toEqual([]);
    expect(storage.getItem("transport-clock.transfer-bundles.v12")).toBeNull();
  });

  it("clears legacy bundle stores without leaving a local cache-buster", async () => {
    const storage = new MemoryStorage();
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

    saveTransferBundle(
      {
        version: 1,
        generatedAt: "2026-06-02T10:00:00.000Z",
        lineId: "line:IDFM:C01727",
        lineLabel: "RER B",
        transfersByStopAreaRef: {
          "stop_area:IDFM:A": [{ id: "line:IDFM:C01371", label: "1" }],
        },
      },
      15,
      storage,
    );
    storage.setItem(
      "transport-clock.transfer-bundles.v1",
      JSON.stringify({
        version: 1,
        bundles: [
          {
            id: "legacy",
            lineId: "legacy",
            lineLabel: "Legacy",
            generatedAt: "2026-06-02T10:00:00.000Z",
            createdAt: "2026-06-02T10:00:00.000Z",
            updatedAt: "2026-06-02T10:00:00.000Z",
            expiresAt: "2026-06-17T10:00:00.000Z",
            retentionDays: 15,
            transfersByStopAreaRef: {},
          },
        ],
      }),
    );
    storage.setItem(
      "transport-clock.transfer-bundles.v2",
      JSON.stringify({
        version: 1,
        bundles: [
          {
            id: "legacy-v2",
            lineId: "legacy-v2",
            lineLabel: "Legacy v2",
            generatedAt: "2026-06-02T10:00:00.000Z",
            createdAt: "2026-06-02T10:00:00.000Z",
            updatedAt: "2026-06-02T10:00:00.000Z",
            expiresAt: "2026-06-17T10:00:00.000Z",
            retentionDays: 15,
            transfersByStopAreaRef: {},
          },
        ],
      }),
    );
    storage.setItem(
      "transport-clock.transfer-bundles.resetAt",
      "2026-06-02T10:00:00.000Z",
    );

    clearTransferBundles(storage);
    expect(listTransferBundles(storage)).toEqual([]);
    expect(storage.getItem("transport-clock.transfer-bundles.v12")).toBeNull();
    expect(storage.getItem("transport-clock.transfer-bundles.v1")).toBeNull();
    expect(storage.getItem("transport-clock.transfer-bundles.v2")).toBeNull();
    expect(storage.getItem("transport-clock.transfer-bundles.resetAt")).toBeNull();

    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);

    await loadTransferBundleForPattern(
      createBoard("line:IDFM:C01727", "RER B"),
      {
        departureId: "rer-b",
        destination: "Saint-Remy",
        serviceType: "omnibus",
        calls: [
          {
            id: "call-a",
            label: "Station A",
            current: true,
            served: true,
            stopAreaRef: "stop_area:IDFM:A",
          },
        ],
      },
      15,
    );

    const payload = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;

    expect(payload).not.toHaveProperty("cacheBust");
  });

  it("does not reuse legacy bundle stores after transfer matching changes", () => {
    const storage = new MemoryStorage();

    ["transport-clock.transfer-bundles.v11", "transport-clock.transfer-bundles.v4"].forEach(
      (key) => {
        storage.setItem(
          key,
          JSON.stringify({
            version: 1,
            bundles: [
              {
                id: `stale-${key}`,
                lineId: "line:IDFM:C01383",
                lineLabel: "Metro 13",
                generatedAt: "2026-06-02T10:00:00.000Z",
                createdAt: "2026-06-02T10:00:00.000Z",
                updatedAt: "2026-06-02T10:00:00.000Z",
                expiresAt: "2026-06-17T10:00:00.000Z",
                retentionDays: 15,
                requestConcurrency: 1,
                transferResolverMode: "nearby",
                transfersByStopAreaRef: {
                  "FR::Quay:50026786:FR1": [],
                },
              },
            ],
          }),
        );
      },
    );

    expect(listTransferBundles(storage)).toEqual([]);
  });
});

function createStop(label: string, stopAreaRef: string) {
  return {
    id: label,
    label,
    station: {
      id: stopAreaRef,
      label,
      monitoringRef: "",
      scheduleStopAreaRef: stopAreaRef,
    },
  };
}

function createBoard(
  lineRef: string,
  longName: string,
  mode: TransitBoardConfig["line"]["mode"] = "tram",
): TransitBoardConfig {
  return {
    id: lineRef,
    title: longName,
    line: {
      color: "#0064ff",
      longName,
      mode,
      ref: lineRef,
      shortName: longName.replace(/^Tram\s+/u, ""),
      textColor: "#ffffff",
    },
    schedule: {
      lineRef,
    },
  } as TransitBoardConfig;
}

