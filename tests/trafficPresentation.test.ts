import { describe, expect, it } from "vitest";
import {
  getTrafficAlertPresentation,
  type TrafficDisruption,
} from "../src/features/traffic";

describe("traffic presentation", () => {
  it("derives line alert tone from the same disruption tone rules", () => {
    expect(
      getTrafficAlertPresentation([
        createDisruption({
          id: "information",
          message: "Risque de forte affluence.",
        }),
      ]),
    ).toEqual({
      label: "Perturbation",
      symbol: "!",
      tone: "orange",
    });

    expect(
      getTrafficAlertPresentation([
        createDisruption({
          id: "interruption",
          message: "Le trafic est interrompu entre deux gares.",
        }),
      ]),
    ).toEqual({
      label: "Interruption",
      symbol: "x",
      tone: "red",
    });
  });
});

function createDisruption({
  id,
  message,
}: {
  id: string;
  message: string;
}): TrafficDisruption {
  return {
    id,
    title: id,
    message,
    kind: "works",
    applicationPeriods: [],
    impactedLineRefs: ["line:IDFM:C01743"],
    impactedStopNames: [],
  };
}
