import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearTransferBundles,
  collectTransferBundleTargets,
  deleteTransferBundle,
  isCompleteTransferBundleResponse,
  listTransferBundles,
  loadTransferBundleForPattern,
  pruneExpiredTransferBundles,
  saveTransferBundle,
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
    expect(listTransferBundles(storage)).toMatchObject([
      {
        lineLabel: "Tram T6",
        stopAreaCount: 1,
        transferCount: 1,
      },
    ]);
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

    deleteTransferBundle("line:idfm:c00004", storage);
    expect(listTransferBundles(storage)).toEqual([]);
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
  });

  it("clears legacy bundle stores and sends a cache-buster on the next request", async () => {
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

    clearTransferBundles(storage);
    expect(listTransferBundles(storage)).toEqual([]);

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

    const payload = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      cacheBust?: string;
    };

    expect(payload.cacheBust).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  it("does not reuse legacy bundle stores after transfer matching changes", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      "transport-clock.transfer-bundles.v2",
      JSON.stringify({
        version: 1,
        bundles: [
          {
            id: "stale-metro-13",
            lineId: "line:IDFM:C01383",
            lineLabel: "Metro 13",
            generatedAt: "2026-06-02T10:00:00.000Z",
            createdAt: "2026-06-02T10:00:00.000Z",
            updatedAt: "2026-06-02T10:00:00.000Z",
            expiresAt: "2026-06-17T10:00:00.000Z",
            retentionDays: 15,
            transfersByStopAreaRef: {
              "FR::Quay:50026786:FR1": [],
            },
          },
        ],
      }),
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

function createBoard(lineRef: string, longName: string): TransitBoardConfig {
  return {
    id: lineRef,
    title: longName,
    line: {
      color: "#0064ff",
      longName,
      mode: "tram",
      ref: lineRef,
      shortName: longName.replace(/^Tram\s+/u, ""),
      textColor: "#ffffff",
    },
    schedule: {
      lineRef,
    },
  } as TransitBoardConfig;
}
