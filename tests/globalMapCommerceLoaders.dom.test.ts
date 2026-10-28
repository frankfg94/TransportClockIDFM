import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GlobalMapPickerSideBar from "../src/features/line-map/GlobalMapPickerSideBar.vue";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";

describe("transport sidebar loaders", () => {
  it("keeps cities pending despite already-present city names, then shows the finished list", async () => {
    const line = { id: "line:test", code: "T6", label: "T6", mode: "TRAM", color: "#f00", textColor: "#fff", stationIds: ["stop"], geometryIds: [] } as unknown as GlobalMapLine;
    const stations = [{ id: "stop", name: "Arrêt test", city: "Châtillon", lon: 2.29, lat: 48.8, lineIds: [line.id, "line:connection"] }] as unknown as GlobalMapStation[];
    const wrapper = mount(GlobalMapPickerSideBar, { props: { line, stations, cityPatternStations: stations, servedCitiesLoading: true } });
    const zonesToggle = wrapper.get('[data-testid="global-map-served-city-zones-toggle"]');
    expect(zonesToggle.text()).toBe('Non');
    await zonesToggle.trigger('click');
    expect(wrapper.emitted('toggle-served-city-zones')).toHaveLength(1);
    await wrapper.setProps({ showServedCityZones: true });
    expect(zonesToggle.attributes('aria-busy')).toBe('true');
    expect(zonesToggle.find('[role="status"]').exists()).toBe(true);
    expect(zonesToggle.text()).not.toContain('Oui');
    await wrapper.get('#global-map-picker-sidebar-line-cities-toggle').trigger('click');
    expect(wrapper.get('#global-map-picker-sidebar-line-cities').attributes('aria-busy')).toBe('true');
    expect(wrapper.get('#global-map-picker-sidebar-line-cities').text()).toContain('Chargement des communes');
    await wrapper.setProps({ stations: [...stations], cityPatternStations: [...stations] });
    expect(wrapper.get('#global-map-picker-sidebar-line-cities').attributes('aria-busy')).toBe('true');
    await wrapper.setProps({ servedCitiesLoading: false });
    expect(zonesToggle.attributes('aria-busy')).toBe('false');
    expect(zonesToggle.find('[role="status"]').exists()).toBe(false);
    expect(zonesToggle.text()).toBe('Oui');
    expect(wrapper.get('#global-map-picker-sidebar-line-cities').text()).toContain('Châtillon');
    expect(wrapper.get('#global-map-picker-sidebar-line-cities').attributes('aria-busy')).toBeUndefined();
    wrapper.unmount();
  });
});
