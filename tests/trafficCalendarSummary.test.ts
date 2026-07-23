import { describe, expect, it } from "vitest";
import {
  classifyPatternTrafficIncident,
  createPatternTrafficSummaryEntries,
  getPatternTrafficSummaryCopy,
  getPatternTrafficSummaryRemainingDayCount,
  getPatternTrafficSummaryTitle,
  getPatternTrafficSummaryTimeWindow,
} from "../src/features/service-pattern/trafficCalendarSummary";
import type {
  PatternTrafficCalendarDay,
  PatternTrafficCalendarEvent,
} from "../src/features/service-pattern/trafficCalendar";
import type { TrafficDisruption } from "../src/features/traffic";
import { getTrafficDisruptionStartClockTime } from "../src/features/traffic/trafficTextTimes";

describe("traffic calendar friendly summary", () => {
  it.each([
    ["interruption", "Trafic interrompu entre Châtelet et Gare du Nord", "unknown"],
    ["works", "Travaux de renouvellement des voies", "works"],
    ["slowdown", "Ralentissements et retards sur la ligne", "incident"],
    ["crowding", "Affluence élevée à Nation", "incident"],
    ["strike", "Mouvement social régional", "incident"],
    ["weather", "Circulation adaptée en raison de la neige", "incident"],
    ["concert", "Concert exceptionnel au Stade de France", "information"],
    ["sport", "Manifestation sportive au Stade de France", "information"],
    ["celebration", "Feu d'artifice du 14 juillet", "information"],
    ["animal", "Animal sur les voies", "incident"],
    ["fallen-tree", "Arbre tombé sur les voies", "incident"],
    ["luggage", "Bagage oublié à Châtelet", "incident"],
    ["signalling", "Panne de signalisation", "incident"],
    ["suspicious-package", "Colis suspect à République", "incident"],
    ["medical", "Malaise voyageur à Nation", "incident"],
    ["train-breakdown", "Train en panne à Gare du Nord", "incident"],
    ["police", "Intervention des forces de l'ordre", "incident"],
    ["safety", "Incident de sécurité à République", "incident"],
    ["technical", "Incident technique sur la ligne", "incident"],
    ["information", "Conseil aux voyageurs", "information"],
    ["incident", "Obstacle sur la voie", "unknown"],
  ] as const)("classifies %s disruptions with a safe fallback", (expected, title, kind) => {
    expect(classifyPatternTrafficIncident(createDisruption(title, kind))).toBe(
      expected,
    );
  });

  it.each([
    ["concert", "Interruption en raison d'un concert"],
    ["celebration", "Interruption en raison d'un feu d'artifice"],
    ["animal", "Interruption en raison d'un animal sur les voies"],
    ["fallen-tree", "Interruption en raison d'un arbre tombé sur les voies"],
    ["luggage", "Interruption en raison d'un bagage oublié"],
    ["signalling", "Interruption en raison d'une panne de signalisation"],
    ["suspicious-package", "Interruption en raison d'un colis suspect"],
    ["medical", "Interruption en raison d'un malaise voyageur"],
    ["train-breakdown", "Interruption en raison d'un train en panne"],
    ["police", "Interruption en raison d'une intervention de police"],
  ] as const)(
    "keeps the %s cause icon for a generic interruption title",
    (expected, message) => {
      const disruption = createDisruption("Trafic interrompu", "incident");
      disruption.message = message;

      expect(classifyPatternTrafficIncident(disruption)).toBe(expected);
    },
  );

  it("prioritizes a sporting event over a police mention", () => {
    const disruption = createDisruption(
      "Arrivee du Tour de France le dimanche 26 juillet",
      "information",
    );
    disruption.message =
      "Certaines stations seront fermees a la demande de la Prefecture de Police.";
    disruption.motif = "Manifestation sportive - Autre";

    expect(classifyPatternTrafficIncident(disruption)).toBe("sport");
  });

  it("formats full-day, bounded, starting and ending windows", () => {
    const day = new Date(2026, 6, 18);
    expect(
      getPatternTrafficSummaryTimeWindow(
        createEvent(new Date(2026, 6, 17), new Date(2026, 6, 19)),
        day,
      ),
    ).toEqual({ kind: "all-day" });
    expect(
      getPatternTrafficSummaryTimeWindow(
        createEvent(new Date(2026, 6, 18, 7), new Date(2026, 6, 18, 11)),
        day,
      ),
    ).toEqual({ kind: "range", start: "07:00", end: "11:00" });
    expect(
      getPatternTrafficSummaryTimeWindow(
        createEvent(new Date(2026, 6, 18, 20), new Date(2026, 6, 19, 2)),
        day,
      ),
    ).toEqual({ kind: "from", start: "20:00" });
    expect(
      getPatternTrafficSummaryTimeWindow(
        createEvent(new Date(2026, 6, 17, 22), new Date(2026, 6, 18, 2)),
        day,
      ),
    ).toEqual({ kind: "until", end: "02:00" });
  });

  it("turns IDFM period-only titles into timing instead of incident copy", () => {
    const periodOnly = createDisruption(
      "Période : De 14h à Fin de Service",
      "information",
    );
    periodOnly.message =
      "Période : De 14h à Fin de Service\nAffluence élevée à Châtelet";
    const event = createEvent(
      new Date(2026, 6, 18),
      new Date(2026, 6, 18, 23, 59),
      periodOnly,
    );
    event.startTimeLabel = getTrafficDisruptionStartClockTime(periodOnly)?.label;
    event.restartTimeLabel = "23:59";

    const [entry] = createPatternTrafficSummaryEntries(createDay([event]));
    expect(entry.title).toBe("Affluence élevée à Châtelet");
    expect(entry.timeWindows).toEqual([{ kind: "from", start: "14:00" }]);
  });

  it("removes the redundant line prefix and generic traffic suffix", () => {
    const disruption = createDisruption(
      "Métro 13 : Travaux de rénovation - Trafic interrompu",
      "works",
    );

    expect(getPatternTrafficSummaryTitle(disruption)).toBe(
      "Travaux de rénovation",
    );
  });

  it("extracts the cause from an explicit reason when the title is generic", () => {
    const disruption = createDisruption("Trafic interrompu", "works");
    disruption.message =
      "Du 31 juillet au 17 août inclus, le trafic sera interrompu entre Saint-Denis – Université et La Fourche en raison de travaux de modernisation. Bus de remplacement.";

    expect(getPatternTrafficSummaryTitle(disruption)).toBe(
      "Travaux de modernisation",
    );
  });

  it("keeps a generic works reason when it is the only useful summary", () => {
    const disruption = createDisruption(
      "Jusqu'au 24 juillet inclus, le trafic est interrompu entre Montparnasse Bienvenue et Les Halles en raison de travaux.",
      "works",
    );
    disruption.message =
      "Trafic interrompu\nMétro 4 : Travaux - Trafic interrompu\nMétro 4 : Travaux - Trafic interrompu";

    expect(getPatternTrafficSummaryCopy(disruption)).toEqual({
      title: "Travaux",
      description:
        "Jusqu'au 24 juillet inclus, le trafic est interrompu entre Montparnasse Bienvenue et Les Halles en raison de travaux",
    });
    expect(classifyPatternTrafficIncident(disruption)).toBe("works");
  });

  it("extracts a labelled motif from IDFM copy", () => {
    const disruption = createDisruption("Information trafic", "incident");
    disruption.message =
      "Période : toute la journée. Motif : panne de signalisation. Reprise estimée à 18:00.";

    expect(getPatternTrafficSummaryTitle(disruption)).toBe(
      "Panne de signalisation",
    );
  });

  it("prioritizes the explicit RER B motif over route-based titles", () => {
    const disruption = createDisruption(
      "RER B : Châtelet <-> Aéroport CDG2 - Mitry - Claye 01/06-31/12",
      "works",
    );
    disruption.message =
      "Période : en semaine à partir de 22h45. Dates : du lundi 1er juin au jeudi 31 décembre. Le trafic est interrompu entre Châtelet Les Halles et Aérop. C De Gaulle 2 et entre Châtelet Les Halles et Mitry - Claye. Un dispositif de bus de remplacement sera mis en place au départ de Gare du Nord. Motif : travaux sur le réseau ferroviaire.";

    expect(getPatternTrafficSummaryTitle(disruption)).toBe(
      "Travaux sur le réseau ferroviaire",
    );
  });

  it("keeps a detailed labelled motif instead of a generic works campaign title", () => {
    const disruption = createDisruption(
      "Grands Travaux d’été : du 7 au 16 août",
      "works",
    );
    disruption.message =
      "Le trafic est interrompu entre Gare du Nord et La Croix-de-Berny. Pour plus d'informations sur ces travaux, consultez le blog du RER B. Motif : Travaux sur le réseau ferré (remplacement de 26 aiguillages dans le secteur de Gare du Nord)";

    expect(getPatternTrafficSummaryCopy(disruption)).toEqual({
      title: "Travaux sur le réseau ferroviaire",
      description:
        "Remplacement de 26 aiguillages dans le secteur de Gare du Nord",
    });
  });

  it("preserves decimal commas and moves a long Transilien P detail to the subtitle", () => {
    const disruption = createDisruption("Trafic perturbé", "works");
    disruption.message =
      "Motif : travaux sur le réseau ferré (Remise à neuf complète de 13,4 kilomètres de voie entre Mortcerf et Coulommiers afin d’améliorer le confort à bord et la régularité des trains).";

    expect(getPatternTrafficSummaryCopy(disruption)).toEqual({
      title: "Travaux sur le réseau ferroviaire",
      description:
        "Remise à neuf complète de 13,4 kilomètres de voie entre Mortcerf et Coulommiers afin d’améliorer le confort à bord et la régularité des trains",
    });
  });

  it("separates the long RER C engineering detail from its title", () => {
    const disruption = createDisruption("Arrêt(s) non desservi(s)", "works");
    disruption.message =
      "Motif : Travaux sur le réseau ferré (travaux d’envergure pour l’interconnexion avec la ligne 15 et remplacement de 4 km de voie dans le tunnel intramuros)";

    expect(getPatternTrafficSummaryCopy(disruption)).toEqual({
      title: "Travaux sur le réseau ferroviaire",
      description:
        "Travaux d’envergure pour l’interconnexion avec la ligne 15 et remplacement de 4 km de voie dans le tunnel intramuros",
    });
  });

  it("summarizes the RER E adapted service instead of keeping a generic severity", () => {
    const disruption = createDisruption(
      "Trafic fortement perturbé",
      "incident",
    );
    disruption.cause = "perturbation";
    disruption.message =
      "RER E: Pendant les vacances scolaires du samedi 11 juillet jusqu’au dimanche 23 août, l’offre de transport est adaptée sur votre RER E. Certains trains ne circuleront pas.";

    expect(getPatternTrafficSummaryCopy(disruption)).toEqual({
      title: "Offre de transport adaptée",
      description: "Certains trains ne circuleront pas.",
    });
  });

  it("uses the short line status instead of a verbose operational title", () => {
    const disruption = createDisruption(
      "Le trafic est interrompu de Paris Austerlitz vers Dourdan La Forêt, de Paris Austerlitz vers Saint-Martin d'Étampes et de Paris Austerlitz vers Massy-Palaiseau jusqu'à 10h.",
      "incident",
    );
    disruption.message = [
      disruption.title,
      "Pour plus d'informations sur cette perturbation, consultez le fil X du RER C.",
      "RER C : interruptions",
      "Arrêt(s) non desservi(s)",
    ].join("\n\n");

    expect(getPatternTrafficSummaryCopy(disruption)).toEqual({
      title: "Interruptions",
      description:
        "Le trafic est interrompu de Paris Austerlitz vers Dourdan La Forêt, de Paris Austerlitz vers Saint-Martin d'Étampes et de Paris Austerlitz vers Massy-Palaiseau jusqu'à 10h",
    });
  });

  it("prefers a labelled motif to an earlier causal phrase", () => {
    const disruption = createDisruption("Trafic interrompu", "works");
    disruption.message =
      "Trafic interrompu en raison de travaux. Motif : renouvellement des aiguillages.";

    expect(getPatternTrafficSummaryTitle(disruption)).toBe(
      "Renouvellement des aiguillages",
    );
  });

  it("groups repeated periods of one incident while preserving distinct incidents", () => {
    const repeated = createDisruption("Travaux de nuit", "works", "works");
    const other = createDisruption("Affluence élevée", "incident", "crowding");
    const day = createDay([
      createEvent(new Date(2026, 6, 18, 1), new Date(2026, 6, 18, 4), repeated),
      createEvent(new Date(2026, 6, 18, 22), new Date(2026, 6, 18, 23), repeated),
      createEvent(new Date(2026, 6, 18), new Date(2026, 6, 19), other),
    ]);

    const entries = createPatternTrafficSummaryEntries(day);
    expect(entries).toHaveLength(2);
    expect(entries[0].timeWindows).toEqual([
      { kind: "range", start: "01:00", end: "04:00" },
      { kind: "range", start: "22:00", end: "23:00" },
    ]);
    expect(entries[1]).toMatchObject({ incidentType: "crowding" });
  });

  it("consolidates visually identical IDFM impacts", () => {
    const first = createDisruption("Grands Travaux d'été", "works", "works-a");
    const second = createDisruption("Grands Travaux d'été", "works", "works-b");
    first.impactedStopNames = ["Gare du Nord"];
    second.impactedStopNames = ["Le Bourget"];
    const entries = createPatternTrafficSummaryEntries(
      createDay([
        createEvent(new Date(2026, 6, 18), new Date(2026, 6, 19), first),
        createEvent(new Date(2026, 6, 18), new Date(2026, 6, 19), second),
      ]),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      incidentType: "works",
      disruptionIds: ["works-a", "works-b"],
      impactedStopNames: ["Gare du Nord", "Le Bourget"],
    });
  });

  it("counts distinct affected calendar days remaining after the selected day", () => {
    const disruption = createDisruption("Travaux test", "works", "multi-day");
    const event = createEvent(
      new Date(2026, 6, 18, 22),
      new Date(2026, 6, 21, 2),
      disruption,
    );

    expect(
      getPatternTrafficSummaryRemainingDayCount(
        [event],
        new Date(2026, 6, 18),
      ),
    ).toBe(3);
    expect(
      getPatternTrafficSummaryRemainingDayCount(
        [event],
        new Date(2026, 6, 21),
      ),
    ).toBe(0);
  });

  it("counts future separate application periods of the same disruption", () => {
    const disruption = createDisruption(
      "Travaux de nuit",
      "works",
      "repeated-nights",
    );
    disruption.applicationPeriods = [
      {
        begin: "2026-07-18T22:00:00+02:00",
        end: "2026-07-18T23:30:00+02:00",
      },
      {
        begin: "2026-07-19T22:00:00+02:00",
        end: "2026-07-19T23:30:00+02:00",
      },
      {
        begin: "2026-07-21T22:00:00+02:00",
        end: "2026-07-21T23:30:00+02:00",
      },
    ];
    const currentEvent = createEvent(
      new Date(2026, 6, 18, 22),
      new Date(2026, 6, 18, 23, 30),
      disruption,
    );

    expect(
      getPatternTrafficSummaryRemainingDayCount(
        [currentEvent],
        new Date(2026, 6, 18),
      ),
    ).toBe(2);
  });

  it("does not count an exclusive midnight end as another remaining day", () => {
    const disruption = createDisruption("Travaux test", "works", "midnight-end");
    const event = createEvent(
      new Date(2026, 6, 18, 22),
      new Date(2026, 6, 20, 0),
      disruption,
    );

    expect(
      getPatternTrafficSummaryRemainingDayCount(
        [event],
        new Date(2026, 6, 18),
      ),
    ).toBe(1);
  });

  it("does not extend remaining days with technical padding after an inclusive text end", () => {
    const disruption = createDisruption("Trafic interrompu", "works");
    disruption.message =
      "Jusqu'au 24 juillet inclus, le trafic est interrompu entre Montparnasse Bienvenue et Les Halles en raison de travaux.";
    disruption.applicationPeriods = [
      { begin: "20260706T044500", end: "20260725T043000" },
    ];
    const event = createEvent(
      new Date(2026, 6, 6, 4, 45),
      new Date(2026, 6, 24, 23, 59, 59, 999),
      disruption,
    );

    expect(
      getPatternTrafficSummaryRemainingDayCount(
        [event],
        new Date(2026, 6, 22),
      ),
    ).toBe(2);
  });

  it("uses the works category for the icon while severity keeps the interruption critical", () => {
    const closure = createDisruption(
      "Le trafic est interrompu entre Châtelet et Gare du Nord",
      "works",
    );
    closure.message = "Cette interruption est liée à des travaux.";

    expect(classifyPatternTrafficIncident(closure)).toBe("works");
  });
});

function createDisruption(
  title: string,
  kind: TrafficDisruption["kind"],
  id = title,
): TrafficDisruption {
  return {
    id,
    title,
    kind,
    applicationPeriods: [],
    impactedLineRefs: [],
    impactedStopNames: [],
  };
}

function createEvent(
  start: Date,
  end: Date | undefined,
  eventDisruption = createDisruption("Incident", "incident"),
): PatternTrafficCalendarEvent {
  return {
    id: `${eventDisruption.id}:${start.getTime()}`,
    disruption: eventDisruption,
    period: {},
    start,
    end,
    impactAnalysis: { segments: [], stationImpacts: {}, edgeImpacts: {} },
    kind: "disturbance",
    interruptedStationKeys: [],
    disturbedStationKeys: [],
    affectedEdgeKeys: [],
    affectedSegmentLabels: [],
    fallbackStationKeys: [],
  };
}

function createDay(events: PatternTrafficCalendarEvent[]): PatternTrafficCalendarDay {
  return {
    id: "traffic-calendar:2026-07-18",
    date: new Date(2026, 6, 18),
    dateKey: "2026-07-18",
    inCurrentMonth: true,
    isToday: false,
    isPast: false,
    events,
    impactCount: new Set(events.map((event) => event.disruption.id)).size,
    interruptedStationLabels: [],
    disturbedStationLabels: [],
    affectedSegmentLabels: [],
  };
}
