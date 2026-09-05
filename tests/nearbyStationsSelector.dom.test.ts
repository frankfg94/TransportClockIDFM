import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import NearbyStationsSelector from "../src/features/nearby-stations/NearbyStationsSelector.vue";

beforeEach(() => {
  window.localStorage.clear();
});

describe("nearby stations selector", () => {
  it("exposes the address-first flow and a manual fallback", () => {
    const wrapper = mount(NearbyStationsSelector, {
      props: { open: true },
      global: { stubs: { Teleport: true } },
    });

    expect(wrapper.text()).toContain("Ajouter autour d'un lieu");
    expect(wrapper.get('input[type="search"]').attributes("autocomplete")).toBe("street-address");
    expect(wrapper.get('input[type="range"]').attributes("min")).toBe("200");
    expect(wrapper.get('input[type="range"]').attributes("max")).toBe("1500");
    expect(wrapper.text()).toContain("Me localiser");
    expect(wrapper.text()).toContain("Choisir manuellement");
  });
});
