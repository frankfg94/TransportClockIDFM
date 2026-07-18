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
  document.documentElement.removeAttribute("style");
  document.body.removeAttribute("style");
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

  it("opens a scrollable traffic modal from an alert and closes it without leaving", async () => {
    const message = Array.from({ length: 40 }, (_, index) =>
      `Detail trafic ${index + 1}`,
    ).join("\n");
    const wrapper = mountPanel({
      trafficAlert: {
        label: "Interruption",
        tone: "red",
        title: "Trafic interrompu entre deux stations",
        message,
      },
    });

    await wrapper
      .get('[aria-label="Afficher le detail de l\'information trafic"]')
      .trigger("click");

    const modal = wrapper.get(".fullscreen-station-panel__traffic-modal");
    expect(modal.attributes("role")).toBe("dialog");
    expect(modal.text()).toContain("Trafic interrompu entre deux stations");
    expect(modal.text()).toContain("Detail trafic 40");
    expect(
      wrapper.find(".fullscreen-station-panel__traffic-modal-body").exists(),
    ).toBe(true);

    await wrapper
      .get('[aria-label="Fermer l\'information trafic"]')
      .trigger("click");

    expect(
      wrapper.find(".fullscreen-station-panel__traffic-modal").exists(),
    ).toBe(false);
    expect(wrapper.classes()).toContain("fullscreen-station-panel--light");

    wrapper.unmount();
  });

  it("opens the traffic modal from the PANAM side panel with the keyboard", async () => {
    const wrapper = mountPanel({
      design: "double-stop",
      trafficAlert: {
        label: "Perturbation",
        tone: "orange",
        title: "Service ralenti",
        message: "Prevoir un temps de trajet supplementaire.",
      },
    });

    await wrapper
      .get(".fullscreen-station-panel__panam-side")
      .trigger("keydown", { key: "Enter" });

    expect(wrapper.get(".fullscreen-station-panel__traffic-modal").text()).toContain(
      "Prevoir un temps de trajet supplementaire.",
    );

    await wrapper.trigger("keydown", { key: "Escape" });
    expect(
      wrapper.find(".fullscreen-station-panel__traffic-modal").exists(),
    ).toBe(false);
    expect(wrapper.emitted("close")).toBeUndefined();

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

  it("emits fullscreen toggles with the contextual menu label", async () => {
    const wrapper = mountPanel({ browserFullscreenActive: false });

    await wrapper.find('[aria-label="Options du panneau"]').trigger("click");

    const fullscreenButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Plein ecran"));

    expect(fullscreenButton).toBeTruthy();
    await fullscreenButton?.trigger("click");
    expect(wrapper.emitted("toggle-fullscreen")).toHaveLength(1);

    await wrapper.setProps({ browserFullscreenActive: true });

    expect(wrapper.text()).toContain("Sortir du plein ecran");

    wrapper.unmount();
  });

  it.each([
    ["all-directions", 4],
    ["double-stop", 2],
    ["home-card", 4],
  ] as const)(
    "renders contextual alarm buttons in the %s design",
    async (design, expectedCount) => {
      const wrapper = mountPanel({
        design,
        alarmDepartureIds: ["jardin-1"],
      });
      const buttons = wrapper.findAll(
        ".fullscreen-station-panel__alarm-button",
      );

      expect(buttons).toHaveLength(expectedCount);
      expect(
        buttons.filter((button) =>
          button.classes().includes(
            "fullscreen-station-panel__alarm-button--active",
          ),
        ),
      ).toHaveLength(1);

      await buttons[0]?.trigger("click");
      expect(wrapper.emitted("schedule-alarm")?.[0]).toEqual([
        {
          directionId: "jardin",
          departureId: "jardin-1",
        },
      ]);

      wrapper.unmount();
    },
  );

  it("hides alarm buttons with the controls and reveals both together", async () => {
    const wrapper = mountPanel();
    const controls = wrapper.get(".fullscreen-station-panel__controls");
    const alarmButtons = wrapper.findAll(
      ".fullscreen-station-panel__alarm-button",
    );

    vi.advanceTimersByTime(10_000);
    await nextTick();

    expect(controls.classes()).toContain(
      "fullscreen-station-panel__controls--hidden",
    );
    expect(
      alarmButtons.every((button) =>
        button.classes().includes(
          "fullscreen-station-panel__alarm-button--hidden",
        ),
      ),
    ).toBe(true);

    await wrapper.trigger("pointermove");
    expect(
      alarmButtons.some((button) =>
        button.classes().includes(
          "fullscreen-station-panel__alarm-button--hidden",
        ),
      ),
    ).toBe(false);

    wrapper.unmount();
  });

  it("locks the page scroll while mounted and restores it on unmount", () => {
    document.documentElement.style.overflow = "auto";
    document.documentElement.style.scrollbarGutter = "stable";
    document.body.style.overflow = "auto";

    const wrapper = mountPanel();

    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.documentElement.style.scrollbarGutter).toBe("auto");
    expect(document.body.style.overflow).toBe("hidden");

    wrapper.unmount();

    expect(document.documentElement.style.overflow).toBe("auto");
    expect(document.documentElement.style.scrollbarGutter).toBe("stable");
    expect(document.body.style.overflow).toBe("auto");
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
