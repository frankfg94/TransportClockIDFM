import { mount } from "@vue/test-utils";
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
