import { describe, expect, it } from "vitest";
import { extractTrafficModalDateTiles } from "../src/features/traffic/trafficModalFormatting";
import type { TrafficDisruption } from "../src/features/traffic";

describe("traffic modal intelligent formatting", () => {
  it("extracts both RER E date sets, time windows, and the replacement bus", () => {
    const disruption = createDisruption(
      "rer-e-summer-works",
      "RER E : Grands travaux d'été 2026",
      [
        "Travaux sur les nouveaux quais de la ligne 15 dans le cadre du Grand Paris Express.",
        "",
        "Période : toute la journée",
        "",
        "Dates : du 20 juillet au 24 juillet",
        "",
        "- Nanterre-la-Folie <> Tournan : offre de transport réduite de 5h20 à 8h45 en direction de Paris et de 16h à 19h30 en direction de Tournan",
        "- Nanterre-la-Folie <> Villiers-sur-Marne : offre de transport réduite",
        "",
        "A noter :",
        "- Rosny-Bois-Perrier non desservie dans les 2 sens du 1/08 au 7/08 : bus de remplacement",
      ].join("\n"),
      [{ begin: "20260720T000000", end: "20260807T235900" }],
    );

    const tiles = extractTrafficModalDateTiles(disruption, "Travaux sur le réseau ferroviaire");

    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toMatchObject({
      title: "Grands travaux d'été 2026",
      evening: false,
      replacementBus: false,
      timeWindows: [
        {
          start: { hour: 5, minute: 20 },
          end: { hour: 8, minute: 45 },
          untilEndOfService: false,
        },
        {
          start: { hour: 16, minute: 0 },
          end: { hour: 19, minute: 30 },
          untilEndOfService: false,
        },
      ],
    });
    expectLocalDate(tiles[0].start, [2026, 6, 20]);
    expectLocalDate(tiles[0].end, [2026, 6, 24]);

    expect(tiles[1]).toMatchObject({
      title: "Rosny-Bois-Perrier non desservie",
      evening: false,
      replacementBus: true,
      timeWindows: [],
    });
    expectLocalDate(tiles[1].start, [2026, 7, 1]);
    expectLocalDate(tiles[1].end, [2026, 7, 7]);
  });

  it("extracts the date of a sporting event introduced by le", () => {
    const disruption = createDisruption(
      "tour-de-france",
      "Arrivee du Tour de France le dimanche 26 juillet",
      [
        "Arrivee du Tour de France le dimanche 26 juillet : certaines stations seront fermees.",
        "Manifestation sportive - Autre",
      ].join("\n"),
      [{ begin: "20260722T161700", end: "20260727T043000" }],
    );
    disruption.kind = "information";
    disruption.motif = "Manifestation sportive";

    const [tile] = extractTrafficModalDateTiles(disruption);

    expect(tile).toMatchObject({
      title: "Arrivee du Tour de France",
      evening: false,
      replacementBus: false,
      timeWindows: [],
    });
    expectLocalDate(tile.start, [2026, 6, 26]);
    expectLocalDate(tile.end, [2026, 6, 26]);
  });

  it("keeps a stable RER E title across two date ranges", () => {
    const disruption = createDisruption(
      "rer-e-nanterre-chelles",
      "RER E : Nanterre - Chelles 15/06 - 2/10 et du 15/10 - 11/12",
      [
        "Période : en semaine à partir de 22h45.",
        "Dates : du lundi 15 juin au vendredi 2 octobre et du jeudi 15 octobre au vendredi 11 décembre.",
        "Le dernier train CONY de Nanterre-la-Folie vers Chelles Gournay est à 22h49, sauf le 15 juin : bus de remplacement.",
      ].join("\n"),
      [{ begin: "20260615T224500", end: "20261212T020000" }],
    );

    const tiles = extractTrafficModalDateTiles(
      disruption,
      "Travaux sur le réseau ferroviaire",
    );

    expect(tiles).toHaveLength(2);
    expect(tiles[0].title).toBe("Nanterre - Chelles");
    expect(tiles[0].periods).toHaveLength(2);
    expectLocalDate(tiles[0].periods[0].start, [2026, 5, 15]);
    expectLocalDate(tiles[0].periods[0].end, [2026, 9, 2]);
    expectLocalDate(tiles[0].periods[1].start, [2026, 9, 15]);
    expectLocalDate(tiles[0].periods[1].end, [2026, 11, 11]);
    expect(tiles[1].title).toBe(
      "Le dernier train CONY de Nanterre-la-Folie vers Chelles Gournay est à 22h49",
    );
  });

  it("uses the useful text after a generic Attention date label", () => {
    const disruption = createDisruption(
      "ligne-j-mantes-via-poissy",
      "Ligne J : Paris St-Lazare <> Mantes via Poissy du 20/07 au 14/08",
      [
        "Période : en semaine, à partir de 21h40.",
        "Dates : du lundi 20 juillet au vendredi 14 août.",
        "Un service de bus de remplacement est mis en place.",
        "Attention le lundi 20 juillet les bus seront au départ : - Houilles Carrières sur Seine <> Les Mureaux.",
      ].join("\n"),
      [{ begin: "20260720T214000", end: "20260815T020000" }],
    );

    const tiles = extractTrafficModalDateTiles(disruption, "Travaux");

    expect(tiles).toHaveLength(2);
    expect(tiles[1].title).toBe("Les bus seront au départ");
    expect(tiles[1].title).not.toBe("Attention");
  });

  it("extracts an evening start and avoids duplicate textual ranges", () => {
    const disruption = createDisruption(
      "evening-works",
      "Travaux de nuit",
      "Période : à partir de 22h45. Dates : du 25 juillet au 6 août. Rappel : du 25 juillet au 6 août.",
      [{ begin: "20260725T224500", end: "20260807T020000" }],
    );

    expect(extractTrafficModalDateTiles(disruption)).toMatchObject([
      {
        title: "Travaux de nuit",
        evening: false,
        replacementBus: false,
        timeWindows: [{ start: { hour: 22, minute: 45 } }],
      },
    ]);
  });

  it("marks the Ligne U replacement service as evening traffic", () => {
    const disruption = createDisruption(
      "ligne-u-la-defense-la-verriere",
      "Ligne U : La Défense <-> La Verrière 20-23/07",
      [
        "Période : en semaine, en soirée.",
        "Dates : du lundi 20 au jeudi 23 juillet.",
        "Le trafic est interrompu entre La Défense et La Verrière.",
        "Dernier départ de La Défense pour La Verrière : VERI de 23h15.",
        "Dernier départ de La Verrière pour La Défense : DEFI de 22h20.",
        "Un service de bus de remplacement est mis en place, avec desserte des gares intermédiaires.",
        "Motif : travaux sur le réseau ferroviaire.",
      ].join("\n"),
      [{ begin: "20260720T220000", end: "20260724T020000" }],
    );

    const [tile] = extractTrafficModalDateTiles(disruption, "Travaux sur le réseau ferroviaire");

    expect(tile).toMatchObject({
      evening: true,
      replacementBus: true,
      endLabel: undefined,
    });
    expectLocalDate(tile.start, [2026, 6, 20]);
    expectLocalDate(tile.end, [2026, 6, 23]);
  });

  it("creates an end-only tile for the Metro 13 inclusive deadline", () => {
    const disruption = createDisruption(
      "metro-13-renovation",
      "Métro 13 : Travaux de rénovation - Trafic interrompu",
      [
        "Trafic interrompu",
        "Jusqu'au dimanche 26 juillet inclus, le terminus sud de la ligne 13 est reporté à Malakoff – Rue Étienne Dolet en raison de travaux de rénovation.",
      ].join("\n"),
      [{ begin: "20260718T050000", end: "20260727T020000" }],
    );

    const [tile] = extractTrafficModalDateTiles(disruption, "Travaux de rénovation");

    expect(tile).toMatchObject({
      start: undefined,
      evening: false,
      replacementBus: false,
    });
    expectLocalDate(tile.end, [2026, 6, 26]);
  });

  it("creates an end-only replacement-bus tile for the T2 deadline", () => {
    const disruption = createDisruption(
      "tram-t2-charlebourg-puteaux",
      "Tramway T2 : Travaux - Trafic interrompu",
      [
        "Jusqu'au 23 août inclus, le trafic est interrompu entre Charlebourg et Puteaux en raison de travaux",
        "Trafic interrompu",
        "Bus de remplacement.",
      ].join("\n"),
      [{ begin: "20260722T050000", end: "20260824T020000" }],
    );

    const [tile] = extractTrafficModalDateTiles(disruption, "Travaux");

    expect(tile).toMatchObject({
      start: undefined,
      evening: false,
      replacementBus: true,
    });
    expectLocalDate(tile.end, [2026, 7, 23]);
  });

  it("keeps the T1 estimated end textual instead of inventing a date", () => {
    const disruption = createDisruption(
      "tram-t1-third-party-damage",
      "Tramway T1 : Mesures de sécurité - Trafic interrompu",
      [
        "Trafic interrompu entre Asnières - Quatre Routes et Gare de Saint-Denis en raison de dégradations par un tiers.",
        "Reprise des circulations envisagée en fin d'été 2026.",
        "Bus de remplacement entre Asnières–Gennevilliers–Les Courtilles et Mairie de Villeneuve-la-Garenne.",
      ].join("\n"),
      [{ begin: "20260722T000000", end: "20260921T235900" }],
    );

    expect(extractTrafficModalDateTiles(disruption, "Dégradations par un tiers")).toMatchObject([
      {
        title: "Dégradations par un tiers",
        start: undefined,
        end: undefined,
        endLabel: "fin d’été 2026",
        evening: false,
        replacementBus: true,
      },
    ]);
  });
  it("merges duplicate RER C date mentions and their useful metadata", () => {
    const disruption = createDisruption(
      "rer-c-dourdan-evenings",
      "RER C : entre Dourdan et Paris Austerlitz du 06/07 au 31/07",
      [
        "Arrêt(s) non desservi(s)",
        "Période : Les soirées.",
        "Dates : du lundi 6 au vendredi 31 juillet.",
        "Le trafic est interrompu entre Dourdan et Paris Austerlitz.",
        "À partir de 22h20, les trains sont terminus Brétigny.",
        "Un service de bus de remplacement est mis en place.",
      ].join("\n"),
      [{ begin: "20260706T222000", end: "20260801T020000" }],
    );

    const tiles = extractTrafficModalDateTiles(disruption, "Travaux sur le réseau ferroviaire");

    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      title: "Entre Dourdan et Paris Austerlitz",
      evening: true,
      replacementBus: true,
      timeWindows: [{ start: { hour: 22, minute: 20 } }],
    });
    expectLocalDate(tiles[0].start, [2026, 6, 6]);
    expectLocalDate(tiles[0].end, [2026, 6, 31]);
  });

  it.each([
    {
      id: "rer-b-chatelet",
      title: "RER B : Châtelet <-> Aéroport CDG2 - Mitry - Claye 01/06-31/12",
      message: [
        "Période : en semaine à partir de 22h45.",
        "Dates : du lundi 1er juin au jeudi 31 décembre.",
        "Un dispositif de bus de remplacement sera mis en place.",
      ].join("\n"),
      expectedTitle: "Châtelet <-> Aéroport CDG2 - Mitry - Claye",
      begin: "20260601T224500",
      end: "20270101T020000",
    },
    {
      id: "rer-a-nation",
      title: "Travaux",
      message: [
        "Période : toute la journée.",
        "Dates : du lundi 29 juin au dimanche 30 août.",
        "RER A : Nation du 29/06 au 30/08",
      ].join("\n"),
      expectedTitle: "Nation",
      begin: "20260629T000000",
      end: "20260830T235900",
    },
    {
      id: "ligne-j-conflans-mantes",
      title: "Travaux",
      message: [
        "Période : en semaine, à partir de 20h40.",
        "Dates : du lundi 20 juillet au vendredi 14 août.",
        "Ligne J : Conflans Ste-H. <-> Mantes la Jolie du 20/07 au 14/08",
      ].join("\n"),
      expectedTitle: "Conflans Ste-H. <-> Mantes la Jolie",
      begin: "20260720T204000",
      end: "20260815T020000",
    },
    {
      id: "rer-c-orly-ville",
      title: "Travaux de modernisation de la gare",
      message: [
        "Période : toute la journée.",
        "Dates : du lundi 6 juillet au dimanche 30 août.",
        "Orly ville non desservie par les trains pour Paris 06/07 au 30/08",
      ].join("\n"),
      expectedTitle: "Orly ville non desservie par les trains pour Paris",
      begin: "20260706T000000",
      end: "20260830T235900",
    },
    {
      id: "ligne-p-paris-meaux",
      title: "Ligne P : Paris Est - Meaux 22/06 - 28/08",
      message: [
        "Période : en semaine à partir de 22h20.",
        "Dates : du lundi 22 juin au vendredi 28 août.",
        "Un service de bus de remplacement est mis en place.",
      ].join("\n"),
      expectedTitle: "Paris Est - Meaux",
      begin: "20260622T222000",
      end: "20260829T020000",
    },
  ])("removes the already-selected line and date suffix from $id tiles", (fixture) => {
    const [tile] = extractTrafficModalDateTiles(
      createDisruption(fixture.id, fixture.title, fixture.message, [
        { begin: fixture.begin, end: fixture.end },
      ]),
      "Travaux sur le réseau ferroviaire",
    );

    expect(tile.title).toBe(fixture.expectedTitle);
    expect(tile.title).not.toMatch(/^(?:RER|Métro|Tramway|Ligne|Bus)\b/u);
  });

  it("deduplicates the RER D overnight time window", () => {
    const [tile] = extractTrafficModalDateTiles(
      createDisruption(
        "rer-d-corbeil-malesherbes",
        "RER D : Corbeil-Essonnes <> Malesherbes interrompu 29/06-31/07",
        [
          "Période : en semaine de 23h à 05h.",
          "Dates : du lundi 29 juin au vendredi 31 juillet.",
          "Le trafic est interrompu de 23h à 05h.",
          "Un service de bus de remplacement est mis en place.",
        ].join("\n"),
        [{ begin: "20260629T230000", end: "20260801T050000" }],
      ),
      "Travaux sur le réseau ferroviaire",
    );

    expect(tile.title).toBe("Corbeil-Essonnes <> Malesherbes interrompu");
    expect(tile.timeWindows).toEqual([
      {
        start: { hour: 23, minute: 0 },
        end: { hour: 5, minute: 0 },
        untilEndOfService: false,
      },
    ]);
  });

  it("creates an end-only tile from a concrete estimated restart without treating it as a closure start", () => {
    const [tile] = extractTrafficModalDateTiles(
      createDisruption(
        "bus-28-diversion",
        "Bus 28 : Travaux - Arrêt(s) non desservi(s)",
        "La ligne 28 est déviée : les arrêts situés entre Breteuil et Montparnasse ne sont plus desservis. Reprise estimée : samedi 25 juillet 2026, à partir de 03h30. Raison : travaux.",
        [{ begin: "20260722T120000", end: "20260725T033000" }],
      ),
      "Travaux - Arrêt(s) non desservi(s)",
    );

    expect(tile).toMatchObject({
      title: "Les arrêts situés entre Breteuil et Montparnasse ne sont plus desservis.",
      start: undefined,
      timeWindows: [],
    });
    expectLocalDate(tile.end, [2026, 6, 25]);
  });

  it("keeps the explicit years for the cross-year Metro 8 period", () => {
    const [tile] = extractTrafficModalDateTiles(
      createDisruption(
        "metro-8-republique",
        "Métro 8 : Travaux de rénovation - Arrêt non desservi",
        "Du 22 juillet 2026 au 22 avril 2027 inclus, l'arrêt ne sera pas desservi à République en raison de travaux de rénovation.",
        [{ begin: "20260722T000000", end: "20270422T235900" }],
      ),
      "Travaux de rénovation",
    );

    expect(tile.title).toBe("Travaux de rénovation");
    expectLocalDate(tile.start, [2026, 6, 22]);
    expectLocalDate(tile.end, [2027, 3, 22]);
  });

  it("keeps two genuinely different Ligne N periods while removing the line name", () => {
    const tiles = extractTrafficModalDateTiles(
      createDisruption(
        "ligne-n-eole",
        "Ligne N : Paris Montp. <-> Mantes-la-Jolie 13/07-16/08",
        [
          "Période : toute la journée.",
          "Dates : du lundi 13 juillet au dimanche 16 août.",
          "Travaux sur le réseau ferroviaire EOLE du 13/07 au 16/08.",
          "Fermeture permanente de la voie E à Mantes La Jolie pour l’arrivée du RER E, impose une adaptation du plan de transport du 13/07 au 17/08/2026.",
        ].join("\n"),
        [{ begin: "20260713T000000", end: "20260817T235900" }],
      ),
      "Travaux sur le réseau ferroviaire",
    );

    expect(tiles).toHaveLength(2);
    expect(tiles.map((tile) => tile.title)).toEqual([
      "Paris Montp. <-> Mantes-la-Jolie",
      "Fermeture permanente de la voie E à Mantes La Jolie pour l’arrivée du RER E, impose une adaptation du plan de transport",
    ]);
  });

  it("merges the duplicate Ligne H range into its useful interruption tile", () => {
    const tiles = extractTrafficModalDateTiles(
      createDisruption(
        "ligne-h-epinay-ermont",
        "Ligne H : interruption Epinay-Ermont dès 23h35 du 01/06 au 31/07",
        [
          "Arrêt(s) non desservi(s)",
          "Période : en semaine à partir de 23h35",
          "Dates : du 1er juin au 31 juillet",
          "Le trafic est interrompu entre Épinay-Villetaneuse et Ermont-Eaubonne.",
        ].join("\n"),
        [{ begin: "20260601T233500", end: "20260801T020000" }],
      ),
      "Travaux sur le réseau ferroviaire",
    );

    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      title: "Interruption Epinay-Ermont dès 23h35",
      timeWindows: [{ start: { hour: 23, minute: 35 } }],
    });
  });
});

function createDisruption(
  id: string,
  title: string,
  message: string,
  applicationPeriods: TrafficDisruption["applicationPeriods"],
): TrafficDisruption {
  return {
    id,
    title,
    message,
    kind: "works",
    applicationPeriods,
    impactedLineRefs: [],
    impactedStopNames: [],
  };
}

function expectLocalDate(value: Date | undefined, expected: [number, number, number]): void {
  expect(value).toBeInstanceOf(Date);
  expect([value?.getFullYear(), value?.getMonth(), value?.getDate()]).toEqual(expected);
}
