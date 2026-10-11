import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import LineOptimizerPage from "../src/features/line-optimizer/LineOptimizerPage.vue";
import { resolveLineOptimizerConfig } from "../src/features/line-optimizer/optimizerConfig";
import type { LineOptimizerCandidate } from "../src/features/line-optimizer/lineOptimizer";
import { DEFAULT_OPTIMIZER_SETTINGS } from "../src/features/line-optimizer/lineOptimizer";
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
    d: (date: Date) => date.toLocaleTimeString("fr-FR"),
    n: (value: number) => String(value),
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
  mocks.winner = undefined;
});
describe("standalone optimizer page", () => {
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
