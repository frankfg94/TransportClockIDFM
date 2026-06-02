import { describe, expect, it } from "vitest";
import {
  clearTransferBundles,
  collectTransferBundleTargets,
  deleteTransferBundle,
  listTransferBundles,
  pruneExpiredTransferBundles,
  saveTransferBundle,
  type TransferBundleStorage,
} from "../src/features/service-pattern/transferBundles";
import type { DepartureCallingPattern } from "../src/types/transit";

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
