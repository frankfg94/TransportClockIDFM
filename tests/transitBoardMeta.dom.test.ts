import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import TransitBoard from "../src/components/TransitBoard.vue";
import type {
  Departure,
  DirectionDepartureGroup,
  TransitBoardConfig,
} from "../src/types/transit";

describe("TransitBoard departure metadata", () => {
  it("keeps the imminent label in expanded rows while the summary shows zero", () => {
    const departure: Departure = {
      id: "departure-now",
      lineRef: "line:test",
      monitoringRef: "stop:test",
      stopName: "Station test",
      destination: "Saint-Remy",
      monitoringLabel: "Tous quais",
      expectedDepartureTime: new Date().toISOString(),
      vehicleAtStop: false,
    };
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [departure],
        directionGroups: [createDirectionGroup(departure)],
        loading: false,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });

    expect(wrapper.find(".last-service__time strong").text()).toBe("0");
    expect(wrapper.find(".departure__time strong").text()).toBe("Imminent");

    wrapper.unmount();
  });

  it("shows the service pattern instead of platform metadata", () => {
    const departure: Departure = {
      id: "departure-1",
      lineRef: "line:test",
      monitoringRef: "stop:test",
      stopName: "Station test",
      destination: "Saint-Remy",
      monitoringLabel: "Tous quais",
      platform: "1",
      expectedDepartureTime: new Date(Date.now() + 5 * 60_000).toISOString(),
      vehicleAtStop: false,
      serviceType: "semi-direct",
    };
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [departure],
        directionGroups: [createDirectionGroup(departure)],
        loading: false,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });
    const metaText = wrapper.find(".departure__meta").text();

    expect(metaText).toContain("Semi direct");
    expect(metaText).not.toContain("Quai 1");
    expect(metaText).not.toContain("Tous quais");

    wrapper.unmount();
  });

  it("emits fullscreen panel opening from the station actions menu", async () => {
    const departure: Departure = {
      id: "departure-panel",
      lineRef: "line:test",
      monitoringRef: "stop:test",
      stopName: "Station test",
      destination: "Saint-Remy",
      monitoringLabel: "Tous quais",
      expectedDepartureTime: new Date(Date.now() + 5 * 60_000).toISOString(),
      vehicleAtStop: false,
    };
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [departure],
        directionGroups: [createDirectionGroup(departure)],
        loading: false,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });

    await wrapper.find('[aria-label="Actions de la station"]').trigger("click");
    await nextTick();

    const fullscreenButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(
        ".board-actions__menu button",
      ),
    ).find((button) => button.textContent?.includes("Affichage panneau"));

    expect(fullscreenButton).toBeTruthy();
    fullscreenButton?.click();
    await nextTick();

    expect(wrapper.emitted("open-fullscreen-panel")?.[0]).toEqual([
      createBoard(),
    ]);

    wrapper.unmount();
  });

  it("renders the upcoming interruption traffic chip", async () => {
    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [],
        directionGroups: [],
        loading: false,
        trafficAlert: {
          label: "Interruption dans 4 jours",
          tone: "upcoming",
        },
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });

    const chip = wrapper.get(".board-traffic-chip");

    expect(chip.text()).toBe("Interruption dans 4 jours");
    expect(chip.classes()).toContain("board-traffic-chip--upcoming");

    await chip.trigger("click");

    expect(wrapper.emitted("open-traffic")).toHaveLength(1);

    wrapper.unmount();
  });
});

function createBoard(): TransitBoardConfig {
  return {
    id: "board-test",
    title: "Station test",
    city: "Test",
    line: {
      ref: "line:test",
      shortName: "T",
      longName: "Ligne test",
      mode: "rer",
      color: "#0064ff",
      textColor: "#ffffff",
    },
    monitoringPoints: [{ ref: "stop:test", label: "Tous quais" }],
    directionGroups: [],
    maxDepartures: 4,
  };
}

function createDirectionGroup(
  departure: Departure,
): DirectionDepartureGroup {
  return {
    id: "south",
    label: "Sud",
    departures: [departure],
    serviceEnded: false,
  };
}
