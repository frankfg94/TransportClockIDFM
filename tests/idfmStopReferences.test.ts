import { describe, expect, it } from "vitest";
import {
  createIdfmStopReferenceKeys,
  extractIdfmStopPointCode,
  idfmLineToSiriRef,
  idfmReferenceToMonitoringRef,
  monitoringRefToNavitiaStopAreaRef,
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

  it("converts precalculated stop-area and line ids to SIRI refs", () => {
    expect(idfmReferenceToMonitoringRef("station:FR::monomodalStopPlace:46007:FR1"))
      .toBe("STIF:StopArea:SP:46007:");
    expect(idfmReferenceToMonitoringRef("FR::Quay:50227635:FR1"))
      .toBe("STIF:StopPoint:Q:50227635:");
    expect(idfmLineToSiriRef("line:IDFM:C01743"))
      .toBe("STIF:Line::C01743:");
  });

  it("converts a topology SIRI stop-area ref to a Navitia schedule ref", () => {
    expect(monitoringRefToNavitiaStopAreaRef("STIF:StopArea:SP:70505:"))
      .toBe("stop_area:IDFM:70505");
    expect(monitoringRefToNavitiaStopAreaRef("STIF:StopPoint:Q:70505:")).toBeUndefined();
  });
});
