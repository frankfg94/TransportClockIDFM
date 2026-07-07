import { describe, expect, it } from "vitest";
import {
  analyzeTrafficImpacts,
  getDisturbedStations,
  getInterruptedStations,
  getPatternTrafficEdgeKey,
} from "../src/features/service-pattern/trafficImpactAnalysis";
import { normalizePatternStationName } from "../src/features/service-pattern/stationKeys";
import type { TrafficDisruption } from "../src/features/traffic";

describe("traffic impact analysis", () => {
  it("extracts the interrupted section, restart time, and disturbed rest of line", () => {
    const stations = createStations([
      "Porte de Clignancourt",
      "Simplon",
      "Gare du Nord",
      "Strasbourg - Saint-Denis",
      "Reaumur - Sebastopol",
      "Chatelet",
    ]);
    const edges = createSequentialEdges(stations);
    const disruption = createDisruption({
      id: "metro-4-interruption",
      title: "Metro 4 : Incident affectant les voies - Trafic interrompu",
      message:
        "Le trafic est interrompu entre Porte de Clignancourt et Reaumur - Sebastopol et perturbe sur le reste de la ligne en raison d'un incident affectant les voies.\nReprise estimee : 00:00.",
    });

    const analysis = analyzeTrafficImpacts([disruption], stations, edges);
    const interrupted = getInterruptedStations(analysis);
    const disturbed = getDisturbedStations(analysis);

    expect(interrupted).toEqual(
      stations.slice(1, 4).map((station) => station.key),
    );
    expect(interrupted).not.toContain(stations[0].key);
    expect(interrupted).not.toContain(stations[4].key);
    expect(disturbed).toContain(stations[5].key);
    expect(
      analysis.edgeImpacts[getPatternTrafficEdgeKey(edges[0])]?.kind,
    ).toBe("interruption");
    expect(
      analysis.edgeImpacts[getPatternTrafficEdgeKey(edges[4])]?.kind,
    ).toBe("disturbance");
    expect(analysis.segments[0].restartTimeLabel).toBe("00:00");
  });

  it("recognizes no-train and replacement bus variants", () => {
    const stations = createStations(["Station A", "Station B", "Station C"]);
    const disruption = createDisruption({
      id: "no-train",
      title: "Aucun train",
      message:
        "Aucun train entre Station A et Station C. Des bus de remplacement sont mis en place.",
    });

    const analysis = analyzeTrafficImpacts(
      [disruption],
      stations,
      createSequentialEdges(stations),
    );

    expect(getInterruptedStations(analysis)).toEqual([stations[1].key]);
    expect(analysis.segments[0].replacementBus).toBe(true);
  });

  it("keeps the textual end date for interrupted section markers", () => {
    const stations = createStations([
      "Montparnasse Bienvenue",
      "Saint-Placide",
      "Saint-Sulpice",
      "Saint-Germain-des-Pres",
      "Odeon",
      "Saint-Michel",
      "Cite",
      "Chatelet",
      "Les Halles",
    ]);
    const disruption = createDisruption({
      id: "metro-4-works-end-date",
      title:
        "Jusqu'au 24 juillet inclus, le trafic est interrompu entre Montparnasse Bienvenue et Les Halles en raison de travaux.",
    });

    const analysis = analyzeTrafficImpacts(
      [disruption],
      stations,
      createSequentialEdges(stations),
    );

    expect(analysis.segments[0].kind).toBe("interruption");
    expect(analysis.segments[0].endDateLabel).toBe("24 juillet");
    expect(
      analysis.edgeImpacts[
        getPatternTrafficEdgeKey(createSequentialEdges(stations)[0])
      ]?.kind,
    ).toBe("interruption");
  });

  it("uses the application period end date for reprise labels", () => {
    const stations = createStations([
      "Chatillon - Montrouge",
      "Malakoff - Rue Etienne Dolet",
      "Malakoff - Plateau de Vanves",
    ]);
    const disruption = createDisruption({
      id: "metro-13-works-end-date",
      title:
        "Jusqu'au 26 juillet inclus, le trafic est interrompu entre Chatillon - Montrouge et Malakoff - Rue Etienne Dolet en raison de travaux.",
      applicationPeriods: [
        {
          begin: "20260706T044500",
          end: "20260727T043000",
        },
      ],
    });

    const analysis = analyzeTrafficImpacts(
      [disruption],
      stations,
      createSequentialEdges(stations),
    );

    expect(analysis.segments[0].kind).toBe("interruption");
    expect(analysis.segments[0].endDateLabel).toBe("27 juillet");
  });

  it("keeps a non-served station interrupted when the rest of the line is disturbed", () => {
    const stations = createStations([
      "Joinville-le-Pont",
      "Saint-Maur - Creteil",
      "Le Parc de Saint-Maur",
      "Champigny",
      "La Varenne - Chennevieres",
    ]);
    const disruption = createDisruption({
      id: "rer-a-champigny-non-served",
      title: "Arret(s) non desservi(s)",
      message:
        "La gare de Champigny n'est pas desservie jusqu'a 02h45 et le trafic est perturbe sur le reste de la ligne.\nMotif : accident de personne a Champigny.\nRER A : Champigny non desservie",
      impactedStopNames: [],
    });

    const analysis = analyzeTrafficImpacts(
      [disruption],
      stations,
      createSequentialEdges(stations),
    );
    const interrupted = getInterruptedStations(analysis);
    const disturbed = getDisturbedStations(analysis);
    const champignyKey = normalizePatternStationName("Champigny");

    expect(interrupted).toContain(champignyKey);
    expect(disturbed).not.toContain(champignyKey);
    expect(analysis.stationImpacts[champignyKey]?.kind).toBe("interruption");
    expect(analysis.stationImpacts[champignyKey]?.restartTimeLabel).toBe(
      "02:45",
    );
    expect(disturbed).toContain(normalizePatternStationName("Joinville-le-Pont"));
    expect(disturbed).toContain(
      normalizePatternStationName("La Varenne - Chennevieres"),
    );
  });

  it("prefers textual date ranges over daily technical periods", () => {
    const stations = createStations(["Gare de Lyon", "Nation", "Vincennes"]);
    const disruption = createDisruption({
      id: "rer-a-nation-long-works",
      title: "RER A : Nation du 29/06 au 30/08",
      message:
        "Periode : toute la journee. Dates : du lundi 29 juin au dimanche 30 aout. La gare de Nation n'est pas desservie. Elle restera accessible via les lignes de metro. Motif : travaux.",
      applicationPeriods: [
        {
          begin: "20260707T030000",
          end: "20260708T030000",
        },
      ],
      impactedStopNames: [],
    });

    const analysis = analyzeTrafficImpacts(
      [disruption],
      stations,
      createSequentialEdges(stations),
    );
    const nationKey = normalizePatternStationName("Nation");

    expect(analysis.stationImpacts[nationKey]?.kind).toBe("interruption");
    expect(analysis.stationImpacts[nationKey]?.endDateLabel).toBe("31 août");
    expect(analysis.stationImpacts[nationKey]?.endDateLabelSource).toBe("text");
  });

  it("extracts repeated interrupted sections and bidirectional title alternatives", () => {
    const stations = createStations([
      "Port Royal",
      "Denfert-Rochereau",
      "Cite Universitaire",
      "Gentilly",
      "Laplace",
      "Arcueil - Cachan",
      "Bagneux",
      "Bourg-la-Reine",
      "Parc de Sceaux",
      "La Croix de Berny",
      "Sceaux",
      "Fontenay-aux-Roses",
      "Robinson",
    ]);
    const edge = (source: string, target: string) => ({
      source: normalizePatternStationName(source),
      target: normalizePatternStationName(target),
    });
    const edges = [
      edge("Port Royal", "Denfert-Rochereau"),
      edge("Denfert-Rochereau", "Cite Universitaire"),
      edge("Cite Universitaire", "Gentilly"),
      edge("Gentilly", "Laplace"),
      edge("Laplace", "Arcueil - Cachan"),
      edge("Arcueil - Cachan", "Bagneux"),
      edge("Bagneux", "Bourg-la-Reine"),
      edge("Bourg-la-Reine", "Parc de Sceaux"),
      edge("Parc de Sceaux", "La Croix de Berny"),
      edge("Bourg-la-Reine", "Sceaux"),
      edge("Sceaux", "Fontenay-aux-Roses"),
      edge("Fontenay-aux-Roses", "Robinson"),
    ];
    const disruption = createDisruption({
      id: "rer-b-denfert-south",
      title: "RER B : Denfert Rochereau <-> La Croix de Berny/Robinson 27-28/06",
      message:
        "Le trafic est interrompu entre Denfert Rochereau et La Croix de Berny et entre Denfert Rochereau et Robinson.\nUn service de bus de remplacement est mis en place.",
    });

    const analysis = analyzeTrafficImpacts([disruption], stations, edges);
    const interrupted = getInterruptedStations(analysis);

    expect(analysis.segments).toHaveLength(2);
    expect(interrupted).toContain(
      normalizePatternStationName("Cite Universitaire"),
    );
    expect(interrupted).toContain(normalizePatternStationName("Parc de Sceaux"));
    expect(interrupted).toContain(normalizePatternStationName("Sceaux"));
    expect(interrupted).not.toContain(
      normalizePatternStationName("Denfert-Rochereau"),
    );
    expect(interrupted).not.toContain(
      normalizePatternStationName("La Croix de Berny"),
    );
    expect(interrupted).not.toContain(normalizePatternStationName("Robinson"));
    expect(interrupted).not.toContain(normalizePatternStationName("Port Royal"));
    expect(
      analysis.edgeImpacts[
        getPatternTrafficEdgeKey(edge("Bourg-la-Reine", "Parc de Sceaux"))
      ]?.kind,
    ).toBe("interruption");
    expect(
      analysis.edgeImpacts[
        getPatternTrafficEdgeKey(edge("Bourg-la-Reine", "Sceaux"))
      ]?.kind,
    ).toBe("interruption");
    expect(analysis.segments.every((segment) => segment.replacementBus)).toBe(
      true,
    );
  });

  it("matches Pte and fuzzy endpoint names without interrupting endpoints", () => {
    const stations = createStations([
      "Chatillon - Montrouge",
      "Malakoff - Rue Etienne Dolet",
      "Malakoff - Plateau de Vanves",
      "Porte de Vanves",
      "Plaisance",
    ]);
    const edges = createSequentialEdges(stations);
    const disruption = createDisruption({
      id: "metro-13-signalisation",
      title: "Metro 13 : Panne de signalisation - Trafic interrompu",
      message:
        "Trafic interrompu entre Chatilon et Pte de Vanves et perturbe sur le reste de la ligne en raison d'une panne signalisation a Chatillon.\nReprise estimee : 11:00.",
    });

    const analysis = analyzeTrafficImpacts([disruption], stations, edges);
    const interrupted = getInterruptedStations(analysis);
    const disturbed = getDisturbedStations(analysis);

    expect(interrupted).toEqual([
      normalizePatternStationName("Malakoff - Rue Etienne Dolet"),
      normalizePatternStationName("Malakoff - Plateau de Vanves"),
    ]);
    expect(interrupted).not.toContain(
      normalizePatternStationName("Chatillon - Montrouge"),
    );
    expect(interrupted).not.toContain(
      normalizePatternStationName("Porte de Vanves"),
    );
    expect(disturbed).toContain(normalizePatternStationName("Plaisance"));
    expect(
      analysis.edgeImpacts[getPatternTrafficEdgeKey(edges[0])]?.kind,
    ).toBe("interruption");
    expect(
      analysis.edgeImpacts[getPatternTrafficEdgeKey(edges[3])]?.kind,
    ).toBe("disturbance");
    expect(analysis.segments[0].restartTimeLabel).toBe("11:00");

    const prteAnalysis = analyzeTrafficImpacts(
      [
        createDisruption({
          id: "metro-13-prte",
          title: "Trafic interrompu",
          message: "Trafic interrompu entre Chatillon et Prte de Vanves.",
        }),
      ],
      stations,
      edges,
    );

    expect(
      prteAnalysis.edgeImpacts[getPatternTrafficEdgeKey(edges[0])]?.kind,
    ).toBe("interruption");
  });

  it("recognizes disturbed service sections", () => {
    const stations = createStations([
      "Saint-Michel",
      "Luxembourg",
      "Gare du Nord",
    ]);
    const disruption = createDisruption({
      id: "disturbed-service",
      title: "Service perturbe",
      message: "Le service est perturbe entre Saint-Michel et Gare du Nord.",
    });

    const analysis = analyzeTrafficImpacts(
      [disruption],
      stations,
      createSequentialEdges(stations),
    );

    expect(getDisturbedStations(analysis)).toEqual(
      stations.map((station) => station.key),
    );
  });

  it("keeps mixed interrupted and disturbed sections from the same message separate", () => {
    const stations = createStations([
      "Paris-Saint-Lazare",
      "Asnieres-sur-Seine",
      "Argenteuil",
      "Cormeilles-en-Parisis",
      "La Frette-Montigny",
      "Herblay",
      "Conflans-Sainte-Honorine",
      "Triel-sur-Seine",
      "Vaux-sur-Seine",
      "Meulan-Hardricourt",
      "Juziers",
      "Gargenville",
      "Issou - Porcheville",
      "Limay",
      "Mantes Station",
      "Mantes-la-Jolie",
      "Epone Mezieres",
      "Aubergenville-Elisabethville",
      "Les Mureaux",
      "Les Clairieres de Verneuil",
      "Vernouillet-Verneuil",
      "Villennes-sur-Seine",
      "Poissy",
    ]);
    const edge = (source: string, target: string) => ({
      source: normalizePatternStationName(source),
      target: normalizePatternStationName(target),
    });
    const edges = [
      edge("Paris-Saint-Lazare", "Asnieres-sur-Seine"),
      edge("Asnieres-sur-Seine", "Argenteuil"),
      edge("Argenteuil", "Cormeilles-en-Parisis"),
      edge("Cormeilles-en-Parisis", "La Frette-Montigny"),
      edge("La Frette-Montigny", "Herblay"),
      edge("Herblay", "Conflans-Sainte-Honorine"),
      edge("Conflans-Sainte-Honorine", "Triel-sur-Seine"),
      edge("Triel-sur-Seine", "Vaux-sur-Seine"),
      edge("Vaux-sur-Seine", "Meulan-Hardricourt"),
      edge("Meulan-Hardricourt", "Juziers"),
      edge("Juziers", "Gargenville"),
      edge("Gargenville", "Issou - Porcheville"),
      edge("Issou - Porcheville", "Limay"),
      edge("Limay", "Mantes Station"),
      edge("Mantes Station", "Mantes-la-Jolie"),
      edge("Mantes-la-Jolie", "Epone Mezieres"),
      edge("Epone Mezieres", "Aubergenville-Elisabethville"),
      edge("Aubergenville-Elisabethville", "Les Mureaux"),
      edge("Les Mureaux", "Les Clairieres de Verneuil"),
      edge("Les Clairieres de Verneuil", "Vernouillet-Verneuil"),
      edge("Vernouillet-Verneuil", "Villennes-sur-Seine"),
      edge("Villennes-sur-Seine", "Poissy"),
    ];
    const disruption = createDisruption({
      id: "ligne-j-mixed-impact",
      title: "Ligne J : Les Mureaux <-> Poissy trafic interrompu jusqu'au 06/07",
      message:
        "Le trafic est interrompu entre Les Mureaux et Poissy dans les 2 sens jusqu'au 06 juillet 23h00 et fortement perturbé entre Mantes-la-Jolie et Les Mureaux dans les 2 sens. Les voyageurs en provenance de Les Mureaux, Aubergenville-Elisabethville, Epône Mézières et Mantes doivent rejoindre Mantes-la-Jolie par les navettes ferroviaires mises en place afin d'emprunter un train de l'axe Paris-Saint-Lazare / Mantes-la-Jolie via Conflans. Nous vous déconseillons d'emprunter les bus des lignes régulières pour le parcours Les Mureaux / Poissy. Les voyageurs des gares non desservies de Villennes-sur-Seine, Vernouillet-Verneuil, Les Clairières de Verneuil sont invités à rejoindre la gare la plus proche de l'axe Paris-Saint-Lazare / Mantes-la-Jolie via Conflans.",
    });

    const analysis = analyzeTrafficImpacts([disruption], stations, edges);
    const interrupted = getInterruptedStations(analysis);
    const disturbed = getDisturbedStations(analysis);

    expect(analysis.segments).toHaveLength(2);
    expect(interrupted).toEqual([
      normalizePatternStationName("Les Clairieres de Verneuil"),
      normalizePatternStationName("Vernouillet-Verneuil"),
      normalizePatternStationName("Villennes-sur-Seine"),
    ]);
    expect(interrupted).not.toContain(normalizePatternStationName("Les Mureaux"));
    expect(interrupted).not.toContain(normalizePatternStationName("Poissy"));
    expect(interrupted).not.toContain(
      normalizePatternStationName("Cormeilles-en-Parisis"),
    );
    expect(disturbed).toEqual([
      normalizePatternStationName("Mantes-la-Jolie"),
      normalizePatternStationName("Epone Mezieres"),
      normalizePatternStationName("Aubergenville-Elisabethville"),
      normalizePatternStationName("Les Mureaux"),
    ]);
    expect(disturbed).not.toContain(
      normalizePatternStationName("Cormeilles-en-Parisis"),
    );
    expect(
      analysis.edgeImpacts[
        getPatternTrafficEdgeKey(edge("Les Mureaux", "Les Clairieres de Verneuil"))
      ]?.kind,
    ).toBe("interruption");
    expect(
      analysis.edgeImpacts[
        getPatternTrafficEdgeKey(edge("Aubergenville-Elisabethville", "Les Mureaux"))
      ]?.kind,
    ).toBe("disturbance");
    expect(analysis.segments.every((segment) => !segment.replacementBus)).toBe(
      true,
    );
  });

  it("extracts de-a and depuis-jusqua section variants", () => {
    const stations = createStations(["Station A", "Station B", "Station C"]);
    const edges = createSequentialEdges(stations);

    const deAAnalysis = analyzeTrafficImpacts(
      [
        createDisruption({
          id: "de-a",
          title: "Trafic interrompu",
          message: "Le trafic est interrompu de Station A à Station C.",
        }),
      ],
      stations,
      edges,
    );
    const depuisAnalysis = analyzeTrafficImpacts(
      [
        createDisruption({
          id: "depuis-jusqua",
          title: "Trafic interrompu",
          message:
            "Le trafic est interrompu depuis Station A jusqu’à Station C.",
        }),
      ],
      stations,
      edges,
    );

    expect(getInterruptedStations(deAAnalysis)).toEqual([stations[1].key]);
    expect(getInterruptedStations(depuisAnalysis)).toEqual([stations[1].key]);
  });

  it("matches station names without accents or exact punctuation", () => {
    const stations = createStations([
      "Porte de Clignancourt",
      "Reaumur - Sebastopol",
    ]);
    const disruption = createDisruption({
      id: "accentless",
      title: "Trafic interrompu",
      message:
        "Trafic interrompu entre Porte de Clignancourt et Réaumur Sébastopol.",
    });

    const analysis = analyzeTrafficImpacts(
      [disruption],
      stations,
      createSequentialEdges(stations),
    );

    expect(getInterruptedStations(analysis)).toEqual([]);
    expect(
      analysis.edgeImpacts[
        getPatternTrafficEdgeKey(createSequentialEdges(stations)[0])
      ]?.kind,
    ).toBe("interruption");
  });

  it("falls back to impacted stop names when no section text is available", () => {
    const stations = createStations(["Station A", "Station B", "Station C"]);
    const disruption = createDisruption({
      id: "impacted-stops",
      title: "Service reduit",
      message: "Service reduit sur plusieurs stations.",
      impactedStopNames: ["Station A", "Station C"],
    });

    const analysis = analyzeTrafficImpacts(
      [disruption],
      stations,
      createSequentialEdges(stations),
    );

    expect(getDisturbedStations(analysis)).toEqual(
      stations.map((station) => station.key),
    );
  });
});

function createStations(labels: string[]) {
  return labels.map((label) => ({
    key: normalizePatternStationName(label),
    label,
  }));
}

function createSequentialEdges(stations: ReturnType<typeof createStations>) {
  return stations.slice(0, -1).map((station, index) => ({
    source: station.key,
    target: stations[index + 1].key,
  }));
}

function createDisruption(
  patch: Partial<TrafficDisruption> & Pick<TrafficDisruption, "id" | "title">,
): TrafficDisruption {
  return {
    kind: "incident",
    applicationPeriods: [],
    impactedLineRefs: ["line:IDFM:C01389"],
    impactedStopNames: [],
    ...patch,
  };
}
