import { describe, expect, it } from "vitest";
import {
  getBoardTrafficAlertForReport,
  getTodayScheduledTrafficInterruption,
  type BoardTrafficAlertMessages,
  type TrafficDisruption,
  type TrafficLineReport,
} from "../src/features/traffic";

const messages: BoardTrafficAlertMessages = {
  disruption: "Perturbation",
  disruptionAndInterruptionAt: (time) =>
    `Perturbation - interruption a partir de ${time}`,
  interruption: "Interruption",
  multipleInterruptions: "Interruption multiple",
  interruptionAt: (time) => `Interruption a partir de ${time}`,
  interruptionInDay: (count) => `Interruption dans ${count} jour`,
  interruptionInDays: (count) => `Interruption dans ${count} jours`,
  interruptionToday: "Interruption aujourd'hui",
};

describe("board traffic alert", () => {
  it("targets the current red interruption", () => {
    const now = new Date(2026, 6, 9, 12, 0, 0).getTime();

    expect(
      getBoardTrafficAlertForReport(createReport([createCurrentInterruption()]), {
        lookaheadDays: 10,
        messages,
        now,
      }),
    ).toEqual({
      label: "Interruption",
      target: {
        alertId: "current-interruption",
        lineRef: "line:IDFM:C01727",
        trafficTab: "current",
      },
      tone: "red",
    });
  });

  it("groups multiple current red interruptions for the same line", () => {
    const now = new Date(2026, 6, 9, 12, 0, 0).getTime();
    const first = createCurrentInterruption();
    const second: TrafficDisruption = {
      ...createCurrentInterruption(),
      id: "current-third-party-damage",
      message: "Dégradations par un tiers entre deux stations.",
      title: "Mesures de sécurité - Trafic interrompu",
    };

    expect(
      getBoardTrafficAlertForReport(createReport([first, second]), {
        lookaheadDays: 10,
        messages,
        now,
      }),
    ).toEqual({
      label: "Interruption multiple",
      target: {
        alertId: "current-interruption",
        lineRef: "line:IDFM:C01727",
        trafficTab: "current",
      },
      targets: [
        {
          alertId: "current-interruption",
          lineRef: "line:IDFM:C01727",
          trafficTab: "current",
        },
        {
          alertId: "current-third-party-damage",
          lineRef: "line:IDFM:C01727",
          trafficTab: "current",
        },
      ],
      tone: "red",
    });
  });
  it("targets the current orange perturbation", () => {
    const now = new Date(2026, 6, 9, 12, 0, 0).getTime();

    expect(
      getBoardTrafficAlertForReport(createReport([createReducedOfferDisruption()]), {
        lookaheadDays: 10,
        messages,
        now,
      }),
    ).toEqual({
      label: "Perturbation",
      target: {
        alertId: "rer-b-reduced-offer",
        lineRef: "line:IDFM:C01727",
        trafficTab: "current",
      },
      tone: "orange",
    });
  });

  it("uses the RER B textual same-day start instead of the PRIM midnight technical period", () => {
    const now = new Date(2026, 6, 9, 12, 0, 0).getTime();
    const disruption = createRerBEveningWork();
    const scheduled = getTodayScheduledTrafficInterruption(disruption, now);

    expect(scheduled?.active).toBe(false);
    expect(scheduled?.start.getHours()).toBe(22);
    expect(scheduled?.start.getMinutes()).toBe(45);
    expect(
      getBoardTrafficAlertForReport(createReport([disruption]), {
        lookaheadDays: 10,
        messages,
        now,
      }),
    ).toEqual({
      label: "Interruption a partir de 22h45",
      target: {
        alertId: "rer-b-evening-work",
        lineRef: "line:IDFM:C01727",
        trafficTab: "upcoming",
      },
      tone: "upcoming",
    });
  });

  it("keeps an active RER B perturbation visible when an evening interruption is also scheduled", () => {
    const now = new Date(2026, 6, 9, 12, 0, 0).getTime();

    expect(
      getBoardTrafficAlertForReport(
        createReport([createReducedOfferDisruption(), createRerBEveningWork()]),
        {
          lookaheadDays: 10,
          messages,
          now,
        },
      ),
    ).toEqual({
      label: "Perturbation - interruption a partir de 22h45",
      target: {
        alertId: "rer-b-evening-work",
        lineRef: "line:IDFM:C01727",
        trafficTab: "upcoming",
      },
      tone: "upcoming",
    });
  });

  it("marks the board as interrupted after the textual start even before the technical period starts", () => {
    const now = new Date(2026, 6, 9, 23, 0, 0).getTime();
    const disruption = createRerBEveningWork();
    const scheduled = getTodayScheduledTrafficInterruption(disruption, now);

    expect(scheduled?.active).toBe(true);
    expect(
      getBoardTrafficAlertForReport(createReport([disruption]), {
        lookaheadDays: 10,
        messages,
        now,
      }),
    ).toEqual({
      label: "Interruption",
      target: {
        alertId: "rer-b-evening-work",
        lineRef: "line:IDFM:C01727",
        trafficTab: "upcoming",
      },
      tone: "red",
    });
  });

  it("does not apply weekday textual schedules to weekend evenings", () => {
    const now = new Date(2026, 6, 11, 12, 0, 0).getTime();
    const disruption = createRerBEveningWork([
      {
        begin: "20260712T000000",
        end: "20260712T030000",
      },
    ]);

    expect(getTodayScheduledTrafficInterruption(disruption, now)).toBeUndefined();
  });
});

function createReport(disruptions: TrafficDisruption[]): TrafficLineReport {
  return {
    disruptions,
    lineRef: "line:IDFM:C01727",
    status: "disrupted",
  };
}

function createRerBEveningWork(
  applicationPeriods: TrafficDisruption["applicationPeriods"] = [
    {
      begin: "20260710T000000",
      end: "20260710T030000",
    },
  ],
): TrafficDisruption {
  return {
    applicationPeriods,
    id: "rer-b-evening-work",
    impactedLineRefs: ["line:IDFM:C01727"],
    impactedStopNames: [],
    kind: "works",
    message:
      "Période : en semaine à partir de 22h45. Dates : du lundi 1er juin au jeudi 31 décembre. Le trafic est interrompu entre Châtelet Les Halles et Aérop. C De Gaulle 2 et entre Châtelet Les Halles et Mitry - Claye.",
    title: "RER B : Châtelet <-> Aéroport CDG2 - Mitry - Claye 01/06-31/12",
  };
}

function createCurrentInterruption(): TrafficDisruption {
  return {
    applicationPeriods: [
      {
        begin: "20260709T030000",
        end: "20260710T030000",
      },
    ],
    id: "current-interruption",
    impactedLineRefs: ["line:IDFM:C01727"],
    impactedStopNames: [],
    kind: "works",
    message: "Le trafic est interrompu entre deux gares.",
    title: "Interruption de trafic",
  };
}

function createReducedOfferDisruption(): TrafficDisruption {
  return {
    applicationPeriods: [
      {
        begin: "20260706T030000",
        end: "20260711T030000",
      },
    ],
    id: "rer-b-reduced-offer",
    impactedLineRefs: ["line:IDFM:C01727"],
    impactedStopNames: [],
    kind: "incident",
    message:
      "Période: Toute la journée. Date: Du 7 au 10 juillet. L'offre de transport est réduite jusqu'au 10 juillet. Prévoir 8 trains sur 10 en moyenne.",
    title: "Offre de transport réduite avec dessertes renforcées en soirée",
  };
}
