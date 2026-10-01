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

  it.each(['rer', 'train'] as const)('shows each departure platform for %s when the direction has multiple platforms', transportMode => {
    const wrapper = mountPanel({ design: 'double-stop', transportMode, directions: [{ id: 'rail', label: 'Destination', platforms: ['1', '2'], departures: [
      { id: 'first', waitLabel: '4', platform: '1' }, { id: 'second', waitLabel: '12', platform: '2' },
    ] }] });
    expect(wrapper.findAll('.fullscreen-station-panel__panam-platform').map(item => item.text())).toEqual(['Quai 1', 'Quai 2']);
    wrapper.unmount();
  });

  it.each(['metro', 'tram', 'bus'] as const)('omits double-stop platforms for %s', transportMode => {
    const wrapper = mountPanel({ design: 'double-stop', transportMode, directions: [{ id: 'rail', label: 'Destination', platforms: ['1', '2'], departures: [{ id: 'first', waitLabel: '4', platform: '1' }] }] });
    expect(wrapper.find('.fullscreen-station-panel__panam-platform').exists()).toBe(false);
    wrapper.unmount();
  });

  it('omits a confirmed single platform per direction even with a different platform in the opposite direction', () => {
    const wrapper = mountPanel({ design: 'double-stop', transportMode: 'rer', directions: [
      { id: 'north', label: 'Nord', platforms: [' 1 ', '1'], departures: [{ id: 'one', waitLabel: '3', platform: '1' }] },
      { id: 'south', label: 'Sud', platforms: ['2'], departures: [{ id: 'two', waitLabel: '4', platform: '2' }] },
    ] });
    expect(wrapper.find('.fullscreen-station-panel__panam-platform').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps rail platform information when topology is unknown even if both next trains share it', () => {
    const wrapper = mountPanel({ design: 'double-stop', transportMode: 'train', directions: [{ id: 'rail', label: 'Destination', departures: [
      { id: 'first', waitLabel: '4', platform: '12' }, { id: 'second', waitLabel: '12', platform: '12' },
    ] }] });
    expect(wrapper.findAll('.fullscreen-station-panel__panam-platform')).toHaveLength(2);
    wrapper.unmount();
  });

  it('does not invent platforms for departures without that information', () => {
    const wrapper = mountPanel({ design: 'double-stop', transportMode: 'train', directions: [{ id: 'rail', label: 'Destination', platforms: ['1', '2'], departures: [
      { id: 'first', waitLabel: '4' }, { id: 'second', waitLabel: '12', platform: '  ' },
    ] }] });
    expect(wrapper.find('.fullscreen-station-panel__panam-platform').exists()).toBe(false);
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

  it("sorts the dense list across directions and keeps every departure", () => {
    const wrapper = mountPanel({ design: "dense-list", darkTheme: true, directions: [
      { id: "north", label: "Paris", departures: [
        { id: "later", waitLabel: "12", departureTime: "2026-09-30T22:12:00+02:00", mission: "EKLI", platform: "2", destination: "Aéroport Charles de Gaulle" },
        { id: "unknown", waitLabel: "--" },
        { id: "third", waitLabel: "18", departureTime: "2026-09-30T22:18:00+02:00" },
      ] },
      { id: "south", label: "Saint-Rémy", departures: [
        { id: "first", waitLabel: "3", departureTime: "2026-09-30T22:03:00+02:00", mission: "SORI" },
        { id: "docked", waitLabel: "A quai" },
      ] },
    ] });
    const rows = wrapper.findAll(".fullscreen-station-panel__dense-row");
    expect(rows).toHaveLength(5);
    expect(rows[0]?.text()).toContain("A quai");
    expect(rows[1]?.text()).toContain("SORI");
    expect(rows[2]?.text()).toContain("EKLI");
    expect(rows[2]?.text()).toContain("Quai 2");
    expect(rows[2]?.text()).toContain("Aéroport Charles de Gaulle");
    expect(rows[4]?.text()).toContain("--");
    expect(wrapper.classes()).toContain("fullscreen-station-panel--dark");
    wrapper.unmount();
  });

  it("selects dense-list from the panel menu", async () => {
    const wrapper = mountPanel();
    await wrapper.get('[aria-label="Options du panneau"]').trigger("click");
    const button = wrapper.findAll("button").find((item) => item.text().includes("Liste dense"));
    await button?.trigger("click");
    expect(wrapper.emitted("change-design")?.[0]).toEqual([{ design: "dense-list" }]);
    wrapper.unmount();
  });

  it("shows service and loading states without fabricated dense departures", async () => {
    const wrapper = mountPanel({ design: "dense-list", directions: [], loading: true });
    expect(wrapper.text()).toContain("Chargement des passages");
    await wrapper.setProps({ loading: false, directions: [{ id: "end", label: "Paris", serviceEnded: true, departures: [] }] });
    expect(wrapper.text()).toContain("Service termine");
    expect(wrapper.findAll(".fullscreen-station-panel__dense-row")).toHaveLength(0);
    await wrapper.setProps({ error: "Indisponible" });
    expect(wrapper.get('[role="alert"]').text()).toBe("Indisponible");
    wrapper.unmount();
  });

  it("emits design and theme changes from the menu", async () => {
    const wrapper = mountPanel();

    await wrapper.find('[aria-label="Options du panneau"]').trigger("click");
    await wrapper.find('input[type="checkbox"]').setValue(true);

    const doubleStopButton = wrapper.findAll('button').find(button => button.text().trim() === 'Double arret');
    expect(doubleStopButton).toBeTruthy();
    await doubleStopButton?.trigger('click');
    await wrapper.setProps({ design: 'double-stop', panamDirectionId: 'jardin' });
    await wrapper.get('input[type="radio"]:not(:checked)').setValue(true);
    expect(wrapper.emitted('change-theme')?.[0]).toEqual([true]);
    expect(wrapper.emitted('change-design')?.[1]).toEqual([{ design: 'double-stop', panamDirectionId: 'berny' }]);

    wrapper.unmount();
  });

  it.each(['all-directions', 'home-card', 'dense-list'] as const)('shares list direction filters in %s', async design => {
    const wrapper = mountPanel({ design, hiddenDirectionIds: ['berny'] });
    const content = design === 'dense-list' ? '.fullscreen-station-panel__dense-list' : design === 'home-card' ? '.fullscreen-station-panel__home-directions' : '.fullscreen-station-panel__all-grid';
    expect(wrapper.get(content).text()).not.toContain('Croix de Berny');
    await wrapper.get('[aria-label="Options du panneau"]').trigger('click');
    await wrapper.findAll('button').find(button => button.text().includes('Filtrer les directions'))?.trigger('click');
    const inputs = wrapper.findAll('input[type="checkbox"]');
    expect(inputs).toHaveLength(2);
    await inputs[1]?.setValue(true);
    expect(wrapper.emitted('update:hiddenDirectionIds')?.[0]).toEqual([[]]);
    await wrapper.setProps({ hiddenDirectionIds: [] });
    expect(wrapper.get(content).text()).toContain('Croix de Berny');
    await wrapper.get('.board-direction-filter-modal').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.board-direction-filter-modal').exists()).toBe(false);
    expect(wrapper.emitted('close')).toBeUndefined();
    wrapper.unmount();
  });

  it('uses one radio selector in double-stop even for a direction hidden in lists', async () => {
    const wrapper = mountPanel({ design: 'double-stop', panamDirectionId: 'berny', hiddenDirectionIds: ['berny'] });
    expect(wrapper.get('.direction-label').text()).toBe('Croix de Berny');
    await wrapper.get('[aria-label="Options du panneau"]').trigger('click');
    expect(wrapper.text()).not.toContain('Filtrer les directions');
    await wrapper.findAll('button').find(button => button.text().includes('Choisir la direction'))?.trigger('click');
    const dialog = wrapper.get('.board-direction-filter-modal');
    expect(dialog.findAll('input[type="radio"]')).toHaveLength(2);
    expect(dialog.findAll('input[type="checkbox"]')).toHaveLength(0);
    expect(dialog.text()).toContain('Les filtres des vues en liste sont conservés');
    await dialog.findAll('input[type="radio"]')[0]?.setValue(true);
    expect(wrapper.emitted('change-design')?.[0]).toEqual([{ design: 'double-stop', panamDirectionId: 'jardin' }]);
    expect(wrapper.emitted('update:hiddenDirectionIds')).toBeUndefined();
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
    ["dense-list", 4],
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
