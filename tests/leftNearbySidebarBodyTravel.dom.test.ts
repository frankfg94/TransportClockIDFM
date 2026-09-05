import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import LeftNearbySidebarBodyTravel from "../src/features/nearby-stations/LeftNearbySidebarBodyTravel.vue";
import type { NearbyJourneySection } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { GlobalMapMode } from "../src/features/transport-map/contracts/manifest";
import type { TravelRoute } from "../src/features/nearby-stations/useTravelRoutes";

const destination = { id: "station:destination", label: "Destination", lat: 48.8, lon: 2.3 };

const walking: NearbyJourneySection = {
  type: "walking",
  mode: "walking",
  durationSeconds: 300,
  distanceMeters: 350,
};

const bus: NearbyJourneySection = {
  type: "public_transport",
  mode: "bus",
  durationSeconds: 600,
  lineId: "line:bus:6413",
  lineCode: "6413",
  lineMode: "BUS",
  lineColor: "#00843d",
  direction: "Gare Centrale",
  fromName: "Départ",
  toName: "Gare Centrale",
  stopNames: ["Départ", "Hôtel de ville", "Gare Centrale"],
};

const waiting: NearbyJourneySection = {
  type: "waiting",
  mode: "waiting",
  durationSeconds: 420,
  fromName: "Quai B",
};

const tram: NearbyJourneySection = {
  type: "public_transport",
  mode: "tram",
  durationSeconds: 720,
  lineId: "line:tram:t2",
  lineCode: "T2",
  lineMode: "TRAM",
  lineColor: "#a1007d",
  direction: "Aéroport",
  fromName: "Gare Centrale",
  toName: "Aéroport",
  stopNames: ["Gare Centrale", "Porte Sud", "Aéroport"],
};

const route: TravelRoute = {
  id: "route:recommended",
  durationSeconds: 2 * 60 * 60 + 25 * 60,
  departureDateTime: "20260820T232900",
  arrivalDateTime: "20260821T015400",
  transferCount: 1,
  sections: [walking, bus, waiting, tram],
  transitSections: [bus, tram],
};

const timedRoute: TravelRoute = {
  ...route,
  id: "route:timed-wait",
  durationSeconds: 20 * 60,
  departureDateTime: "20260822T080000",
  arrivalDateTime: "20260822T082000",
  sections: [
    { ...walking, departureDateTime: "20260822T080000", arrivalDateTime: "20260822T080500" },
    { ...tram, departureDateTime: "20260822T081000", arrivalDateTime: "20260822T082000" },
  ],
  transitSections: [tram],
};

function mountTravel(
  routes: readonly TravelRoute[] = [route],
  getSectionExits: (section: NearbyJourneySection) => readonly {
    id: string;
    stationId: string;
    name: string;
    code?: string;
    lon: number;
    lat: number;
  }[] = () => [{
    id: "exit-arrival-a",
    stationId: "station:arrival",
    name: "Gare centrale",
    code: "A",
    lon: 2.3,
    lat: 48.8,
  }],
  destinationPoint = destination,
) {
  return mount(LeftNearbySidebarBodyTravel, {
    props: {
      originLabel: "Origine",
      destination: destinationPoint,
      routes,
      selectedRouteId: route.id,
      availableModes: ["BUS", "TRAM"] satisfies GlobalMapMode[],
      allowedModes: ["BUS", "TRAM"] satisfies GlobalMapMode[],
      modeLabel: (mode: GlobalMapMode) => mode,
      showLineIcons: true,
      getSectionExits,
    },
    global: {
      stubs: {
        NearbyAddressSearch: { template: "<div data-testid='destination-search' />" },
        LineIconBadge: {
          props: { line: { type: Object, required: true } },
          template: "<span data-testid='line-badge'>{{ line.label }}</span>",
        },
      },
    },
  });
}

describe("LeftNearbySidebarBodyTravel", () => {
  it("starts compact, opens one route in detail, and keeps line station accordions closed", async () => {
    const wrapper = mountTravel();

    expect(wrapper.findAll(".left-nearby-travel__route")).toHaveLength(1);
    expect(wrapper.find(".left-nearby-travel__route-detail").exists()).toBe(false);

    await wrapper.get(".left-nearby-travel__route-compact").trigger("click");

    expect(wrapper.emitted("selectRoute")).toHaveLength(1);
    expect(wrapper.find(".left-nearby-travel__route-detail").exists()).toBe(true);
    const lineButtons = wrapper.findAll(".left-nearby-travel__timeline-row--button");
    expect(lineButtons).toHaveLength(2);
    expect(lineButtons.every((button) => button.attributes("aria-expanded") === "false")).toBe(true);
    expect(wrapper.findAll(".left-nearby-travel__stations")).toHaveLength(0);
  });

  it("can hide route line icons while keeping each line code visible", async () => {
    const wrapper = mountTravel();

    expect(wrapper.findAll("[data-testid='line-badge']")).toHaveLength(2);
    await wrapper.setProps({ showLineIcons: false });

    expect(wrapper.findAll("[data-testid='line-badge']")).toHaveLength(0);
    expect(wrapper.findAll(".left-nearby-travel__route-line-label").map((item) => item.text())).toEqual([
      "6413",
      "T2",
    ]);
  });

  it("emits the shared route alarm action from compact and detailed views", async () => {
    const wrapper = mountTravel();

    await wrapper.get(".left-nearby-travel__route-alarm").trigger("click");
    expect(wrapper.emitted("scheduleRouteAlarm")).toEqual([[route]]);

    await wrapper.get(".left-nearby-travel__route-compact").trigger("click");
    await wrapper.get(".left-nearby-travel__route-alarm").trigger("click");

    expect(wrapper.emitted("scheduleRouteAlarm")).toEqual([[route], [route]]);
  });

  it("expands only the selected line stations and resets them when returning to routes", async () => {
    const wrapper = mountTravel();
    await wrapper.get(".left-nearby-travel__route-compact").trigger("click");

    const lineButtons = wrapper.findAll(".left-nearby-travel__timeline-row--button");
    await lineButtons[0]!.trigger("click");

    expect(lineButtons[0]!.attributes("aria-expanded")).toBe("true");
    expect(lineButtons[1]!.attributes("aria-expanded")).toBe("false");
    expect(wrapper.findAll(".left-nearby-travel__station")).toHaveLength(3);
    expect(wrapper.text()).toContain("Hôtel de ville");

    await lineButtons[0]!.trigger("click");
    expect(wrapper.findAll(".left-nearby-travel__stations")).toHaveLength(0);

    await wrapper.get(".left-nearby-travel__back").trigger("click");
    expect(wrapper.find(".left-nearby-travel__route-detail").exists()).toBe(false);
    expect(wrapper.findAll(".left-nearby-travel__route")).toHaveLength(1);
  });

  it("opens the visible date/time picker and emits the selected local time", async () => {
    const wrapper = mountTravel();
    const picker = wrapper.get(".left-nearby-travel__time-picker");

    await picker.trigger("click");
    expect(wrapper.find(".left-nearby-travel__time-popover").exists()).toBe(true);

    await wrapper.get('input[type="date"]').setValue("2026-08-22");
    await wrapper.get('input[type="time"]').setValue("08:30");
    await wrapper.get(".left-nearby-travel__time-popover-actions button:last-child").trigger("click");

    expect(wrapper.emitted("update:departureDateTime")).toEqual([["2026-08-22T08:30"]]);
    expect(wrapper.find(".left-nearby-travel__time-popover").exists()).toBe(false);
    await wrapper.setProps({ departureDateTime: "2026-08-22T08:30" });
    expect(wrapper.get(".left-nearby-travel__time-picker").text()).toContain("08:30");
  });

  it("shows the fewest-transfers chip and inferred tram waiting time", async () => {
    const wrapper = mountTravel([route, { ...route, id: "route:fewest", transferCount: 0, durationSeconds: route.durationSeconds + 60 }]);
    expect(wrapper.findAll(".left-nearby-travel__fewest-transfers")).toHaveLength(1);

    const timedWrapper = mountTravel([timedRoute]);
    await timedWrapper.get(".left-nearby-travel__route-compact").trigger("click");

    expect(timedWrapper.text()).toContain("Attente 5 min");
    expect(timedWrapper.text()).toContain("08:10");
  });

  it("emits the reduced allowed transport modes from advanced filters", async () => {
    const wrapper = mountTravel();
    await wrapper.get(".left-nearby-travel__advanced-filters summary").trigger("click");

    const checkboxes = wrapper.findAll('.left-nearby-travel__advanced-filters input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    await checkboxes[0]!.setValue(false);

    expect(wrapper.emitted("update:allowedModes")?.at(-1)).toEqual([["TRAM"]]);
  });

  it("keeps departure time behind advanced options and shows the arrival exits at the end of the timeline", async () => {
    const wrapper = mountTravel();
    const advanced = wrapper.get(".left-nearby-travel__advanced-filters");

    expect(advanced.attributes("open")).toBeUndefined();
    expect(advanced.find(".left-nearby-travel__time-card").exists()).toBe(true);
    expect(wrapper.find(".left-nearby-travel__exits--arrival").exists()).toBe(false);

    await wrapper.get(".left-nearby-travel__route-compact").trigger("click");

    expect(wrapper.findAll(".left-nearby-travel__exits--arrival")).toHaveLength(1);
    expect(wrapper.findAll(".left-nearby-travel__exit")).toHaveLength(1);
    expect(wrapper.text()).toContain("Sortie A - Gare centrale");
    const timeline = wrapper.get(".left-nearby-travel__timeline");
    expect(timeline.element.lastElementChild).toBe(wrapper.get(".left-nearby-travel__exits--arrival").element);
    expect(wrapper.findAll(".left-nearby-travel__stations")).toHaveLength(0);

    const lineButtons = wrapper.findAll(".left-nearby-travel__timeline-row--button");
    await lineButtons[0]!.trigger("click");
    expect(wrapper.findAll(".left-nearby-travel__exits--arrival")).toHaveLength(1);
    expect(wrapper.findAll(".left-nearby-travel__exit")).toHaveLength(1);
  });

  it("shows only the fastest arrival exit even when the map has several exits", async () => {
    const arrivalPoint = { ...destination, lon: 2.301, lat: 48.801 };
    const routeWithArrivalPoint: TravelRoute = {
      ...route,
      sections: [
        walking,
        bus,
        waiting,
        { ...tram, toPoint: arrivalPoint },
      ],
      transitSections: [bus, { ...tram, toPoint: arrivalPoint }],
    };
    const wrapper = mountTravel([routeWithArrivalPoint], () => [
      {
        id: "exit-a",
        stationId: "station:arrival",
        name: "Avenue éloignée",
        code: "1",
        lon: 2.3,
        lat: 48.8,
      },
      {
        id: "exit-b",
        stationId: "station:arrival",
        name: "Avenue proche",
        code: "2",
        lon: 2.301,
        lat: 48.801,
      },
    ], arrivalPoint);

    await wrapper.get(".left-nearby-travel__route-compact").trigger("click");

    expect(wrapper.findAll(".left-nearby-travel__exit")).toHaveLength(1);
    expect(wrapper.text()).toContain("Sortie 2 - Avenue proche");
    expect(wrapper.text()).not.toContain("Sortie 1 - Avenue éloignée");
  });

  it("resolves only the final transit section exits in the detailed route", async () => {
    const getSectionExits = vi.fn(() => [{
      id: "exit-measured",
      stationId: "station:arrival",
      name: "Gare centrale",
      code: "A",
      lon: 2.3,
      lat: 48.8,
    }]);
    const wrapper = mountTravel([route], getSectionExits);

    await wrapper.get(".left-nearby-travel__route-compact").trigger("click");

    expect(getSectionExits).toHaveBeenCalledTimes(1);
  });
});
