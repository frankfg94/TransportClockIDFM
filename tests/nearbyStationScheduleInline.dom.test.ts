import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import NearbyStationScheduleInline from "../src/features/nearby-stations/NearbyStationScheduleInline.vue";
import type { NearbyStationScheduleItem } from "../src/features/nearby-stations/nearbyStationSchedules";

const item = {
  id: "station:bus:line:42",
  stationId: "station:bus",
  line: {
    id: "line:bus:42",
    index: 1,
    code: "42",
    label: "42",
    mode: "BUS",
    color: "#5146ff",
    textColor: "#fff",
    aliases: [],
    stationIds: [],
    geometryIds: [],
  },
  entry: {
    id: "station:bus",
    station: { id: "station:bus", name: "République" },
    memberStations: [],
    lines: [],
    distanceMeters: 120,
    insideRadius: true,
  },
  mapStation: { id: "station:bus", name: "République" },
  distanceMeters: 120,
  state: "visible",
  result: {
    departures: [],
    directionGroups: [],
  },
} as unknown as NearbyStationScheduleItem;

describe("NearbyStationScheduleInline", () => {
  it("uses a compact crossed-circle indicator and the planned-departure tooltip when empty", () => {
    const wrapper = mount(NearbyStationScheduleInline, {
      props: {
        items: [item],
        stationId: item.stationId,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });

    const disabled = wrapper.get(".nearby-map__inline-schedules-disabled");
    expect(disabled.attributes("title")).toBe("Aucun passage prévu pour le moment");
    expect(disabled.find("svg").exists()).toBe(true);
    expect(disabled.classes()).toContain("nearby-map__inline-schedules-disabled");
  });

  it("uses the same compact indicator after the last service", () => {
    const finished = {
      ...item,
      result: {
        departures: [],
        directionGroups: [{
          id: "direction:finished",
          label: "Terminus",
          departures: [],
          serviceEnded: true,
        }],
      },
    } as unknown as NearbyStationScheduleItem;
    const wrapper = mount(NearbyStationScheduleInline, {
      props: { items: [finished], stationId: finished.stationId },
      global: { stubs: { LineIconBadge: true } },
    });

    expect(wrapper.find(".nearby-map__inline-schedules--empty").exists()).toBe(false);
    expect(wrapper.get(".nearby-map__inline-schedules-disabled").attributes("title"))
      .toBe("Aucun passage prévu pour le moment");
  });

  it("marks a station when every schedule request is unavailable", () => {
    const unavailable = {
      ...item,
      state: "unavailable" as const,
      result: undefined,
    } as unknown as NearbyStationScheduleItem;
    const wrapper = mount(NearbyStationScheduleInline, {
      props: {
        items: [unavailable],
        stationId: unavailable.stationId,
      },
      global: {
        stubs: {
          LineIconBadge: true,
        },
      },
    });

    const disabled = wrapper.get(".nearby-map__inline-schedules-disabled");
    expect(disabled.classes()).toContain("nearby-map__inline-schedules-disabled--unavailable");
    expect(disabled.attributes("title")).toBe("Horaires momentanément indisponibles");
  });

  it("reveals the direction below the schedule badge after a sustained hover", async () => {
    vi.useFakeTimers();
    try {
      const departureTime = new Date(Date.now() + 120_000).toISOString();
      const scheduled = {
        ...item,
        tooltipDirections: [{ id: "direction:centre", label: "Centre", orientation: "east" as const }],
        result: {
          departures: [{ expectedDepartureTime: departureTime }],
          directionGroups: [{
            id: "direction:centre",
            label: "Centre",
            departures: [{ expectedDepartureTime: departureTime }],
          }],
        },
      } as unknown as NearbyStationScheduleItem;
      const wrapper = mount(NearbyStationScheduleInline, {
        props: { items: [scheduled], stationId: scheduled.stationId },
        global: { stubs: { LineIconBadge: true } },
      });
      const badge = wrapper.get(".nearby-map__inline-schedules");

      await badge.trigger("mouseenter");
      await vi.advanceTimersByTimeAsync(499);
      await nextTick();
      expect(wrapper.find(".nearby-map__inline-schedule-direction").exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await nextTick();
      expect(wrapper.get(".nearby-map__inline-schedule-direction").text()).toContain("Direction Centre");
      expect(wrapper.get(".nearby-map__inline-schedule-orientation").text()).toBe("(Est)");
      expect(wrapper.get(".nearby-map__inline-schedules").classes()).toContain("nearby-map__inline-schedules--expanded");

      await badge.trigger("mouseleave");
      expect(wrapper.find(".nearby-map__inline-schedule-direction").exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides only lines whose next departure is more than one hour away", () => {
    const soon = new Date(Date.now() + 3 * 60_000).toISOString();
    const later = new Date(Date.now() + 559 * 60_000).toISOString();
    const withSchedules = [
      {
        ...item,
        id: "station:bus:line:194",
        line: { ...item.line, id: "line:bus:194", code: "194", label: "194" },
        result: {
          departures: [{ expectedDepartureTime: soon }],
          directionGroups: [{ id: "direction:194", label: "Centre", departures: [{ expectedDepartureTime: soon }] }],
        },
      },
      {
        ...item,
        id: "station:bus:line:n63",
        line: { ...item.line, id: "line:bus:n63", code: "N63", label: "N63" },
        result: {
          departures: [{ expectedDepartureTime: later }],
          directionGroups: [{ id: "direction:n63", label: "Centre", departures: [{ expectedDepartureTime: later }] }],
        },
      },
    ] as unknown as NearbyStationScheduleItem[];

    const wrapper = mount(NearbyStationScheduleInline, {
      props: {
        items: withSchedules,
        stationId: item.stationId,
        hideLongWaitTransports: true,
      },
      global: { stubs: { LineIconBadge: true } },
    });

    expect(wrapper.findAll(".nearby-map__inline-schedule")).toHaveLength(1);
    expect(wrapper.get(".nearby-map__inline-schedule-time").text()).toBe("3 min");
    expect(wrapper.text()).not.toContain("559 min");
  });

  it("dims non-feeder lines at a shared stop when a heavy route is focused", () => {
    const bus195Departure = new Date(Date.now() + 3 * 60_000).toISOString();
    const bus394Departure = new Date(Date.now() + 9 * 60_000).toISOString();
    const sharedStopItems = [
      {
        ...item,
        id: "station:bus:line:195",
        line: { ...item.line, id: "line:bus:195", code: "195", label: "195" },
        result: {
          departures: [{ expectedDepartureTime: bus195Departure }],
          directionGroups: [{
            id: "direction:195",
            label: "Centre",
            departures: [{ expectedDepartureTime: bus195Departure }],
          }],
        },
      },
      {
        ...item,
        id: "station:bus:line:394",
        line: { ...item.line, id: "line:bus:394", code: "394", label: "394" },
        result: {
          departures: [{ expectedDepartureTime: bus394Departure }],
          directionGroups: [{
            id: "direction:394",
            label: "Métro 12",
            departures: [{ expectedDepartureTime: bus394Departure }],
          }],
        },
      },
    ] as unknown as NearbyStationScheduleItem[];
    const wrapper = mount(NearbyStationScheduleInline, {
      props: {
        items: sharedStopItems,
        stationId: item.stationId,
        emphasizedLineIds: new Set(["line:bus:394"]),
      },
      global: { stubs: { LineIconBadge: true } },
    });

    const rows = wrapper.findAll(".nearby-map__inline-schedule");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.classes()).toContain("nearby-map__inline-schedule--muted");
    expect(rows[1]!.classes()).not.toContain("nearby-map__inline-schedule--muted");
  });
});
