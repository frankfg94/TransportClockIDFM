import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import LineOptimizerPage from "../src/features/line-optimizer/LineOptimizerPage.vue";
import { velizyOptimizerConfig, resolveLineOptimizerConfig } from "../src/features/line-optimizer/optimizerConfig";
import type { LineOptimizerCandidate } from "../src/features/line-optimizer/lineOptimizer";
import {
  DEFAULT_OPTIMIZER_SETTINGS,
  enumerateOptimizerCandidates,
} from "../src/features/line-optimizer/lineOptimizer";
import type { TravelRoute } from "../src/features/nearby-stations/useTravelRoutes";
import { translate } from "../src/i18n/i18n";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  selectAddress: vi.fn(),
  winner: undefined as LineOptimizerCandidate | undefined,
}));
vi.mock("../src/features/line-optimizer/useLineOptimizer", () => ({
  useLineOptimizer: () => ({
    originQuery: ref("277 avenue de la Division Leclerc"),
    destinationQuery: ref("Châtelet les Halles"),
    originPoint: ref(),
    destinationPoint: ref(),
    settings: ref({ ...DEFAULT_OPTIMIZER_SETTINGS }),
    result: ref(),
    status: ref("idle"),
    errorPhase: ref("locations"),
    candidates: ref([]),
    winner: ref(mocks.winner),
    now: ref(Date.now()),
    refresh: mocks.refresh,
    selectAddress: mocks.selectAddress,
  }),
}));
vi.mock("../src/i18n", () => ({
  useI18n: () => ({
    t: (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
      translate("fr", key, params),
    d: (date: Date, options?: Intl.DateTimeFormatOptions) =>
      date.toLocaleTimeString("fr-FR", options),
    n: (value: number) => String(value),
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
  mocks.winner = undefined;
});
describe("standalone optimizer page", () => {
  it.each([0, 120])(
    "renders separate T10 platform steps with %i seconds waiting",
    (waitSeconds) => {
      const base = Date.parse("2026-10-22T08:00:00Z");
      const at = (seconds: number) => base + seconds * 1000;
      const sections = [
        {
          type: "public_transport",
          durationSeconds: 300,
          lineCode: "T6",
          lineMode: "TRAM" as const,
          fromName: "Parc André Malraux",
          toName: "La Vallée",
        },
        { type: "transfer", durationSeconds: 120 },
        {
          type: "public_transport",
          durationSeconds: 600,
          lineCode: "T10",
          lineMode: "TRAM" as const,
          fromName: "La Vallée",
          toName: "La Croix de Berny",
        },
        { type: "transfer", durationSeconds: 180 },
        {
          type: "public_transport",
          durationSeconds: 1500,
          lineCode: "B",
          lineMode: "RER" as const,
          fromName: "La Croix de Berny",
          toName: "Châtelet les Halles",
        },
      ];
      const route: TravelRoute = {
        id: "t10",
        sections,
        transitSections: sections.filter((s) => s.lineMode),
        durationSeconds: 2700,
      };
      const course = (id: string, departure: number, arrival: number) => ({
        id,
        departure: at(departure),
        arrival: at(arrival),
        baseDeparture: at(departure),
        baseArrival: at(arrival),
        source: "schedule" as const,
      });
      mocks.winner = enumerateOptimizerCandidates(
        route,
        [
          [course("feeder", 300, 600)],
          [course("tram", 720 + waitSeconds, 1320 + waitSeconds)],
          [course("rer", 1800 + waitSeconds, 3300 + waitSeconds)],
        ],
        { ...DEFAULT_OPTIMIZER_SETTINGS },
        base,
        resolveLineOptimizerConfig("tram", "T10")!,
      )[0]!;
      const wrapper = mount(LineOptimizerPage, {
        props: { config: resolveLineOptimizerConfig("tram", "T10")! },
        global: { stubs: { AdressBook: true } },
      });
      const walk = wrapper.get('[data-connection-kind="walk"][data-course-index="1"]');
      expect(walk.get("strong").text()).toBe("10:10");
      expect(walk.get("div > span").text()).toBe("Rejoindre le quai à La Vallée");
      expect(walk.get("small").text()).toBe("2 min");
      const wait = wrapper.find('[data-connection-kind="wait"][data-course-index="1"]');
      expect(wait.exists()).toBe(waitSeconds > 0);
      if (waitSeconds > 0) {
        expect(wait.get("strong").text()).toBe("10:12");
        expect(wait.text()).toContain("2 min d’attente avant ce transport");
        expect(wait.get("small").text()).toBe("La Vallée");
      }
      expect(wrapper.find('[data-connection-kind="wait"][data-course-index="0"]').exists()).toBe(
        false,
      );
      const rerWalk = wrapper.get('[data-connection-kind="walk"][data-course-index="2"]');
      expect(rerWalk.get("small").text()).toBe("3 min");
      const rerWait = wrapper.get('[data-connection-kind="wait"][data-course-index="2"]');
      expect(rerWait.text()).toContain("5 min d’attente avant ce transport");
      expect(
        wrapper.findAll(".line-optimizer__totals strong").map((total) => total.text()),
      ).toEqual([`${52.5 + waitSeconds / 60} min`, `${5 + waitSeconds / 60} min`]);
      wrapper.unmount();
    },
  );
  it("renders translated labels and the user's timing defaults", async () => {
    const wrapper = mount(LineOptimizerPage, {
      props: { config: resolveLineOptimizerConfig("tram", "T10")! },
      global: { stubs: { AdressBook: true } },
    });
    expect(wrapper.get("h1").text()).toBe("T10 Optimizer");
    expect(wrapper.text()).toContain("Correspondance tram → RER (secondes)");
    expect(
      wrapper
        .findAll('input[type="number"]')
        .slice(0, 4)
        .map((input) => (input.element as HTMLInputElement).value),
    ).toEqual(["60", "90", "180", "30"]);
    await wrapper.get("form").trigger("submit");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it("renders every service and includes feeder waiting in the total", () => {
    const base = Date.now() + 600_000;
    const courses = [0, 1, 2].map((i) => ({
      id: String(i),
      departure: base + i * 600_000,
      arrival: base + i * 600_000 + 300_000,
      baseDeparture: base + i * 600_000,
      baseArrival: base + i * 600_000 + 300_000,
      source: "schedule" as const,
    }));
    const sections = ["T6", "T10", "B"].map((lineCode, i) => ({
      type: "public_transport",
      durationSeconds: 300,
      lineCode,
      lineMode: i === 2 ? ("RER" as const) : ("TRAM" as const),
      fromName: `Origin ${i}`,
      toName: `Stop ${i}`,
    }));
    mocks.winner = {
      id: "chain",
      route: { id: "route", sections, transitSections: sections, durationSeconds: 1500 },
      courses,
      corridorIndex: 1,
      waits: [0, 120, 180],
      totalWaitSeconds: 300,
      tram: courses[1]!,
      train: courses[2]!,
      leaveAt: base - 150_000,
      walkAt: base - 90_000,
      platformAt: base + 1_020_000,
      arriveAt: base + 1_500_000,
      walkSeconds: 90,
      transferSeconds: 180,
      providerWalkSeconds: 90,
      providerTransferSeconds: 180,
      waitSeconds: 180,
    };
    const wrapper = mount(LineOptimizerPage, {
      props: { config: resolveLineOptimizerConfig("tram", "T10")! },
      global: { stubs: { AdressBook: true } },
    });
    expect(wrapper.text()).toContain("Prendre le T6");
    expect(wrapper.text()).toContain("Prendre le T10");
    expect(wrapper.text()).toContain("Prendre le RER B");
    expect(wrapper.get(".line-optimizer__totals").text()).toContain("5 min");
    expect(wrapper.text()).toContain("2 min d’attente avant ce transport");
    wrapper.unmount();
  });
  it("opens the shared address book for a destination and forwards saved selections", async () => {
    const wrapper = mount(LineOptimizerPage, {
      props: { config: resolveLineOptimizerConfig("tram", "T10")! },
      global: { stubs: { AdressBook: true } },
    });
    await wrapper
      .get('button[aria-label="Choisir la destination dans le carnet d’adresses"]')
      .trigger("click");
    const book = wrapper.findComponent({ name: "AdressBook" });
    expect(book.props("open")).toBe(true);
    const entry = {
      id: "saved",
      name: "Travail",
      kind: "address",
      lon: 2.35,
      lat: 48.86,
      icon: "work",
    };
    book.vm.$emit("select", entry);
    await flushPromises();
    expect(mocks.selectAddress).toHaveBeenCalledWith(entry, "destination");
    wrapper.unmount();
  });
});


it.each(["BUS", "TRAM"] as const)("does not describe a %s stopping pattern as unconfirmed", (mode) => {
  const base = Date.now() + 600_000;
  const courses = [0, 1].map((i) => ({ id: String(i), departure: base + i * 600_000, arrival: base + i * 600_000 + 300_000, baseDeparture: base + i * 600_000, baseArrival: base + i * 600_000 + 300_000, source: "schedule" as const }));
  const sections = [{ type: "public_transport", durationSeconds: 300, lineCode: "T10", lineMode: "TRAM" as const }, { type: "public_transport", durationSeconds: 300, lineCode: "179", lineMode: mode }];
  mocks.winner = { id: "route", route: { id: "route", sections, transitSections: sections, durationSeconds: 900 }, courses, corridorIndex: 0, waits: [0, 300], totalWaitSeconds: 300, tram: courses[0]!, train: courses[1]!, leaveAt: base - 150000, walkAt: base - 90000, platformAt: base + 300000, arriveAt: base + 900000, walkSeconds: 90, transferSeconds: 0, providerWalkSeconds: 90, providerTransferSeconds: 0, waitSeconds: 300 };
  const wrapper = mount(LineOptimizerPage, { props: { config: velizyOptimizerConfig }, global: { stubs: { AdressBook: true } } });
  expect(wrapper.text()).not.toContain("Desserte non confirmée");
  expect(wrapper.text()).not.toContain("Type de desserte inconnu");
  wrapper.unmount();
});
