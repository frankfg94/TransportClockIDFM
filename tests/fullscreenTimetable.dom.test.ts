import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MaterialCombobox from "../src/components/MaterialCombobox.vue";
import FullscreenStationPanel from "../src/components/FullscreenStationPanel.vue";
import LineFrequencyTimetable from "../src/features/line-map/LineFrequencyTimetable.vue";
import * as frequencyClient from "../src/services/lineFrequency";
import * as timetableClient from "../src/services/lineFrequencyTimetable";
import type { GtfsLineFrequencyResponse } from "../src/types/lineFrequency";
import type { GtfsLineTimetableResponse } from "../src/types/lineFrequencyTimetable";

const profile: GtfsLineFrequencyResponse = {
  lineId: "line:IDFM:TEST", serviceDate: "20261022", source: "gtfs", status: "ready",
  topologyAvailable: true, branched: false, average: {}, directions: [], sections: [], stationCount: 3, sampledStationCount: 3,
};
const timetable: GtfsLineTimetableResponse = {
  lineId: profile.lineId, serviceDate: profile.serviceDate, source: "gtfs", status: "ready",
  stops: [
    { id: "west", name: "West" },
    { id: "middle-platform", parentId: "middle", topologyId: "monomodalStopPlace:123", name: "Middle" },
    { id: "east", name: "East" },
  ],
  trips: [0, 10, 30].flatMap((minute, index) => [
    { id: `out-${index}`, serviceDate: profile.serviceDate, directionId: "0", headsign: "East", calls: ["west", "middle-platform", "east"].map((stopId, sequence) => ({ stopId, sequence, arrival: 6 * 3600 + (minute + sequence * 5) * 60, departure: 6 * 3600 + (minute + sequence * 5) * 60, pickupType: sequence === 2 ? 1 : 0, dropOffType: 0 })) },
    { id: `back-${index}`, serviceDate: profile.serviceDate, directionId: "1", headsign: "West", calls: ["east", "middle-platform", "west"].map((stopId, sequence) => ({ stopId, sequence, arrival: 7 * 3600 + (minute * 2 + sequence * 5) * 60, departure: 7 * 3600 + (minute * 2 + sequence * 5) * 60, pickupType: sequence === 2 ? 1 : 0, dropOffType: 0 })) },
  ]),
};
const stationId = "stop_area:IDFM:monomodalStopPlace:123";
const directions = [{ id: "east", label: "East", departures: [{ id: "departure", waitLabel: "4", destination: "East" }] }];
const wrappers: { unmount(): void }[] = [];
beforeEach(() => {
  vi.spyOn(frequencyClient, "fetchGtfsLineFrequency").mockResolvedValue(profile);
  vi.spyOn(timetableClient, "fetchGtfsLineTimetable").mockResolvedValue(timetable);
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});
function panel() {
  const wrapper = mount(FullscreenStationPanel, { props: { stationName: "Middle", stationId, lineId: profile.lineId, lineName: "Test line", lineShortName: "T", directions, design: "dense-list", keepScreenOn: false } });
  wrappers.push(wrapper);
  return wrapper;
}
describe("fullscreen shared timetable", () => {
  it.each(["stop_area:IDFM:123", "stop_point:IDFM:456", "STIF:StopPoint:Q:456:"])("resolves the exact IDFM alias %s through the timetable ids", (reference) => {
    const data = { ...timetable, stops: timetable.stops.map((stop) => stop.id === "middle-platform" ? { ...stop, id: "IDFM:456", parentId: "IDFM:123", topologyId: "FR::Quay:123:FR1" } : stop), trips: timetable.trips.map((trip) => ({ ...trip, calls: trip.calls.map((call) => ({ ...call, stopId: call.stopId === "middle-platform" ? "IDFM:456" : call.stopId })) })) };
    const wrapper = mount(LineFrequencyTimetable, { props: { profile, timetable: data, stationId: reference, stationName: "Middle" } });
    wrappers.push(wrapper);
    expect(wrapper.getComponent<typeof MaterialCombobox>('[data-testid="line-frequency-timetable-station"]').props("modelValue")).toBe("FR::Quay:123:FR1");
    expect(wrapper.find("table").exists()).toBe(true);
  });

  it("opens the map timetable with the exact line, station and direction, then returns without closing the panel", async () => {
    const wrapper = panel();
    await wrapper.get('[aria-expanded="false"]').trigger("click");
    await wrapper.get('[role="menuitem"]').trigger("click");
    await flushPromises();
    expect(frequencyClient.fetchGtfsLineFrequency).toHaveBeenCalledWith(profile.lineId, { signal: expect.any(AbortSignal), allowCoverageFallback: true });
    expect(timetableClient.fetchGtfsLineTimetable).toHaveBeenCalledWith(profile.lineId, { serviceDate: profile.serviceDate, signal: expect.any(AbortSignal) });
    const shared = wrapper.getComponent(LineFrequencyTimetable);
    expect(shared.props()).toMatchObject({ stationId, stationName: "Middle", directionDestinations: ["East"] });
    expect(shared.getComponent<typeof MaterialCombobox>('[data-testid="line-frequency-timetable-station"]').props("modelValue")).toBe("monomodalStopPlace:123");
    expect(shared.getComponent<typeof MaterialCombobox>('[data-testid="line-frequency-timetable-direction"]').props("modelValue")).toBe("context");
    expect(shared.findAll("thead th")).toHaveLength(2);
    expect(shared.get('[data-testid="line-frequency-timetable-first-departure"]').text()).toContain("6:05");
    expect(document.body.style.overflow).toBe("hidden");
    await wrapper.trigger("keydown", { key: "Escape" });
    expect(wrapper.findComponent(LineFrequencyTimetable).exists()).toBe(false);
    expect(wrapper.emitted("close")).toBeUndefined();
    expect(wrapper.find(".fullscreen-station-panel__dense-list").exists()).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("produces exactly the same cells when the map table selects the same station and sense", async () => {
    const fullscreen = mount(LineFrequencyTimetable, { props: { profile, timetable, stationId, stationName: "Middle", directionDestinations: ["East"] } });
    const map = mount(LineFrequencyTimetable, { props: { profile, timetable } });
    wrappers.push(fullscreen, map);
    expect(map.findAll("thead th")).toHaveLength(3);
    map.getComponent<typeof MaterialCombobox>('[data-testid="line-frequency-timetable-station"]').vm.$emit("update:modelValue", "monomodalStopPlace:123");
    await flushPromises();
    map.getComponent<typeof MaterialCombobox>('[data-testid="line-frequency-timetable-direction"]').vm.$emit("update:modelValue", "gtfs:0");
    await flushPromises();
    expect(map.get("table").text()).toBe(fullscreen.get("table").text());
    await fullscreen.setProps({ directionDestinations: ["West"] });
    expect(fullscreen.get('[data-testid="line-frequency-timetable-first-departure"]').text()).toContain("7:05");
    await fullscreen.setProps({ stationId: "unknown-station" });
    expect(fullscreen.find("table").exists()).toBe(false);
    expect(fullscreen.find('[data-testid="line-frequency-timetable-unavailable"]').exists()).toBe(true);
  });

  it("keeps an unmatched direction empty and does not reset a manual selection during a departure refresh", async () => {
    const wrapper = mount(LineFrequencyTimetable, { props: { profile, timetable, stationId, directionDestinations: ["Unknown"] } });
    wrappers.push(wrapper);
    expect(wrapper.find("table").exists()).toBe(false);
    wrapper.getComponent<typeof MaterialCombobox>('[data-testid="line-frequency-timetable-direction"]').vm.$emit("update:modelValue", "all");
    await flushPromises();
    await wrapper.setProps({ directionDestinations: ["Unknown"] });
    expect(wrapper.findAll("thead th")).toHaveLength(3);
  });

  it("separates short-turn destinations sharing a GTFS direction and keeps map/fullscreen parity", async () => {
    const data = { ...timetable, stops: [...timetable.stops, { id: "partial", name: "Partial terminus" }], trips: [...timetable.trips, ...timetable.trips.filter((trip) => trip.directionId === "0").map((trip) => ({ ...trip, id: `partial-${trip.id}`, headsign: "Partial terminus", calls: trip.calls.map((call) => ({ ...call, stopId: call.stopId === "east" ? "partial" : call.stopId })) }))] };
    const map = mount(LineFrequencyTimetable, { props: { profile, timetable: data, stationId } });
    const fullscreen = mount(LineFrequencyTimetable, { props: { profile, timetable: data, stationId, directionDestinations: ["Partial terminus"] } });
    wrappers.push(map, fullscreen);
    expect(map.findAll("thead th")).toHaveLength(4);
    map.getComponent<typeof MaterialCombobox>('[data-testid="line-frequency-timetable-direction"]').vm.$emit("update:modelValue", "gtfs:0:to:partial terminus");
    await flushPromises();
    expect(fullscreen.get("thead").text()).toContain("Partial terminus");
    expect(map.get("table").text()).toBe(fullscreen.get("table").text());
  });

  it("shows a failed profile and retries after closing and reopening", async () => {
    vi.mocked(frequencyClient.fetchGtfsLineFrequency).mockRejectedValueOnce(new Error("Unavailable"));
    const wrapper = panel();
    await wrapper.get('[aria-expanded="false"]').trigger("click");
    await wrapper.get('[role="menuitem"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="line-frequency-timetable-unavailable"]').attributes("role")).toBe("alert");
    await wrapper.get(".modal-panel__header button").trigger("click");
    await wrapper.get('[aria-expanded="false"]').trigger("click");
    await wrapper.get('[role="menuitem"]').trigger("click");
    await flushPromises();
    expect(wrapper.find("table").exists()).toBe(true);
  });

  it("aborts the profile when leaving during loading and ignores a late response", async () => {
    let resolveProfile!: (value: GtfsLineFrequencyResponse) => void;
    vi.mocked(frequencyClient.fetchGtfsLineFrequency).mockReturnValueOnce(new Promise((resolve) => { resolveProfile = resolve; }));
    const wrapper = panel();
    await wrapper.get('[aria-expanded="false"]').trigger("click");
    await wrapper.get('[role="menuitem"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="line-frequency-timetable-loading"]').exists()).toBe(true);
    const signal = vi.mocked(frequencyClient.fetchGtfsLineFrequency).mock.calls[0]![1]!.signal!;
    await wrapper.get(".modal-panel__header button").trigger("click");
    expect(signal.aborted).toBe(true);
    resolveProfile(profile);
    await flushPromises();
    expect(wrapper.findComponent(LineFrequencyTimetable).exists()).toBe(false);
    expect(timetableClient.fetchGtfsLineTimetable).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("hidden");
  });
});
