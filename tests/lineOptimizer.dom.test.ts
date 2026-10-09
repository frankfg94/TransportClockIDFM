import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import LineOptimizerPage from "../src/features/line-optimizer/LineOptimizerPage.vue";
import { resolveLineOptimizerConfig } from "../src/features/line-optimizer/optimizerConfig";
import { DEFAULT_OPTIMIZER_SETTINGS } from "../src/features/line-optimizer/lineOptimizer";
import { translate } from "../src/i18n/i18n";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), selectAddress: vi.fn() }));
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
    winner: ref(),
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
