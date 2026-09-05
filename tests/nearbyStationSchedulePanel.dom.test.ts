import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NearbyStationSchedulePanel from "../src/features/nearby-stations/NearbyStationSchedulePanel.vue";
import type { NearbyStationScheduleItem } from "../src/features/nearby-stations/nearbyStationSchedules";
import type { BoardTrafficAlert } from "../src/features/traffic";

const item = {
  id: "station:rer:line:rer:B",
  stationId: "station:rer",
  line: {
    id: "line:rer:B",
    index: 1,
    code: "B",
    label: "B",
    mode: "RER",
    color: "#0078c8",
    textColor: "#fff",
    aliases: [],
    stationIds: [],
    geometryIds: [],
  },
  entry: {
    id: "station:rer",
    station: { id: "station:rer", name: "Croix de Berny" },
    memberStations: [],
    lines: [],
    distanceMeters: 2_300,
    insideRadius: true,
  },
  mapStation: { id: "station:rer", name: "Croix de Berny" },
  distanceMeters: 2_300,
  access: { kind: "connection", walkingSeconds: 720, totalSeconds: 1_620, feederLineCode: "T10" },
  state: "visible",
  result: {
    departures: [],
    directionGroups: [{
      id: "direction:mitry",
      label: "Mitry–Claye",
      departures: [{
        id: "departure:1",
        lineRef: "line:rer:B",
        monitoringRef: "monitoring:1",
        stopName: "Croix de Berny",
        destination: "Mitry–Claye",
        monitoringLabel: "Croix de Berny",
        expectedDepartureTime: new Date(Date.now() + 300_000).toISOString(),
        vehicleAtStop: false,
      }],
      serviceEnded: false,
    }],
  },
} as unknown as NearbyStationScheduleItem;

describe("NearbyStationSchedulePanel", () => {
  it("removes the list height limit in fullscreen and emits direction context menus", async () => {
    const wrapper = mount(NearbyStationSchedulePanel, {
      props: {
        items: [item],
        fullscreen: true,
        radiusMeters: 600,
      },
    });

    expect(wrapper.find(".nearby-schedule-panel--fullscreen .nearby-schedule-panel__cards").exists()).toBe(true);
    expect(wrapper.find(".nearby-schedule-panel__subtitle").text()).toBe("Dans un rayon de 600 m");
    expect(wrapper.find(".nearby-schedule-panel__sort").text()).toContain("Proximité");
    await wrapper.find(".nearby-schedule-board-card [data-direction-id] .direction-section__header").trigger("contextmenu");

    expect(wrapper.emitted("directionContextMenu")).toEqual([
      [item.id, "direction:mitry", "Mitry–Claye", expect.any(HTMLElement)],
    ]);
  });

  it("can route every station-card context menu to the station actions", async () => {
    const wrapper = mount(NearbyStationSchedulePanel, {
      props: {
        items: [item],
        contextMenuMode: "station",
      },
    });

    await wrapper.find(".nearby-schedule-board-card [data-direction-id] .direction-section__header").trigger("contextmenu");

    expect(wrapper.emitted("stationContextMenu")).toEqual([
      [item.stationId, expect.any(HTMLElement)],
    ]);
    expect(wrapper.emitted("directionContextMenu")).toBeUndefined();
  });

  it("keeps a finished board visible and marks its directions unavailable", () => {
    const finishedItem: NearbyStationScheduleItem = {
      ...item,
      result: {
        departures: [],
        directionGroups: [{
          id: "direction:finished",
          label: "Mitry–Claye",
          departures: [],
          lastDeparture: {
            groupId: "direction:finished",
            time: new Date(Date.now() - 3_600_000).toISOString(),
            destination: "Mitry–Claye",
          },
          serviceEnded: true,
        }],
      },
    };
    const wrapper = mount(NearbyStationSchedulePanel, {
      props: { items: [finishedItem] },
    });

    expect(wrapper.find(".nearby-schedule-board-card").exists()).toBe(true);
    expect(wrapper.text()).toContain("Termine");
  });

  it("hides schedule cards for modes disabled on the map", () => {
    const noctilienItem: NearbyStationScheduleItem = {
      ...item,
      id: "station:rer:line:noctilien:N",
      line: { ...item.line, id: "line:noctilien:N", code: "N", label: "N", mode: "NOCTILIEN" },
    };
    const wrapper = mount(NearbyStationSchedulePanel, {
      props: {
        items: [item, noctilienItem],
        activeModes: ["RER"],
      },
    });

    expect(wrapper.findAll(".nearby-schedule-board-card")).toHaveLength(1);
    expect(wrapper.text()).toContain("B");
    expect(wrapper.text()).not.toContain("N");
  });

  it("shows only the focused station and two departures per direction", async () => {
    const departure = (id: string, minutes: number) => ({
      id,
      lineRef: item.line.id,
      monitoringRef: id,
      stopName: "Croix de Berny",
      destination: "Mitry–Claye",
      monitoringLabel: "Croix de Berny",
      expectedDepartureTime: new Date(Date.now() + minutes * 60_000).toISOString(),
      vehicleAtStop: false,
    });
    const focusedItem: NearbyStationScheduleItem = {
      ...item,
      result: {
        departures: [],
        directionGroups: [
          {
            id: "direction:one",
            label: "Direction 1",
            departures: [departure("one:1", 1), departure("one:2", 4), departure("one:3", 8)],
            serviceEnded: false,
          },
          {
            id: "direction:two",
            label: "Direction 2",
            departures: [departure("two:1", 2), departure("two:2", 5), departure("two:3", 9)],
            serviceEnded: false,
          },
        ],
      },
    };
    const otherItem: NearbyStationScheduleItem = {
      ...focusedItem,
      id: "station:other:line:rer:B",
      stationId: "station:other",
      entry: {
        ...focusedItem.entry,
        id: "station:other",
        station: { ...focusedItem.entry.station, id: "station:other", name: "Antony" },
      },
    };
    const wrapper = mount(NearbyStationSchedulePanel, {
      props: {
        items: [focusedItem, otherItem],
        focusedStationId: item.stationId,
      },
    });

    expect(wrapper.findAll(".nearby-schedule-board-card")).toHaveLength(1);
    expect(wrapper.findAll(".nearby-schedule-board-card [data-direction-id]")).toHaveLength(2);
    expect(wrapper.findAll(".nearby-schedule-board-card .last-service__time")).toHaveLength(4);

    await wrapper.get(".nearby-schedule-panel__back").trigger("click");
    expect(wrapper.emitted("clearStationFocus")).toEqual([[]]);
  });

  it("renders the shared traffic chip and forwards its modal event", async () => {
    const alert: BoardTrafficAlert = {
      label: "Interruption",
      target: { alertId: "disruption:1", lineRef: "line:rer:B", trafficTab: "current" },
      tone: "red",
    };
    const wrapper = mount(NearbyStationSchedulePanel, {
      props: {
        items: [item],
        trafficAlertForItem: () => alert,
      },
    });

    const chip = wrapper.get(".board-traffic-chip");
    expect(chip.text()).toBe("Interruption");

    await chip.trigger("click");
    expect(wrapper.emitted("openTraffic")).toEqual([[item, alert]]);
  });

  it("offers all nearby-card actions except changing the map-bound station", async () => {
    const wrapper = mount(NearbyStationSchedulePanel, {
      props: { items: [item], directionVisible: () => true },
      global: {
        stubs: {
          ContextMenu: {
            props: ["open"],
            template: "<div v-if='open' class='context-menu-stub'><slot /></div>",
          },
        },
      },
    });

    await wrapper.get(".board-actions__trigger").trigger("click");
    const menu = wrapper.get(".context-menu-stub");
    expect(menu.text()).toContain("Schéma de la ligne");
    expect(menu.text()).toContain("Affichage panneau");
    expect(menu.text()).toContain("Filtrer les directions");
    expect(menu.text()).toContain("Supprimer");
    expect(menu.text()).not.toContain("Changer de station");

    await menu.findAll("button")[0]!.trigger("click");
    expect(wrapper.emitted("openLinePage")?.[0]).toEqual([item, expect.any(Object)]);
    await wrapper.get(".board-actions__trigger").trigger("click");
    await wrapper.get(".context-menu-stub").findAll("button")[1]!.trigger("click");
    expect(wrapper.emitted("openFullscreenPanel")?.[0]).toEqual([item, expect.any(Object)]);
    await wrapper.get(".board-actions__trigger").trigger("click");
    await wrapper.get(".context-menu-stub").findAll("button").at(-1)!.trigger("click");
    expect(wrapper.emitted("removeItem")).toEqual([[item.id]]);
  });
});
