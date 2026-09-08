import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NearbyNeighborhoodScoreCard from "../src/features/nearby-stations/NearbyNeighborhoodScoreCard.vue";
import { buildNeighborhoodScore, type NeighborhoodFact } from "../src/features/nearby-stations/neighborhoodScore";

describe("NearbyNeighborhoodScoreCard", () => {
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
    expect(wrapper.get(".nearby-neighborhood-score-fact__action").text()).toContain("Voir le classement");
    await wrapper.get(".nearby-neighborhood-score-fact__action").trigger("click");
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
});
