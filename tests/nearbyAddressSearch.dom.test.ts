import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import NearbyAddressSearch from "../src/features/nearby-stations/NearbyAddressSearch.vue";

const points = [
  { id: "place-1", label: "Châtelet-les-Halles", type: "place", lon: 2.347, lat: 48.862 },
  { id: "address-1", label: "9 rue Chateaubriand, 92320", type: "address", lon: 2.28, lat: 48.81 },
] as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("NearbyAddressSearch place autocomplete", () => {
  it("humanizes a coordinate-only origin without changing its exact point", async () => {
    const point = {
      id: "device-origin",
      label: "48.75773, 2.36411",
      provider: "device",
      type: "address" as const,
      lon: 2.36411,
      lat: 48.75773,
    };
    const reverseGeocode = vi.fn().mockResolvedValue([{
      ...point,
      id: "ign-address",
      label: "277 avenue de la Division Leclerc, 92290 Châtenay-Malabry",
      provider: "ign-geoplateforme",
    }]);
    const wrapper = mount(NearbyAddressSearch, {
      props: { modelValue: point, humanizeCoordinates: true, reverseGeocode },
    });

    await flushPromises();

    expect(reverseGeocode).toHaveBeenCalledWith(
      { lon: point.lon, lat: point.lat },
      expect.any(AbortSignal),
    );
    expect(wrapper.get("input").element.value).toBe("277 avenue de la Division Leclerc, 92290 Châtenay-Malabry");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("can hide place suggestions when autocompletePlaces is false", async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue(points);
    const wrapper = mount(NearbyAddressSearch, {
      props: { search, autocompletePlaces: false },
    });

    await wrapper.get("input").setValue("chatelet");
    await vi.advanceTimersByTimeAsync(220);
    await flushPromises();

    expect(search).toHaveBeenCalledWith("chatelet", expect.any(AbortSignal));
    expect(wrapper.findAll(".nearby-address-search__suggestions li")).toHaveLength(1);
    expect(wrapper.text()).toContain("9 rue Chateaubriand");
    expect(wrapper.text()).not.toContain("Châtelet-les-Halles");
  });

  it("keeps place suggestions when autocompletePlaces is enabled", async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue(points);
    const wrapper = mount(NearbyAddressSearch, {
      props: { search, autocompletePlaces: true },
    });

    await wrapper.get("input").setValue("chatelet");
    await vi.advanceTimersByTimeAsync(220);
    await flushPromises();

    expect(wrapper.findAll(".nearby-address-search__suggestions li")).toHaveLength(2);
    expect(wrapper.text()).toContain("Châtelet-les-Halles");
  });
});
