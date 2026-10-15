import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NearbyNeighborhoodScoreCard from "../src/features/nearby-stations/NearbyNeighborhoodScoreCard.vue";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import { buildNeighborhoodScore, type NeighborhoodFact } from "../src/features/nearby-stations/neighborhood";

describe("NearbyNeighborhoodScoreCard", () => {
  it("names branches in the summary, category and tooltip, with neutral context beyond 30 minutes", () => {
    const result = buildNeighborhoodScore({ places: [], placesLoaded: false, stations: [], stationsLoaded: true });
    const fact: NeighborhoodFact = { id: "section", kind: "transportLineNearby", category: "transport", polarity: "neutral",
      contributionWeight: 0, family: "transport-proximity:section", priority: 0,
      transportSection: { id: "branch:fixture", kind: "branch", label: "Terminus test" },
      labelKey: "nearbyStations.neighborhoodScore.facts.transportStationNearby.label",
      labelValues: { line: "RER X", station: "Gare test", minutes: 34, via: " via Bus Y" },
      tooltipKey: "nearbyStations.neighborhoodScore.facts.transportLineNearby.tooltip",
      tooltipValues: { line: "RER X", minutes: 34, via: " via Bus Y", meters: 2000 },
      evidence: { proof: "direct", observedAt: 1, ruleKey: "nearbyStations.neighborhoodScore.rules.transportAccessContext", ruleValues: { maximum: 30 } } };
    result.neutralFacts = [fact];
    result.negativeFacts = [];
    result.categories.find(category => category.id === "transport")!.negativeFacts = [];
    result.categories.find(category => category.id === "transport")!.neutralFacts = [fact];
    const wrapper = mount(NearbyNeighborhoodScoreCard, { props: { result, directoryUrl: "/nearby-stations" }, global: { stubs: { NuxtLink: true } } });
    expect(wrapper.get(".nearby-neighborhood-score-card__summary-fact").text()).toContain("RER X — branche Terminus test");
    expect(wrapper.get(".nearby-neighborhood-score-fact__marker").text()).toBe("•");
    expect(wrapper.text()).toContain("Cet accès dépasse 30 min");
    expect(wrapper.text()).toContain("sans effet sur la note");
    expect(wrapper.text().match(/RER X — branche Terminus test/gu)!.length).toBeGreaterThanOrEqual(3);
    wrapper.unmount();
  });
  it("renders named spinners inside the transport category, including before its data arrives", () => {
    const result = buildNeighborhoodScore({ places: [], placesLoaded: false, stations: [], stationsLoaded: false, generatedAt: 1 });
    const wrapper = mount(NearbyNeighborhoodScoreCard, { props: { result, directoryUrl: "/nearby-stations",
      transportLoadingTasks: [{ id: "heavyAccess", labelKey: "nearbyStations.neighborhoodScore.transportTasks.heavyAccess" }] },
      global: { stubs: { NuxtLink: true } } });
    const categories = wrapper.findAll(".nearby-neighborhood-score-card__category");
    const transport = categories.find(category => category.find("h3").text() === "Transports")!;
    expect(transport.find("[data-transport-task='heavyAccess'] [data-testid='spinner']").exists()).toBe(true);
    expect(transport.text()).toContain("Chargement des temps d’accès");
    expect(categories.filter(category => category.find(".transport-loading").exists())).toHaveLength(1);
    wrapper.unmount();
  });
  it("shows each independent bus access and its own duration in the tooltip", () => {
    const result = buildNeighborhoodScore({ places: [], placesLoaded: false, stations: [], stationsLoaded: true, generatedAt: 1 });
    const journey = { source: "gtfs" as const, durationSeconds: 1500, sections: [{ type: "walking", durationSeconds: 600, timingSource: "schedule" as const }, { type: "public_transport", fromName: "Arrêt proche", durationSeconds: 900, lineCode: "express", lineMode: "BUS" as const }] };
    const alternate = { ...journey, durationSeconds: 1800, sections: [{ type: "walking", durationSeconds: 780, timingSource: "estimated" as const }, { type: "waiting", durationSeconds: 120 }, { type: "public_transport", fromName: "Arrêt éloigné", durationSeconds: 900, lineCode: "ordinary", lineMode: "BUS" as const }] };
    const tram = { ...journey, durationSeconds: 1020, sections: [{ type: "walking", durationSeconds: 120, timingSource: "estimated" as const },
      { type: "public_transport", fromName: "Arrêt tram", durationSeconds: 900, lineCode: "TA", lineMode: "TRAM" as const }] };
    const fact: NeighborhoodFact = { id: "bus-options", kind: "transportLineNearby", category: "transport", polarity: "positive", family: "transport-proximity:options", priority: 6,
      label: "RER accessible via BUS express, BUS ordinary", evidence: { proof: "direct", observedAt: 1 },
      travel: { journey, routes: [{ line: "BUS express", accessMinutes: 23, journey }, { line: "BUS ordinary", accessMinutes: 28, journey: alternate },
        { line: "Tramway TA", accessMinutes: 17, journey: tram }] } };
    result.categories.find(category => category.id === "transport")!.positiveFacts = [fact];
    const wrapper = mount(NearbyNeighborhoodScoreCard, { props: { result, directoryUrl: "/nearby-stations" }, global: { stubs: { NuxtLink: { template: "<a><slot /></a>" } } } });
    const options = wrapper.findAll("[data-testid='nearby-transport-access-option']");
    expect(options[0]!.text()).toContain("Marche 10 min + bus 15 min · Arrêt proche");
    expect(options[1]!.text()).toContain("Marche estimée ≈ 13 min + bus 15 min · Arrêt éloigné");
    expect(options[1]!.text()).toContain("Durée totale 30 min · attente initiale retirée 2 min");
    expect(options[2]!.text()).toContain("Marche estimée ≈ 2 min + trajet 15 min · Arrêt tram");
    expect(wrapper.text()).toContain("calculée à vol d’oiseau");
    expect(wrapper.text()).toContain("Premier embarquement : Arrêt proche");
    expect(wrapper.text()).toContain("Options d’accès à cette gare");
    wrapper.unmount();
  });
  it("shows the half-positive marker in the summary and the category", () => {
    const result = buildNeighborhoodScore({ places: [], placesLoaded: false, stations: [], stationsLoaded: true, generatedAt: 1 });
    const fact: NeighborhoodFact = { id: "reduced-access", kind: "transportLineNearby", category: "transport", polarity: "positive", family: "transport-proximity:fixture", priority: 6,
      contributionWeight: 0.5, label: "Accès calculé au transport", tooltip: "Bonus réduit", evidence: { proof: "direct", observedAt: 1 } };
    result.positiveFacts = [fact];
    result.categories.find(category => category.id === "transport")!.positiveFacts = [fact];
    const wrapper = mount(NearbyNeighborhoodScoreCard, { props: { result, directoryUrl: "/nearby-stations" }, global: { stubs: { NuxtLink: { template: "<a><slot /></a>" } } } });
    expect(wrapper.get(".nearby-neighborhood-score-card__summary-fact").text()).toContain("½+");
    expect(wrapper.get(".nearby-neighborhood-score-fact__marker").text()).toBe("½+");
    wrapper.unmount();
  });
  it("shows a deterministic score and exposes source/rule/proof on focus or tap", async () => {
    const result = buildNeighborhoodScore({
      places: [{
        id: "place:supermarket",
        name: "Marché test",
        lon: 2.35,
        lat: 48.85,
        category: "shop",
        kind: "supermarket",
        distanceMeters: 240,
      }],
      placesLoaded: true,
      stations: [],
      stationsLoaded: false,
      generatedAt: 1,
    });
    result.categories.find((category) => category.id === "transport")!.neutralFacts.push({
      id: "transport-quality",
      kind: "transportServiceQuality",
      category: "transport",
      polarity: "positive",
      family: "transport-service-quality",
      priority: 1,
      label: "Fiabilité des transports proches : 90/100",
      tooltip: "Qualité de service documentée",
      action: { labelKey: "nearbyStations.neighborhoodScore.facts.transportServiceQuality.openRanking", href: "/lines-ranking" },
      transportReliabilityLines: [
        { lineId: "metro:1", lineName: "1", mode: "METRO", reliabilityScore: 94, labelKey: "very-reliable" },
        { lineId: "metro:4", lineName: "4", mode: "METRO", reliabilityScore: 71, labelKey: "fairly-reliable" },
        { lineId: "rer:a", lineName: "A", mode: "RER", reliabilityScore: 88, labelKey: "reliable" },
      ],
      evidence: { proof: "derived", sourceName: "IDFM", observedAt: 1, value: 90, unit: "/100" },
    });
    const wrapper = mount(NearbyNeighborhoodScoreCard, {
      props: { result, directoryUrl: "/nearby-stations?annuary=" },
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: "<a :href='to'><slot /></a>",
          },
        },
      },
    });

    expect(wrapper.get("[data-testid='neighborhood-score']").text()).toContain("/");
    const fact = wrapper.find(".nearby-neighborhood-score-fact__trigger");
    expect(fact.exists()).toBe(true);
    await fact.trigger("click");

    expect(wrapper.find(".nearby-neighborhood-score-fact--open").exists()).toBe(true);
    expect(wrapper.find(".nearby-neighborhood-score-fact__tooltip").text()).toContain("Source");
    expect(wrapper.find(".nearby-neighborhood-score-fact__tooltip").text()).toContain("Règle");
    expect(wrapper.find(".nearby-neighborhood-score-fact__tooltip").text()).toContain("Niveau de preuve");
    const qualityTrigger = wrapper.findAll(".nearby-neighborhood-score-fact__trigger").find((candidate) => candidate.text().includes("Fiabilité"));
    expect(qualityTrigger).toBeDefined();
    await qualityTrigger!.trigger("click");
    const metroLines = wrapper.get("[data-testid='nearby-transport-reliability-mode-METRO']")
      .findAll("[data-testid='nearby-transport-reliability-line']");
    expect(metroLines.map((line) => line.find(".nearby-neighborhood-score-fact__transport-line-score").text()))
      .toEqual(["94 %", "71 %"]);
    const rerLines = wrapper.get("[data-testid='nearby-transport-reliability-mode-RER']")
      .findAll("[data-testid='nearby-transport-reliability-line']");
    expect(rerLines.map((line) => line.find(".nearby-neighborhood-score-fact__transport-line-name").text()))
      .toEqual(["Ligne A"]);
    expect(wrapper.get(".nearby-neighborhood-score-fact__action").text()).toContain("Voir le classement");
    await wrapper.get(".nearby-neighborhood-score-fact__action").trigger("click");
    wrapper.unmount();
  });

  it("lists every stacked tennis court from the closest to the farthest in the tooltip", async () => {
    const courts: NearbyPlace[] = [3, 6].map((_, index) => ({
      id: `stack-court-${index}`,
      name: `Court ${index}`,
      lon: 2.35,
      lat: 48.85,
      category: "attraction",
      kind: "tennis",
      distanceMeters: 200 + index * 60,
    }));
    const walkingRoutes = Object.fromEntries(courts.map((court, index) => [court.id, {
      provider: "openrouteservice",
      distanceMeters: 200 + index * 60,
      durationSeconds: (index === 0 ? 3 : 6) * 60,
    }]));
    const result = buildNeighborhoodScore({
      places: courts,
      placesLoaded: true,
      walkingRoutes,
      stations: [],
      stationsLoaded: false,
      generatedAt: 1,
    });
    const wrapper = mount(NearbyNeighborhoodScoreCard, {
      props: { result, directoryUrl: "/nearby-stations?annuary=" },
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: "<a :href='to'><slot /></a>",
          },
        },
      },
    });

    const stack = wrapper.findAll(".nearby-neighborhood-score-fact")
      .find((candidate) => candidate.get(".nearby-neighborhood-score-fact__trigger").text().includes("terrains de tennis"));
    expect(stack).toBeDefined();
    await stack!.get(".nearby-neighborhood-score-fact__trigger").trigger("click");

    expect(stack!.findAll(".nearby-neighborhood-score-fact__places li").map((item) => item.text()))
      .toEqual(["Court 0 · 3 min à pied · 200 m", "Court 1 · 6 min à pied · 260 m"]);
    wrapper.unmount();
  });

  it("renders neutral category facts even when a category has no score", () => {
    const result = buildNeighborhoodScore({
      places: [],
      placesLoaded: false,
      stations: [],
      stationsLoaded: false,
      generatedAt: 1,
    });
    const neutralFact: NeighborhoodFact = {
      id: "living-neutral",
      kind: "external",
      category: "living-environment",
      polarity: "neutral",
      family: "air",
      priority: 1,
      label: "Qualité de l’air communale : repère descriptif",
      evidence: {
        proof: "derived",
        observedAt: 1,
        value: 5,
        unit: "/10",
        geography: { level: "commune", name: "Fixture" },
      },
    };
    const category = result.categories.find((item) => item.id === "living-environment");
    expect(category).toBeDefined();
    category!.available = false;
    category!.neutralFacts = [neutralFact];

    const wrapper = mount(NearbyNeighborhoodScoreCard, {
      props: { result, directoryUrl: "/nearby-stations" },
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: "<a :href='to'><slot /></a>",
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Qualité de l’air communale : repère descriptif");
    expect(wrapper.find(".nearby-neighborhood-score-card__fact-group--neutral").exists()).toBe(true);
    expect(wrapper.find(".nearby-neighborhood-score-fact--neutral .nearby-neighborhood-score-fact__marker").text()).toBe("•");
    wrapper.unmount();
  });

  it("renders an unavailable major-station time with the neutral gray marker", () => {
    const result = buildNeighborhoodScore({
      places: [],
      placesLoaded: false,
      stations: [],
      stationsLoaded: true,
      journeyBenchmarksLoading: false,
      journeyBenchmarks: [{
        id: "gare-du-nord",
        label: "Gare du Nord",
        journeys: [],
        status: "unavailable",
      }],
      generatedAt: 1,
    });
    const wrapper = mount(NearbyNeighborhoodScoreCard, {
      props: { result, directoryUrl: "/nearby-stations" },
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: "<a :href='to'><slot /></a>",
          },
        },
      },
    });

    const stationFact = wrapper.findAll(".nearby-neighborhood-score-fact--neutral")
      .find((fact) => fact.text().includes("Temps vers Gare du Nord indisponible"));
    expect(stationFact).toBeDefined();
    expect(stationFact!.get(".nearby-neighborhood-score-fact__marker").text()).toBe("•");
    for (const station of ["Gare Montparnasse", "Gare Saint-Lazare", "Gare de Lyon", "Gare du Nord"]) {
      expect(wrapper.text()).toContain(`Temps vers ${station} indisponible`);
    }
    wrapper.unmount();
  });

  it("splits positive facts into two columns only when the category has no negative fact", () => {
    const result = buildNeighborhoodScore({
      places: [{
        id: "place:supermarket",
        name: "Marché test",
        lon: 2.35,
        lat: 48.85,
        category: "shop",
        kind: "supermarket",
        distanceMeters: 240,
      }],
      placesLoaded: true,
      stations: [],
      stationsLoaded: false,
      generatedAt: 1,
    });
    const categoryIndex = result.categories.findIndex((category) => category.id === "daily-life");
    const category = result.categories[categoryIndex]!;
    expect(category.positiveFacts.length).toBeGreaterThan(0);
    category.negativeFacts = [];
    category.neutralFacts = [];

    const positiveOnlyWrapper = mount(NearbyNeighborhoodScoreCard, {
      props: { result, directoryUrl: "/nearby-stations" },
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: "<a :href='to'><slot /></a>",
          },
        },
      },
    });
    expect(positiveOnlyWrapper.findAll(".nearby-neighborhood-score-card__category")[categoryIndex]
      ?.find(".nearby-neighborhood-score-card__fact-group--positive-only").exists()).toBe(true);
    positiveOnlyWrapper.unmount();

    const positiveFact = category.positiveFacts[0]!;
    category.negativeFacts = [{
      ...positiveFact,
      id: "negative-fixture",
      polarity: "negative",
    } satisfies NeighborhoodFact];
    const splitWrapper = mount(NearbyNeighborhoodScoreCard, {
      props: { result, directoryUrl: "/nearby-stations" },
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: "<a :href='to'><slot /></a>",
          },
        },
      },
    });
    expect(splitWrapper.findAll(".nearby-neighborhood-score-card__category")[categoryIndex]
      ?.find(".nearby-neighborhood-score-card__fact-group--positive-only").exists()).toBe(false);
    splitWrapper.unmount();
  });

  it("acknowledges a saved workplace in the limitations", () => {
    const result = buildNeighborhoodScore({
      places: [],
      placesLoaded: false,
      stations: [],
      stationsLoaded: false,
      generatedAt: 1,
    });
    const wrapper = mount(NearbyNeighborhoodScoreCard, {
      props: {
        result,
        directoryUrl: "/nearby-stations",
        workplaceLabel: "Mon bureau",
      },
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: "<a :href='to'><slot /></a>",
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Lieu de travail enregistré : Mon bureau");
    expect(wrapper.text()).not.toContain("aucune adresse professionnelle n’est connue");
    wrapper.unmount();
  });
});
