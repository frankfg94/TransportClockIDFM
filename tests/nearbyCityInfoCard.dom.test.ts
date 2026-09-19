import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import NearbyCityInfoCard from "../src/features/nearby-stations/NearbyCityInfoCard.vue";

function createMediaQueryList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "(max-width: 680px)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
}

const props = {
  ariaLabel: "Informations sur Fixture",
  cityName: "Fixture",
  collapseLabel: "Réduire les informations communales",
  expandLabel: "Afficher les informations communales",
  eyebrow: "Informations communales",
  items: [{ label: "Habitants", value: "1 234" }],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NearbyCityInfoCard", () => {
  it("starts expanded outside mobile and replaces its content with a circle when collapsed", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(createMediaQueryList(false));
    const wrapper = mount(NearbyCityInfoCard, { props });

    try {
      const card = wrapper.get("[data-testid='nearby-city-info-card']");
      expect(card.classes()).not.toContain("nearby-city-info-card--collapsed");
      expect(card.get("[data-testid='nearby-city-info-card-collapse']").attributes("aria-expanded")).toBe("true");
      expect(card.get(".nearby-city-info-card__facts").text()).toContain("1 234");

      await card.get("[data-testid='nearby-city-info-card-collapse']").trigger("click");

      expect(card.classes()).toContain("nearby-city-info-card--collapsed");
      expect(card.find(".nearby-city-info-card__facts").exists()).toBe(false);
      expect(card.get("[data-testid='nearby-city-info-card-expand']").attributes("aria-expanded")).toBe("false");
      expect(card.find("[data-testid='nearby-city-info-card-expand'] svg").exists()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });

  it("starts collapsed on mobile and can be reopened", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(createMediaQueryList(true));
    const wrapper = mount(NearbyCityInfoCard, { props });
    await nextTick();

    try {
      const card = wrapper.get("[data-testid='nearby-city-info-card']");
      expect(card.classes()).toContain("nearby-city-info-card--collapsed");
      expect(card.get("[data-testid='nearby-city-info-card-expand']").attributes("aria-label")).toBe(
        "Afficher les informations communales",
      );

      await card.get("[data-testid='nearby-city-info-card-expand']").trigger("click");

      expect(card.classes()).not.toContain("nearby-city-info-card--collapsed");
      expect(card.find("[data-testid='nearby-city-info-card-collapse'] svg").exists()).toBe(true);
      expect(card.get(".nearby-city-info-card__facts").text()).toContain("Habitants");
    } finally {
      wrapper.unmount();
    }
  });

  it("emits an action for the city ranking loupe", async () => {
    const wrapper = mount(NearbyCityInfoCard, {
      props: {
        ...props,
        items: [{ label: "Commerces", value: "42", action: "places-ranking", actionLabel: "Voir le classement" }],
      },
    });
    await wrapper.get("[data-city-info-action='places-ranking']").trigger("click");
    expect(wrapper.emitted("item-action")).toEqual([["places-ranking"]]);
    wrapper.unmount();
  });
});
