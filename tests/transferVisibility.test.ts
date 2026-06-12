import { describe, expect, it } from "vitest";
import {
  filterDuplicateBusTransfers,
  isBusLikeTransfer,
  isHighServiceBusTransfer,
  isVisiblePatternPlanTransfer,
} from "../src/features/service-pattern/transferVisibility";
import type { TransferLineOption } from "../src/types/transit";

describe("pattern transfer visibility", () => {
  it("keeps regular bus and Noctilien transfers out of the line-plan badges", () => {
    expect(isVisiblePatternPlanTransfer(transfer("74", "BUS", "Bus"))).toBe(false);
    expect(isVisiblePatternPlanTransfer(transfer("N15", "NOCTILIEN", "Noctilien"))).toBe(false);
    expect(isBusLikeTransfer(transfer("N15", "NOCTILIEN", "Noctilien"))).toBe(true);
  });

  it("keeps high-service bus transfers visible on the line plan", () => {
    expect(isHighServiceBusTransfer(transfer("TVM", "BUS", "Bus"))).toBe(true);
    expect(isHighServiceBusTransfer(transfer("T Zen 1", "BUS", "Bus"))).toBe(true);
    expect(isHighServiceBusTransfer(transfer("TZen 4", "BUS", "Bus"))).toBe(true);
    expect(isHighServiceBusTransfer(transfer("BHNS", "BUS", "Bus"))).toBe(true);

    expect(isVisiblePatternPlanTransfer(transfer("TVM", "BUS", "Bus"))).toBe(true);
  });

  it("keeps structural transfers visible on the line plan", () => {
    expect(isVisiblePatternPlanTransfer(transfer("1", "METRO", "Metro"))).toBe(true);
    expect(isVisiblePatternPlanTransfer(transfer("A", "RER", "RER"))).toBe(true);
    expect(isVisiblePatternPlanTransfer(transfer("T3a", "TRAM", "Tram"))).toBe(true);
    expect(isVisiblePatternPlanTransfer(transfer("L", "TRANSILIEN", "Train"))).toBe(true);
  });

  it("removes only the bus duplicate when a structural transfer has the same line id", () => {
    const transilien = transfer("L", "TRANSILIEN", "Train");
    const duplicateBus = {
      ...transfer("L", "BUS", "Bus"),
      id: transilien.id,
    };
    const regularBus = transfer("1204", "BUS", "Bus");

    expect(
      filterDuplicateBusTransfers([transilien, duplicateBus, regularBus]),
    ).toEqual([transilien, regularBus]);
  });

  it("matches equivalent IDFM ids across id and ref fields", () => {
    const transilien = {
      ...transfer("L", "TRANSILIEN", "Train"),
      id: "line:IDFM:C01740",
    };
    const duplicateBus = {
      ...transfer("L", "BUS", "Bus"),
      id: "legacy:bus:l",
      ref: "IDFM:C01740",
    };

    expect(filterDuplicateBusTransfers([transilien, duplicateBus])).toEqual([
      transilien,
    ]);
  });

  it("uses matching presentation as a fallback for unresolved duplicate bus labels", () => {
    const transilien = {
      ...transfer("L", "TRANSILIEN", "Train"),
      color: "#A65A95",
      textColor: "#FFFFFF",
    };
    const duplicateBus = {
      ...transfer("L", "BUS", "Bus"),
      id: "legacy:bus:l",
      color: "a65a95",
      textColor: "ffffff",
    };

    expect(filterDuplicateBusTransfers([transilien, duplicateBus])).toEqual([
      transilien,
    ]);
  });

  it("keeps a real bus sharing a label with another mode when its identity differs", () => {
    const metro = {
      ...transfer("1", "METRO", "Metro"),
      color: "#FFCD00",
      textColor: "#000000",
    };
    const bus = {
      ...transfer("1", "BUS", "Bus"),
      id: "line:test:bus:1",
      color: "#00814F",
      textColor: "#FFFFFF",
    };

    expect(filterDuplicateBusTransfers([metro, bus])).toEqual([metro, bus]);
  });
});

function transfer(
  label: string,
  family: TransferLineOption["family"],
  mode: string,
): TransferLineOption {
  return {
    family,
    id: `line:test:${label}`,
    label,
    mode,
  };
}
