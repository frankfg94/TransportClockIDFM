import { describe, expect, it } from "vitest";
import { isSupportedTransferTargetRef } from "../server/api/transfer-bundles.post";

describe("transfer bundle endpoint", () => {
  it("accepts stop-area and NeTEx stop-place refs produced by the cache", () => {
    expect(isSupportedTransferTargetRef("stop_area:IDFM:46007")).toBe(true);
    expect(isSupportedTransferTargetRef("FR::Quay:50149051:FR1")).toBe(true);
    expect(isSupportedTransferTargetRef("FR::monomodalStopPlace:46007:FR1")).toBe(
      true,
    );
    expect(isSupportedTransferTargetRef("FR::multimodalStopPlace:58774:FR1")).toBe(
      true,
    );
  });

  it("rejects unsupported refs instead of sending malformed Navitia requests", () => {
    expect(isSupportedTransferTargetRef("FR::ScheduledStopPoint:46007:FR1")).toBe(
      false,
    );
    expect(isSupportedTransferTargetRef("")).toBe(false);
  });
});
