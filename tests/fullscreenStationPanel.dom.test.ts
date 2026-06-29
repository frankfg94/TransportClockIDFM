import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FullscreenStationPanel from "../src/components/FullscreenStationPanel.vue";

const directions = [
  {
    id: "jardin",
    label: "Jardin Parisien",
    subtitle: "Direction Clamart",
    departures: [
      { id: "jardin-1", waitLabel: "5", destination: "Jardin Parisien" },
      { id: "jardin-2", waitLabel: "11", destination: "Jardin Parisien" },
    ],
  },
  {
    id: "berny",
    label: "Croix de Berny",
    subtitle: "Direction Antony",
    departures: [
      { id: "berny-1", waitLabel: "3", destination: "Croix de Berny" },
      { id: "berny-2", waitLabel: "15", destination: "Croix de Berny" },
    ],
  },
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FullscreenStationPanel", () => {
  it("renders the logo slot and every direction in all-directions design", () => {
    const wrapper = mountPanel();

    expect(wrapper.find('[data-test="line-logo"]').text()).toBe("T10");
    expect(wrapper.text()).toContain("Les Peintres");
    expect(wrapper.text()).toContain("Jardin Parisien");
    expect(wrapper.text()).toContain("Croix de Berny");
    expect(wrapper.classes()).toContain("fullscreen-station-panel--light");

    wrapper.unmount();
  });

  it("renders the selected double-stop direction in dark PANAM mode", () => {
    const wrapper = mountPanel({
      design: "double-stop",
      darkTheme: true,
      panamDirectionId: "berny",
    });

    expect(wrapper.classes()).toContain("fullscreen-station-panel--double-stop");
    expect(wrapper.classes()).toContain("fullscreen-station-panel--dark");
    expect(wrapper.text()).toContain("1er tram");
    expect(wrapper.text()).toContain("2e tram");
    expect(wrapper.text()).toContain("Croix de Berny");
    expect(wrapper.text()).toContain("15");
    expect(wrapper.find(".direction-label").text()).toBe("Croix de Berny");
    expect(wrapper.find(".transport-cell-title-text.first").text()).toBe(
      "1er tram",
    );
    expect(wrapper.find(".fullscreen-station-panel__panam-side").exists()).toBe(
      false,
    );

    wrapper.unmount();
  });

  it("keeps the double-stop side panel only for traffic alerts", () => {
    const wrapper = mountPanel({
      design: "double-stop",
      trafficAlert: { label: "Interruption", tone: "red" },
    });

    expect(wrapper.find(".fullscreen-station-panel__panam-side").exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain("Interruption");

    wrapper.unmount();
  });

  it("applies the dark theme to the home-card design", () => {
    const wrapper = mountPanel({
      design: "home-card",
      darkTheme: true,
      trafficAlert: { label: "Perturbation", tone: "orange" },
    });

    expect(wrapper.classes()).toContain("fullscreen-station-panel--home-card");
    expect(wrapper.classes()).toContain("fullscreen-station-panel--dark");
    expect(wrapper.text()).toContain("DIRECTION");
    expect(wrapper.text()).toContain("Perturbation");

    wrapper.unmount();
  });

  it("emits design and theme changes from the menu", async () => {
    const wrapper = mountPanel();

    await wrapper.find('[aria-label="Options du panneau"]').trigger("click");
    await wrapper.find('input[type="checkbox"]').setValue(true);

    const doubleStopButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Double arret - Croix de Berny"));

    expect(doubleStopButton).toBeTruthy();
    await doubleStopButton?.trigger("click");

    expect(wrapper.emitted("change-theme")?.[0]).toEqual([true]);
    expect(wrapper.emitted("change-design")?.[0]).toEqual([
      { design: "double-stop", panamDirectionId: "berny" },
    ]);

    wrapper.unmount();
  });

  it("emits refresh from the controls", async () => {
    const wrapper = mountPanel();

    await wrapper.find('[aria-label="Rafraichir le panneau"]').trigger("click");

    expect(wrapper.emitted("refresh")).toHaveLength(1);

    wrapper.unmount();
  });

  it("hides controls after inactivity and reveals them on pointer movement", async () => {
    const wrapper = mountPanel();
    const controls = wrapper.find(".fullscreen-station-panel__controls");

    expect(controls.classes()).not.toContain(
      "fullscreen-station-panel__controls--hidden",
    );

    vi.advanceTimersByTime(10_000);
    await nextTick();

    expect(controls.classes()).toContain(
      "fullscreen-station-panel__controls--hidden",
    );

    await wrapper.trigger("pointermove");

    expect(controls.classes()).not.toContain(
      "fullscreen-station-panel__controls--hidden",
    );

    wrapper.unmount();
  });
});

function mountPanel(
  props: Partial<InstanceType<typeof FullscreenStationPanel>["$props"]> = {},
) {
  return mount(FullscreenStationPanel, {
    props: {
      stationName: "Les Peintres",
      city: "Chatenay-Malabry",
      lineName: "Tram T10",
      lineShortName: "T10",
      lineColor: "#4d7c0f",
      lineTextColor: "#ffffff",
      transportTypeLabel: "tram",
      directions,
      design: "all-directions",
      darkTheme: false,
      loading: false,
      ...props,
    },
    slots: {
      "line-logo": '<span data-test="line-logo">T10</span>',
    },
  });
}
