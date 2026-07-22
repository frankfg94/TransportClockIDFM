import { describe, expect, it } from "vitest";
import { getSelectedTrafficDisruptions } from "../src/features/service-pattern/useDeparturePatternTraffic";
import type { TrafficDisruption } from "../src/features/traffic";

describe("departure pattern traffic calendar selection", () => {
  it("trusts weekend disruption IDs already assigned by the calendar", () => {
    const interruption: TrafficDisruption = {
      id: "rer-b-weekends-only",
      title: "RER B : Aér. CDG2/Mitry - Claye <-> Châtelet interrompu en soirée",
      message:
        "Période : les week-ends de 22h45 à Fin de service\n\nDates : Les samedi 25, dimanche 26 juillet et samedi 1er, dimanche 2, samedi 8, dimanche 9, samedi 15, dimanche 16 août.\nLe trafic est interrompu entre Châtelet les Halles et Aéroport Charles de Gaulle/Mitry-Claye\n\nMotif : travaux sur le réseau ferroviaire.",
      kind: "works",
      applicationPeriods: [
        { begin: "20260802T224500", end: "20260803T020000" },
      ],
      impactedLineRefs: ["line:IDFM:C01743"],
      impactedStopNames: [],
    };

    expect(
      getSelectedTrafficDisruptions([interruption], [interruption.id]),
    ).toEqual([interruption]);
    expect(getSelectedTrafficDisruptions([interruption], [])).toEqual([]);
  });
  it("trusts Metro 4 disruption IDs already assigned by the calendar", () => {
    const interruption: TrafficDisruption = {
      id: "metro-4-july-works",
      title: "Trafic interrompu",
      message:
        "Jusqu'au 24 juillet inclus, le trafic est interrompu entre Montparnasse Bienvenue et Les Halles en raison de travaux.",
      kind: "works",
      applicationPeriods: [
        { begin: "20260706T044500", end: "20260725T043000" },
      ],
      impactedLineRefs: ["line:IDFM:C01374"],
      impactedStopNames: ["Gare Montparnasse (Paris)", "Les Halles (Paris)"],
    };

    expect(
      getSelectedTrafficDisruptions([interruption], [interruption.id]),
    ).toEqual([interruption]);
    expect(getSelectedTrafficDisruptions([interruption], [])).toEqual([]);
  });
});