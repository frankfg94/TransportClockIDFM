import { describe, expect, it } from "vitest";
import {
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
