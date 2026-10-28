import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GlobalMapNearbyPlacesList from "../src/features/line-map/GlobalMapNearbyPlacesList.vue";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";

describe("global map nearby places list", () => {
  it("bounds SVG/row rendering while keeping the last result reachable by scrolling", async () => {
    const places = Array.from({ length: 2000 }, (_, index) => ({
      id: `place:${index}`, name: `Commerce ${index}`, category: "shop", kind: "bakery", rankingCategory: "commerce", lon: 2.3, lat: 48.8, distanceMeters: index,
    })) as NearbyPlace[];
    const wrapper = mount(GlobalMapNearbyPlacesList, { props: { places } });
    expect(wrapper.findAll('.nearby-list-row').length).toBeLessThan(20);
    expect(wrapper.get('.nearby-list-row').attributes('aria-setsize')).toBe('2000');
    expect(wrapper.text()).toContain('Commerce 0');
    const list = wrapper.get('ul');
    list.element.scrollTop = 2000 * 40 - 280;
    await list.trigger('scroll');
    expect(wrapper.text()).toContain('Commerce 1999');
    expect(wrapper.findAll('.nearby-list-row').length).toBeLessThan(20);
    await wrapper.setProps({ places: places.slice(0, 5) });
    expect(list.element.scrollTop).toBe(0);
    expect(wrapper.text()).toContain('Commerce 0');
    wrapper.unmount();
  });
});
