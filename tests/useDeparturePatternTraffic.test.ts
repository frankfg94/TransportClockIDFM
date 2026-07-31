import { describe, expect, it } from "vitest";
import {
  getCurrentDeparturePatternTrafficDisruptions,
  getSelectedTrafficDisruptions,
} from "../src/features/service-pattern/useDeparturePatternTraffic";
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

  it("prioritizes a weekday evening slot over a broad technical period", () => {
    const interruption = createWeekdayEveningInterruption();
    const fridayAfternoon = new Date(2026, 6, 31, 14).getTime();
    const fridayEvening = new Date(2026, 6, 31, 22).getTime();
    const saturdayAfternoon = new Date(2026, 7, 1, 14).getTime();
    const saturdayEarlyMorning = new Date(2026, 7, 1, 1).getTime();

    expect(
      getCurrentDeparturePatternTrafficDisruptions(
        [interruption],
        fridayAfternoon,
      ),
    ).toEqual([]);
    expect(
      getCurrentDeparturePatternTrafficDisruptions(
        [interruption],
        fridayEvening,
      ),
    ).toEqual([interruption]);
    expect(
      getCurrentDeparturePatternTrafficDisruptions(
        [interruption],
        saturdayAfternoon,
      ),
    ).toEqual([]);
    expect(
      getCurrentDeparturePatternTrafficDisruptions(
        [interruption],
        saturdayEarlyMorning,
      ),
    ).toEqual([interruption]);
  });

  it("keeps an all-day disruption on the technical fallback", () => {
    const interruption: TrafficDisruption = {
      id: "all-day-interruption",
      title: "Trafic interrompu",
      message: "Période : toute la journée. Dates : le 31 juillet.",
      kind: "works",
      applicationPeriods: [
        { begin: "20260731T000000", end: "20260801T000000" },
      ],
      impactedLineRefs: ["line:IDFM:C01730"],
      impactedStopNames: [],
    };

    expect(
      getCurrentDeparturePatternTrafficDisruptions(
        [interruption],
        new Date(2026, 6, 31, 14).getTime(),
      ),
    ).toEqual([interruption]);
  });
});

function createWeekdayEveningInterruption(): TrafficDisruption {
  return {
    id: "transilien-p-chateau-thierry-evening-work",
    title: "Ligne P : Paris Est - Château-Thierry du 29/06 au 28/08",
    message:
      "Période : en semaine à partir de 22h00. Dates : du lundi 29 juin au vendredi 28 août. Le trafic est interrompu entre Paris Est et Château Thierry.",
    kind: "works",
    applicationPeriods: [
      { begin: "20260629T220000", end: "20260829T023000" },
    ],
    impactedLineRefs: ["line:IDFM:C01730"],
    impactedStopNames: [],
  };
}
