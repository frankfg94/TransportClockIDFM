import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NearbyPlaceDetails from "../src/features/nearby-stations/NearbyPlaceDetails.vue";
import { normalizeCompiledPlace } from "../src/services/places/compiledPlaces";

describe("commerce metadata", () => {
  it("shows seven localized day rows, aligned hours, and separate holiday exceptions", () => {
    const wrapper = mount(NearbyPlaceDetails, { props: { place: {
      id: "hours", name: "Commerce", lon: 2.29, lat: 48.8, category: "shop", kind: "supermarket", distanceMeters: 100,
      tags: { opening_hours: "Mo-Sa 08:30-21:00; Su 09:00-13:30; PH off" },
    } } });
    const rows = wrapper.findAll('.nearby-place-details__week li');
    expect(rows).toHaveLength(8);
    expect(rows[0]?.text()).toContain('lundi');
    expect(rows[0]?.text()).toContain('08:30 – 21:00');
    expect(rows[6]?.text()).toContain('dimanche');
    expect(rows[7]?.text()).toContain('Jours fériés');
    expect(rows[7]?.text()).toContain('Fermé');
    wrapper.unmount();
  });
  it("preserves contacts through the actual compiler and presents all retained metadata", () => {
    const compiled = normalizeCompiledPlace({ type: "node", id: 42, lon: 2.29, lat: 48.8, tags: {
      name: "Commerce test", shop: "supermarket", opening_hours: "Mo-Sa 09:00-20:00",
      "contact:email": "contact@example.test", "contact:website": "https://example.test/shop",
      "contact:phone": "+33102030405", wheelchair: "yes", "brand:wikidata": "Q123",
    } })!;
    expect(compiled.tags?.["contact:phone"]).toBe("+33102030405");
    const wrapper = mount(NearbyPlaceDetails, { props: { place: { ...compiled, distanceMeters: 160, areaM2: 730 } } });
    expect(wrapper.text()).toContain("Moyenne surface");
    expect(wrapper.text()).toContain("Mo-Sa 09:00-20:00");
    expect(wrapper.text()).toContain("730 m²");
    expect(wrapper.text()).toContain("wheelchair");
    expect(wrapper.get('a[href^="mailto:"]').text()).toBe("contact@example.test");
    expect(wrapper.get('a[target="_blank"]').attributes("href")).toBe("https://example.test/shop");
    wrapper.unmount();
  });
  it("keeps unknown data explicit and rejects executable website URLs", () => {
    const wrapper = mount(NearbyPlaceDetails, { props: { place: {
      id: "test", name: "Test", lon: 2.29, lat: 48.8, category: "shop", kind: "bakery", distanceMeters: 100,
      tags: { website: "javascript:alert(1)" },
    } } });
    expect(wrapper.text()).toContain("Non renseigné");
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.text()).toContain("marche estimée");
    wrapper.unmount();
  });
  it("preserves conditional schedules as readable source rules", () => {
    const wrapper = mount(NearbyPlaceDetails, { props: { place: {
      id: "seasonal", name: "Commerce", lon: 2.29, lat: 48.8, category: "shop", kind: "shop", distanceMeters: 100,
      tags: { opening_hours: 'Apr-Oct Mo-Sa 09:00-19:00; PH off; "sur rendez-vous"' },
    } } });
    expect(wrapper.find('.nearby-place-details__week').exists()).toBe(false);
    expect(wrapper.findAll('.nearby-place-details__hours-raw > span').map(row => row.text())).toEqual([
      'Apr-Oct Mo-Sa 09:00-19:00', 'PH off', '"sur rendez-vous"',
    ]);
    wrapper.unmount();
  });
});
