import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { PlacesProvider } from "../src/features/nearby-stations/nearbyPlaces";
import {
  NEARBY_PLACES_REFRESH_DEBOUNCE_MS,
  useNearbyPlaces,
} from "../src/features/nearby-stations/useNearbyPlaces";

describe("useNearbyPlaces", () => {
  it("delegates nearby loading to the injected PlacesProvider", async () => {
    const provider: PlacesProvider = {
      searchDestinations: vi.fn(async () => []),
      searchNearby: vi.fn(async () => [{
        id: "node:1",
        name: "Café test",
        lon: 2.3,
        lat: 48.81,
        category: "food" as const,
        kind: "cafe",
        distanceMeters: 140,
      }]),
    };
    const origin = ref({ lon: 2.2978, lat: 48.8102, label: "9 rue Chateaubriand" });
    const radius = ref(600);
    const enabled = ref(true);
    let nearby!: ReturnType<typeof useNearbyPlaces>;
    const Harness = defineComponent({
      setup() {
        nearby = useNearbyPlaces({ origin, radius, enabled, provider });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await flushPromises();

    expect(provider.searchNearby).toHaveBeenCalledWith(
      { origin: origin.value, radiusMeters: 600 },
      expect.any(AbortSignal),
    );
    expect(nearby.places.value[0]?.name).toBe("Café test");
    wrapper.unmount();
  });

  it("debounces radius refreshes while keeping origin changes immediate", async () => {
    vi.useFakeTimers();
    try {
      const provider: PlacesProvider = {
        searchDestinations: vi.fn(async () => []),
        searchNearby: vi.fn(async () => []),
      };
      const origin = ref({ lon: 2.2978, lat: 48.8102, label: "9 rue Chateaubriand" });
      const radius = ref(600);
      const enabled = ref(true);
      const Harness = defineComponent({
        setup() {
          useNearbyPlaces({ origin, radius, enabled, provider });
          return () => null;
        },
      });
      const wrapper = mount(Harness);

      await vi.runOnlyPendingTimersAsync();
      await flushPromises();
      const initialCalls = (provider.searchNearby as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(initialCalls).toBe(1);

      radius.value = 1_200;
      await flushPromises();
      expect((provider.searchNearby as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCalls);

      await vi.advanceTimersByTimeAsync(NEARBY_PLACES_REFRESH_DEBOUNCE_MS - 1);
      await flushPromises();
      expect((provider.searchNearby as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCalls);

      await vi.advanceTimersByTimeAsync(1);
      await flushPromises();
      expect((provider.searchNearby as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCalls + 1);
      expect((provider.searchNearby as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
        radiusMeters: 1_200,
      }));

      origin.value = { lon: 2.3, lat: 48.82, label: "Nouvelle origine" };
      await flushPromises();
      expect((provider.searchNearby as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCalls + 2);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
