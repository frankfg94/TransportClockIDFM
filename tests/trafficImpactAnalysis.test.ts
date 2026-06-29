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
