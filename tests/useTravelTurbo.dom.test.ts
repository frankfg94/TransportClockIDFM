import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTravelTurbo } from "../src/features/nearby-stations/useTravelTurbo";
import { turboTime, type TravelTurboProvider, type TurboResult } from "../src/features/nearby-stations/travelTurbo";
import type { TravelRoute } from "../src/features/nearby-stations/useTravelRoutes";
import TravelTurboPanel from "../src/features/nearby-stations/TravelTurboPanel.vue";
import TravelTurboLines from "../src/features/nearby-stations/TravelTurboLines.vue";
import LeftNearbySidebarBodyTravel from "../src/features/nearby-stations/LeftNearbySidebarBodyTravel.vue";

const initial: TravelRoute = { id: "base", departureDateTime: "20260909T203600", arrivalDateTime: "20260909T211000", durationSeconds: 2040,
  sections: [{ lineId: "line:IDFM:C1", lineCode: "T10", fromStopPointId: "stop_point:IDFM:1", toStopPointId: "stop_point:IDFM:2", durationSeconds: 2040, departureDateTime: "20260909T203600", arrivalDateTime: "20260909T211000" }], transitSections: [] };
initial.transitSections = initial.sections;
const later: TravelRoute = { ...initial, id: "later", departureDateTime: "20260909T204200", arrivalDateTime: "20260909T210500", durationSeconds: 1380,
  sections: initial.sections.map((s) => ({ ...s, departureDateTime: "20260909T204200", arrivalDateTime: "20260909T210500" })) };
later.transitSections = later.sections;
const result = (): TurboResult => ({ status: "partial", analyzedAt: "2026-09-09T18:30:00Z", proposals: [later], winners: { fastest: "later", smooth: "later" }, currentOptimal: {} });

function harness(provider: TravelTurboProvider) {
  let turbo!: ReturnType<typeof useTravelTurbo>;
  const wrapper = mount(defineComponent({ setup() {
    turbo = useTravelTurbo({ routes: ref([initial]), departureDateTime: ref(""), provider, now: () => turboTime("20260909T203000")! });
    return () => null;
  } }));
  return { wrapper, turbo };
}
afterEach(() => vi.useRealTimers());

describe("Turbo lifecycle", () => {
  it("starts only on detail opening, merges winners and switches strategy without requesting again", async () => {
    const analyze = vi.fn(async () => result());
    const { wrapper, turbo } = harness({ analyze });
    expect(analyze).not.toHaveBeenCalled();
    turbo.open(initial);
    expect(turbo.status.value).toBe("loading");
    expect(turbo.mergedRoutes.value.map((r) => r.id)).toEqual(["base"]);
    await flushPromises();
    expect(turbo.mergedRoutes.value.map((r) => r.id)).toEqual(["base", "later"]);
    turbo.strategy.value = "smooth";
    turbo.open(later);
    expect(analyze).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it("refreshes every 30 seconds and stops on closure", async () => {
    vi.useFakeTimers();
    const analyze = vi.fn(async () => result());
    const { wrapper, turbo } = harness({ analyze });
    turbo.open(initial); await flushPromises();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(analyze).toHaveBeenCalledTimes(2);
    turbo.close(); await vi.advanceTimersByTimeAsync(60_000);
    expect(analyze).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it("rejects late responses after reset, closing and changing route", async () => {
    let resolve!: (value: TurboResult) => void;
    let signal!: AbortSignal;
    const { wrapper, turbo } = harness({ analyze: vi.fn((request) => { signal = request.signal; return new Promise<TurboResult>((done) => { resolve = done; }); }) });
    turbo.open(initial); turbo.reset();
    expect(signal.aborted).toBe(true);
    resolve(result()); await flushPromises();
    expect(turbo.result.value).toBeUndefined();
    expect(turbo.mergedRoutes.value).toHaveLength(1);
    wrapper.unmount();
  });
  it("reuses an existing proposal identity instead of duplicating it", async () => {
    const duplicate = { ...initial, id: "generated" };
    const { wrapper, turbo } = harness({ analyze: async () => ({ ...result(), proposals: [duplicate], winners: { fastest: "generated" } }) });
    turbo.open(initial); await flushPromises();
    expect(turbo.mergedRoutes.value).toHaveLength(1);
    expect(turbo.winnerId.value).toBe("base");
    wrapper.unmount();
  });
  it("retains existing results during an error without calling them optimal", async () => {
    vi.useFakeTimers();
    const analyze = vi.fn().mockResolvedValueOnce({ ...result(), status: "ready" }).mockRejectedValueOnce(new Error("offline"));
    const { wrapper, turbo } = harness({ analyze });
    turbo.open(initial); await flushPromises();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(turbo.status.value).toBe("error");
    expect(turbo.mergedRoutes.value).toHaveLength(2);
    expect(turbo.alreadyOptimal.value).toBe(false);
    wrapper.unmount();
  });
});

describe("Turbo comparison UI", () => {
  it("keeps the line chain in a dumb presentational component", () => {
    const wrapper = mount(TravelTurboLines, {
      props: { sections: [{ lineId: "line:IDFM:C1", lineCode: "T10", lineMode: "TRAM", durationSeconds: 600 }], showLineIcons: false },
      global: { stubs: { LineIconBadge: true } },
    });
    expect(wrapper.find(".travel-turbo__lines").exists()).toBe(true);
    expect(wrapper.text()).toContain("T10");
  });

  it("shows the first transport countdown and excludes only its initial wait", async () => {
    const waited: TravelRoute = {
      id: "waited",
      departureDateTime: "20260909T203000",
      arrivalDateTime: "20260909T210800",
      durationSeconds: 38 * 60,
      sections: [
        { type: "waiting", mode: "waiting", durationSeconds: 11 * 60, departureDateTime: "20260909T203000", arrivalDateTime: "20260909T204100" },
        { lineId: "line:IDFM:C1", lineCode: "T10", lineMode: "TRAM", durationSeconds: 10 * 60, departureDateTime: "20260909T204100", arrivalDateTime: "20260909T205100" },
        { type: "street_network", mode: "walking", durationSeconds: 3 * 60, departureDateTime: "20260909T205100", arrivalDateTime: "20260909T205400" },
        { type: "waiting", mode: "waiting", durationSeconds: 3 * 60, departureDateTime: "20260909T205400", arrivalDateTime: "20260909T205700" },
        { lineId: "line:IDFM:C01743", lineCode: "B", lineMode: "RER", durationSeconds: 10 * 60, departureDateTime: "20260909T205700", arrivalDateTime: "20260909T210700" },
        { type: "street_network", mode: "walking", durationSeconds: 60, departureDateTime: "20260909T210700", arrivalDateTime: "20260909T210800" },
      ],
      transitSections: [],
    };
    waited.transitSections = waited.sections.filter((section) => Boolean(section.lineId));
    const { wrapper: host, turbo } = harness({ analyze: async () => result() });
    turbo.open(waited); await flushPromises();
    const panel = mount(TravelTurboPanel, { props: { turbo, routes: [waited], currentRouteId: waited.id }, global: { stubs: { LineIconBadge: true } } });
    await panel.find(".travel-turbo__action").trigger("click");
    expect(panel.find(".travel-turbo__times").text()).toContain("27 min");
    expect(panel.find(".travel-turbo__departure").text()).toBe("Départ dans 11 min");
    expect(panel.find(".travel-turbo__walking").text()).toContain("3 min");
    expect(panel.find(".travel-turbo__waiting").text()).toContain("3 min");
    panel.unmount(); host.unmount();
  });

  it("ranks walking options by their real duration and uses compact hour text", async () => {
    const walking: TravelRoute = {
      id: "walking",
      departureDateTime: "20260909T203000",
      arrivalDateTime: "20260909T214000",
      durationSeconds: 70 * 60,
      sections: [{ type: "street_network", mode: "walking", durationSeconds: 70 * 60, departureDateTime: "20260909T203000", arrivalDateTime: "20260909T214000" }],
      transitSections: [],
    };
    const shorterWalking: TravelRoute = {
      id: "shorter-walking",
      departureDateTime: "20260909T203000",
      arrivalDateTime: "20260909T213500",
      durationSeconds: 65 * 60,
      sections: [{ type: "street_network", mode: "walking", durationSeconds: 65 * 60, departureDateTime: "20260909T203000", arrivalDateTime: "20260909T213500" }],
      transitSections: [],
    };
    const transit: TravelRoute = {
      id: "transit",
      departureDateTime: "20260909T204000",
      arrivalDateTime: "20260909T212500",
      durationSeconds: 45 * 60,
      sections: [{ lineId: "line:IDFM:C1", lineCode: "T10", lineMode: "TRAM", durationSeconds: 45 * 60, departureDateTime: "20260909T204000", arrivalDateTime: "20260909T212500" }],
      transitSections: [],
    };
    transit.transitSections = transit.sections;
    const { wrapper: host, turbo } = harness({ analyze: async () => result() });
    turbo.open(walking); await flushPromises();
    const panel = mount(TravelTurboPanel, { props: { turbo, routes: [walking, shorterWalking, transit], currentRouteId: walking.id }, global: { stubs: { LineIconBadge: true } } });
    await panel.find(".travel-turbo__action").trigger("click");
    expect(panel.findAll(".travel-turbo__route").map((route) => route.text())).toEqual([
      expect.stringContaining("1h05"),
      expect.stringContaining("1h10"),
    ]);
    panel.unmount(); host.unmount();
  });

  it("keeps Turbo on the selected correspondence chain and only admits a faster one-line variation", async () => {
    const makeRoute = (id: string, lines: string[], durationMinutes: number, departureDateTime: string, arrivalDateTime: string): TravelRoute => {
      const sections = lines.map((line) => ({
        lineId: `line:IDFM:${line}`,
        lineCode: line,
        durationSeconds: Math.floor(durationMinutes * 60 / lines.length),
        departureDateTime,
        arrivalDateTime,
      }));
      return { id, departureDateTime, arrivalDateTime, durationSeconds: durationMinutes * 60, sections, transitSections: sections };
    };
    const selected = makeRoute("selected", ["T10", "B"], 39, "20260909T235800", "20260910T003700");
    const sameCorrespondences = makeRoute("same-correspondences", ["T10", "B"], 44, "20260909T235900", "20260910T004300");
    const fasterOneLineVariation = makeRoute("faster-one-line-variation", ["T10", "4"], 35, "20260909T235800", "20260910T003300");
    const slowerOneLineVariation = makeRoute("slower-one-line-variation", ["T10", "4"], 50, "20260909T235800", "20260910T004800");
    const completelyAlternative = makeRoute("completely-alternative", ["N62", "N123", "N13"], 20, "20260909T235800", "20260910T001800");
    const { wrapper: host, turbo } = harness({ analyze: async () => result() });
    turbo.open(selected); await flushPromises();
    const panel = mount(TravelTurboPanel, {
      props: { turbo, routes: [selected, sameCorrespondences, fasterOneLineVariation, slowerOneLineVariation, completelyAlternative], currentRouteId: selected.id, showLineIcons: false },
      global: { stubs: { LineIconBadge: true } },
    });
    await panel.find(".travel-turbo__action").trigger("click");

    const cards = panel.findAll(".travel-turbo__route");
    expect(cards).toHaveLength(3);
    expect(cards[0]!.text()).toContain("23:58");
    expect(cards[0]!.text()).toContain("35 min");
    expect(cards[1]!.text()).toContain("39 min");
    expect(cards[2]!.text()).toContain("44 min");
    expect(panel.text()).toContain("T10");
    expect(panel.text()).toContain("B");
    expect(panel.text()).toContain("4");
    expect(panel.text()).not.toContain("N62");
    expect(panel.text()).not.toContain("50 min");
    panel.unmount(); host.unmount();
  });

  it("starts through the shared detail component and pauses when its sidebar is hidden", async () => {
    vi.useFakeTimers();
    const analyze = vi.fn(async () => result());
    const visible = ref(true);
    let turbo!: ReturnType<typeof useTravelTurbo>;
    const wrapper = mount(defineComponent({ setup() {
      turbo = useTravelTurbo({ routes: ref([initial]), departureDateTime: ref(""), provider: { analyze } });
      return () => h(LeftNearbySidebarBodyTravel, { routes: turbo.mergedRoutes.value, turbo, detailsVisible: visible.value,
        selectedRouteId: initial.id, destination: { lon: 2.3, lat: 48.8, label: "Destination" } });
    } }), { global: { stubs: { LineIconBadge: true } } });
    expect(analyze).not.toHaveBeenCalled();
    await wrapper.find('.left-nearby-travel__route-compact').trigger('click');
    await flushPromises();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.left-nearby-travel__timeline').exists()).toBe(true);
    expect(wrapper.find('.left-nearby-travel__timeline').attributes('style') ?? '').not.toContain('display: none');
    expect(wrapper.find('.travel-turbo__action').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.left-nearby-travel__timeline-toggle').text()).toContain('Replier les étapes du trajet');
    await wrapper.find('.left-nearby-travel__timeline-toggle').trigger('click');
    expect(wrapper.find('.left-nearby-travel__timeline-toggle').attributes('aria-expanded')).toBe('false');
    await wrapper.find('.travel-turbo__action').trigger('click');
    expect(wrapper.find('.travel-turbo').classes()).toContain('travel-turbo--fill');
    expect(wrapper.findAll('.travel-turbo__route')).toHaveLength(2);
    expect(wrapper.find('.left-nearby-travel__inputs').attributes('style')).toContain("display: none");
    visible.value = false; await flushPromises();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(analyze).toHaveBeenCalledTimes(1);
    visible.value = true; await flushPromises();
    expect(analyze).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it("keeps the original, renders chronological times and exposes the two strategies", async () => {
    const { wrapper: host, turbo } = harness({ analyze: async () => result() });
    turbo.open(initial); await flushPromises();
    const panel = mount(TravelTurboPanel, { props: { turbo, routes: [later, initial], currentRouteId: initial.id }, global: { stubs: { LineIconBadge: true } } });
    expect(panel.find('.travel-turbo__action').attributes('aria-expanded')).toBe('false');
    await panel.find('.travel-turbo__action').trigger('click');
    expect(panel.findAll('.travel-turbo__route').map((r) => r.text())).toEqual([expect.stringContaining("20:42"), expect.stringContaining("20:36")]);
    expect(panel.findAll('.travel-turbo__departure').map((node) => node.text())).toEqual(["Départ dans 12 min", "Départ dans 6 min"]);
    await panel.find('.travel-turbo__action').trigger('click');
    expect(panel.findAll('.travel-turbo__route')).toHaveLength(0);
    const choices = panel.findAll('.travel-turbo__choices button');
    expect(choices).toHaveLength(0);
    await panel.find('.travel-turbo__action').trigger('click');
    const strategyTrigger = panel.get('.travel-turbo__choices .material-combobox__trigger');
    await strategyTrigger.trigger('click');
    const expandedChoices = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.material-combobox__option'));
    expect(expandedChoices).toHaveLength(2);
    expandedChoices[1]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    expect(turbo.strategy.value).toBe("smooth");
    await panel.findAll('.travel-turbo__route')[0]!.trigger('click');
    expect(panel.emitted('select')?.[0]?.[0]).toEqual(later);
    expect(panel.text()).toContain("partielle");
    panel.unmount(); host.unmount();
  });
});
