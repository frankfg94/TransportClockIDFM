import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import GlobalMapMarkerAddressField from "../src/features/line-map/GlobalMapMarkerAddressField.vue";

describe("GlobalMapMarkerAddressField", () => {
  it("reverse-geocodes the clicked coordinates for display without changing them", async () => {
    const reverseGeocode = vi.fn(async () => [{
      lon: 2.3522,
      lat: 48.8566,
      label: "10 rue de Rivoli, Paris",
      type: "address" as const,
    }]);
    const wrapper = mount(GlobalMapMarkerAddressField, {
      props: {
        open: true,
        point: { lon: 2.3522, lat: 48.8566 },
        reverseGeocode,
      },
    });

    await flushPromises();

    expect(reverseGeocode).toHaveBeenCalledWith(
      { lon: 2.3522, lat: 48.8566 },
      expect.any(AbortSignal),
    );
    expect(wrapper.get("input").element.value).toBe("10 rue de Rivoli, Paris");
    expect(wrapper.emitted("resolved-address")?.[0]).toEqual(["10 rue de Rivoli, Paris"]);
    expect(wrapper.emitted("update:point")).toBeUndefined();
  });

  it("resolves an edited address and emits the new coordinates", async () => {
    const geocode = vi.fn(async () => [{
      lon: 2.333,
      lat: 48.829,
      label: "277 avenue de la Division Leclerc, Châtenay-Malabry",
      type: "address" as const,
    }]);
    const wrapper = mount(GlobalMapMarkerAddressField, {
      props: {
        open: true,
        point: { lon: 2.3522, lat: 48.8566 },
        address: "10 rue de Rivoli, Paris",
        geocode,
      },
    });

    const input = wrapper.get("input");
    await input.setValue("277 avenue de la Division Leclerc, Châtenay-Malabry");
    const resolved = await (wrapper.vm as unknown as { resolveAddress: () => Promise<unknown> }).resolveAddress();

    expect(resolved).toMatchObject({ lon: 2.333, lat: 48.829 });
    expect(geocode).toHaveBeenCalledOnce();
    expect(wrapper.emitted("update:point")?.at(-1)?.[0]).toMatchObject({ lon: 2.333, lat: 48.829 });
  });
});
