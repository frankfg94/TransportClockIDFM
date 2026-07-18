import { describe, expect, it } from "vitest";
import {
  createIdfmStopReferenceKeys,
  extractIdfmStopPointCode,
  monitoringRefToNavitiaStopPointRef,
  navitiaStopPointToMonitoringRef,
} from "../src/services/idfmStopReferences";

describe("IDFM stop point references", () => {
  it.each([
    ["STIF:StopPoint:Q:22222:", "22222"],
    ["stop_point:IDFM:22222", "22222"],
    ["FR::Quay:22222:FR1", "22222"],
    ["FR::ScheduledStopPoint:22222:FR1", "22222"],
  ])("extracts the same code from %s", (reference, expected) => {
    expect(extractIdfmStopPointCode(reference)).toBe(expected);
  });

  it("converts between Navitia and SIRI without accepting stop places", () => {
    expect(navitiaStopPointToMonitoringRef("stop_point:IDFM:22222")).toBe(
      "STIF:StopPoint:Q:22222:",
    );
    expect(
      monitoringRefToNavitiaStopPointRef("STIF:StopPoint:Q:22222:"),
    ).toBe("stop_point:IDFM:22222");
    expect(
      navitiaStopPointToMonitoringRef(
        "stop_point:IDFM:monomodalStopPlace:44316",
      ),
    ).toBeUndefined();
  });

  it("creates a shared identity key across all three reference formats", () => {
    const references = [
      "STIF:StopPoint:Q:22222:",
      "stop_point:IDFM:22222",
      "FR::Quay:22222:FR1",
    ];

    expect(
      references.map((reference) =>
        createIdfmStopReferenceKeys(reference).find((key) =>
          key.startsWith("idfm-stop:"),
        ),
      ),
    ).toEqual(["idfm-stop:22222", "idfm-stop:22222", "idfm-stop:22222"]);
  });
});
