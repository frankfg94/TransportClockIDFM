import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import NearbyPlacesRankingModal from "../src/features/nearby-stations/NearbyPlacesRankingModal.vue";
import type { PlacesRankingDocument } from "../src/services/places/compiledPlaces";

const ranking: PlacesRankingDocument = {
  schemaVersion: 1,
  datasetId: "osm-places-by-commune",
  generatedAt: "2026-09-14T00:00:00.000Z",
  scope: "idf",
  categories: ["sports-leisure", "commerce", "security", "health", "culture"],
  cityCount: 2,
  cities: [{
    code: "92001",
    name: "Fixture",
    departmentCode: "92",
    categories: {
      "sports-leisure": { count: 18, rank: 1, topPercent: 50, scorePercent: 100, departmentRank: 1, departmentCityCount: 2, departmentTopPercent: 50 },
      commerce: { count: 42, rank: 1, topPercent: 50, scorePercent: 100, departmentRank: 1, departmentCityCount: 2, departmentTopPercent: 50 },
      security: { count: 4, rank: 2, topPercent: 100, scorePercent: 0, departmentRank: 2, departmentCityCount: 2, departmentTopPercent: 100 },
      health: { count: 12, rank: 1, topPercent: 50, scorePercent: 100, departmentRank: 1, departmentCityCount: 2, departmentTopPercent: 50 },
      culture: { count: 7, rank: 2, topPercent: 100, scorePercent: 0, departmentRank: 2, departmentCityCount: 2, departmentTopPercent: 100 },
    },
  }, {
    code: "92002",
    name: "Autre ville",
    departmentCode: "92",
    categories: {
      "sports-leisure": { count: 9, rank: 2, topPercent: 100, scorePercent: 0, departmentRank: 2, departmentCityCount: 2, departmentTopPercent: 100 },
      commerce: { count: 11, rank: 2, topPercent: 100, scorePercent: 0, departmentRank: 2, departmentCityCount: 2, departmentTopPercent: 100 },
      security: { count: 6, rank: 1, topPercent: 50, scorePercent: 100, departmentRank: 1, departmentCityCount: 2, departmentTopPercent: 50 },
      health: { count: 3, rank: 2, topPercent: 100, scorePercent: 0, departmentRank: 2, departmentCityCount: 2, departmentTopPercent: 100 },
      culture: { count: 10, rank: 1, topPercent: 50, scorePercent: 100, departmentRank: 1, departmentCityCount: 2, departmentTopPercent: 50 },
    },
  }],
  departmentLeaderboards: {
    "sports-leisure": [
      { departmentCode: "92", cityCount: 2, placeCount: 27, rank: 1, topPercent: 50 },
      { departmentCode: "75", cityCount: 1, placeCount: 19, rank: 2, topPercent: 100 },
    ],
    commerce: [
      { departmentCode: "92", cityCount: 2, placeCount: 53, rank: 1, topPercent: 50 },
      { departmentCode: "75", cityCount: 1, placeCount: 21, rank: 2, topPercent: 100 },
    ],
    security: [
      { departmentCode: "92", cityCount: 2, placeCount: 10, rank: 1, topPercent: 50 },
      { departmentCode: "75", cityCount: 1, placeCount: 8, rank: 2, topPercent: 100 },
    ],
    health: [
      { departmentCode: "92", cityCount: 2, placeCount: 15, rank: 1, topPercent: 50 },
      { departmentCode: "75", cityCount: 1, placeCount: 11, rank: 2, topPercent: 100 },
    ],
    culture: [
      { departmentCode: "92", cityCount: 2, placeCount: 17, rank: 1, topPercent: 50 },
      { departmentCode: "75", cityCount: 1, placeCount: 13, rank: 2, topPercent: 100 },
    ],
  },
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("NearbyPlacesRankingModal", () => {
  it("shows the five compiled IDF progress bars and closes from the loupe ranking view", async () => {
    const wrapper = mount(NearbyPlacesRankingModal, {
      attachTo: document.body,
      props: {
        open: true,
        cityCode: "92001",
        cityName: "Fixture",
        ranking,
      },
      global: {
        stubs: { Teleport: true },
      },
    });

    expect(wrapper.get("[role='dialog']").text()).toContain("Fixture");
    expect(wrapper.findAll("[role='progressbar']")).toHaveLength(5);
    expect(wrapper.text()).toContain("Top 50 % en IDF");
    expect(wrapper.text()).toContain("42");

    await wrapper.get(".nearby-places-ranking-modal__close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("keeps the two leaderboard tabs open after clicking the tooltip and closes outside", async () => {
    const wrapper = mount(NearbyPlacesRankingModal, {
      attachTo: document.body,
      props: {
        open: true,
        cityCode: "92001",
        cityName: "Fixture",
        ranking,
      },
      global: {
        stubs: { Teleport: true },
      },
    });

    try {
      const leaderboard = wrapper.get(".nearby-places-ranking-modal__leaderboard");
      const trigger = leaderboard.get(".nearby-places-ranking-modal__leaderboard-trigger");
      await leaderboard.trigger("mouseenter");
      const tooltip = wrapper.get(".nearby-places-ranking-modal__leaderboard-tooltip");
      expect(tooltip.text()).toContain("Classement des villes d’Île-de-France");
      const cityPanel = tooltip.get(".nearby-places-ranking-modal__leaderboard-panel--cities");
      expect(cityPanel.text()).toContain("Fixture");
      expect(cityPanel.text()).toContain("Autre ville");
      expect(cityPanel.text()).not.toContain("Département 92");

      await tooltip.trigger("click");
      await leaderboard.trigger("mouseleave");
      expect(wrapper.find(".nearby-places-ranking-modal__leaderboard-tooltip").exists()).toBe(true);
      expect(document.activeElement).toBe(tooltip.element);

      await tooltip.findAll("[role='tab']")[1]!.trigger("click");
      await nextTick();
      const updatedTooltip = wrapper.get(".nearby-places-ranking-modal__leaderboard-tooltip");
      expect(updatedTooltip.get("[role='tab'][aria-selected='true']").text()).toBe("Classement des départements");
      expect(updatedTooltip.find(".nearby-places-ranking-modal__leaderboard-track--departments").exists()).toBe(true);
      expect(updatedTooltip.text()).toContain("Département 92");

      document.dispatchEvent(new Event("pointerdown"));
      await nextTick();
      expect(wrapper.find(".nearby-places-ranking-modal__leaderboard-tooltip").exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps every gapless IDF bar readable instead of scaling it against the densest commune", async () => {
    const wrapper = mount(NearbyPlacesRankingModal, {
      attachTo: document.body,
      props: {
        open: true,
        cityCode: "92001",
        cityName: "Fixture",
        ranking,
      },
      global: {
        stubs: { Teleport: true },
      },
    });

    const fixtureBucket = {
      count: 0,
      rank: 1,
      topPercent: 100,
      scorePercent: 0,
      departmentRank: 1,
      departmentCityCount: 1,
      departmentTopPercent: 100,
    };
    const idfRanking: PlacesRankingDocument = {
      schemaVersion: 1,
      datasetId: "osm-places-by-commune",
      generatedAt: "2026-09-14T00:00:00.000Z",
      scope: "idf",
      categories: ["sports-leisure", "commerce", "security", "health", "culture"],
      cityCount: 3,
      cities: [{
        code: "92001",
        name: "Fixture",
        departmentCode: "92",
        categories: {
          "sports-leisure": { ...fixtureBucket, count: 20 },
          commerce: { ...fixtureBucket, count: 10 },
          security: { ...fixtureBucket, count: 1 },
          health: { ...fixtureBucket, count: 5 },
          culture: { ...fixtureBucket, count: 4 },
        },
      }, {
        code: "92002",
        name: "Commune dense",
        departmentCode: "92",
        categories: {
          "sports-leisure": { ...fixtureBucket, count: 3 },
          commerce: { ...fixtureBucket, count: 30 },
          security: { ...fixtureBucket, count: 3 },
          health: { ...fixtureBucket, count: 1 },
          culture: { ...fixtureBucket, count: 20 },
        },
      }, {
        code: "92003",
        name: "Grande commune",
        departmentCode: "92",
        categories: {
          "sports-leisure": { ...fixtureBucket, count: 4000 },
          commerce: { ...fixtureBucket, count: 5000 },
          security: { ...fixtureBucket, count: 2 },
          health: { ...fixtureBucket, count: 500 },
          culture: { ...fixtureBucket, count: 400 },
        },
      }],
    };

    try {
      await wrapper.setProps({ ranking: idfRanking, populationByCity: { "92001": 4_000, "92002": 40, "92003": 1_000_000 } });
      await nextTick();

      // 20 places for 4 000 residents is 5 ‰, second of three communes, so the
      // gauge is half full. Scaled against the 75 ‰ of the 40-resident commune
      // it would have collapsed to a 7 % dot.
      const bars = wrapper.findAll("[role='progressbar']");
      expect(bars).toHaveLength(5);
      expect(bars[0]!.attributes("aria-valuenow")).toBe("50");
      expect((bars[0]!.get(".nearby-places-ranking-modal__bar-fill").element as HTMLElement).style.width).toBe("50%");

      // Every category answers its own per-1 000-residents question: the densest
      // commune leads commerce and security, the big commune leads health, and
      // the tiny 40-resident commune never flattens the other gauges.
      expect(bars.map((bar) => bar.attributes("aria-valuenow"))).toEqual(["50", "0", "50", "50", "50"]);
      expect(bars[1]!.attributes("aria-valuenow")).toBe("0");
      expect((bars[1]!.get(".nearby-places-ranking-modal__bar-fill").element as HTMLElement).style.width).toBe("2%");
      expect(wrapper.text()).toContain("Top 67 % en IDF");
      expect(wrapper.text()).toContain("5,00 lieux / 1 000 habitants");
    } finally {
      wrapper.unmount();
    }
  });
});
