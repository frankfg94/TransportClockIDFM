import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useNearbyStations } from "../src/features/nearby-stations/useNearbyStations";
import type { GeocoderPoint, TransportMapGeocoder } from "../src/features/transport-map/contracts/geocoder";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import { TransportMapDataSource } from "../src/features/transport-map/data/createTransportMapDataSource";

describe("useNearbyStations address selection", () => {
  it("cancels pending suggestions on submit and ignores a late geocode after direct selection", async () => {
    vi.useFakeTimers();
    let resolveSearch!: (points: GeocoderPoint[]) => void;
    const geocode = vi.fn<TransportMapGeocoder["geocode"]>(() =>
      new Promise(resolve => { resolveSearch = resolve; }),
    );
    const autocomplete = vi.fn(async () => []);
    const source = new TransportMapDataSource();
    const network = { lines: [], stationsById: new Map(), linesById: new Map() } as unknown as TransportMapNetwork;
    vi.spyOn(source, "initialize").mockResolvedValue(network);
    vi.spyOn(source, "getNetwork").mockReturnValue(network);
    vi.spyOn(source, "queryStationsWithinRadius").mockResolvedValue([]);

    let nearby!: ReturnType<typeof useNearbyStations>;
    const wrapper = mount(defineComponent({ setup() {
      nearby = useNearbyStations({ geocoder: { geocode, autocomplete }, createDataSource: () => source });
      return () => null;
    } }));

    try {
      nearby.query.value = "Ancienne adresse";
      await nextTick();
      const search = nearby.searchAddress();
      await vi.advanceTimersByTimeAsync(300);
      expect(autocomplete).not.toHaveBeenCalled();
      expect(geocode.mock.calls[0]?.[1]?.aborted).toBe(false);

      const selected = { lon: 2.33, lat: 48.83, label: "Nouvelle adresse" };
      await nearby.selectPlace(selected);
      expect(geocode.mock.calls[0]?.[1]?.aborted).toBe(true);
      resolveSearch([{ lon: 2.3, lat: 48.8, label: "Ancienne adresse" }]);
      await expect(search).resolves.toBe(false);
      expect(nearby.selectedPlace.value).toEqual(selected);
      expect(nearby.isSuggesting.value).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
});
