import { describe, expect, it } from "vitest";
import {
  createEmptyTransferBundleMap,
  isSupportedTransferTargetRef,
} from "../server/api/transfer-bundles.post";

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

  it("initializes every requested target as resolved with an empty list", () => {
    expect(
      createEmptyTransferBundleMap([
        { stopAreaRef: "stop_area:IDFM:A", label: "A" },
        { stopAreaRef: "FR::Quay:50149051:FR1", label: "B" },
      ]),
    ).toEqual({
      "stop_area:IDFM:A": [],
      "FR::Quay:50149051:FR1": [],
    });
  });
});
