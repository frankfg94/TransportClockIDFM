import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NearbyRealEstateVerdict from "../src/features/nearby-stations/NearbyRealEstateVerdict.vue";

const mocks = vi.hoisted(() => ({ manifest: vi.fn(), city: vi.fn(), rent: vi.fn(), iris: vi.fn() }));
vi.mock("../src/services/real-estate/compiledRealEstate", async original => ({
  ...await original<typeof import("../src/services/real-estate/compiledRealEstate")>(),
  getDvfDataProvider: () => ({ loadManifest: mocks.manifest, loadCity: mocks.city, loadRentalIndicators: mocks.rent }),
}));
vi.mock("../src/features/transport-map/iris/irisApi", () => ({ fetchIrisDataset: mocks.iris }));
vi.mock("../src/features/transport-map/iris/irisGeometry", () => ({ pointInIrisGeometry: (p: { lon: number }, g: { lon: number }) => p.lon === g.lon }));

const years = Array.from({ length: 5 }, (_, i) => ({ year: 2021 + i, meanPriceM2: 4000 + i * 100, medianPriceM2: 4000 + i * 100, transactionCount: 20 + i }));
const benchmark = { neighborhoodSalesPercentiles: { p25: 10, p50: 20, p75: 30, p90: 40 }, citySalesPercentiles: { p25: 10, p50: 20, p75: 30, p90: 40 } };
const descriptor = (code: string) => ({ code, name: `City ${code}`, departmentCode: "92", medianPriceM2: 5000, transactionCount: 100, yearlyPrices: years });
const file = (code: string, enough = true) => ({ referencePeriod: "2021–2025", neighborhoods: [{ codeIris: code, name: code, hasEnoughSales: enough, ...(enough ? { medianPriceM2: 4000, transactionCount: 80, yearlyPrices: years } : {}) }], cells: [] });
const iris = (code: string, lon: number) => ({ codeIris: code, communeCode: code, name: `Iris ${code}`, geometry: { lon } });

beforeEach(() => {
  mocks.manifest.mockReset().mockResolvedValue({ cities: [descriptor("A"), descriptor("B")], marketBenchmarks: { "petite-couronne": benchmark } });
  mocks.city.mockReset().mockImplementation(async (code: string) => file(code));
  mocks.rent.mockReset().mockResolvedValue({ referencePeriod: "2025-T3", cities: [{ code: "A", rentPerSquareMeter: 20 }] });
  mocks.iris.mockReset().mockResolvedValue({ neighborhoods: [iris("A", 1), iris("B", 2)] });
});

describe("real estate verdict", () => {
  it("exports observed history and the municipal rent with its local purchase reference", async () => {
    const wrapper = mount(NearbyRealEstateVerdict, { props: { origin: { lon: 1, lat: 48 } } });
    await flushPromises();
    const state = wrapper.emitted("export-state")!.at(-1)![0] as any;
    expect(state.market).toMatchObject({ status: "ready", rentStatus: "ready", coverage: "neighborhood" });
    expect(state.section.items.join(" ")).toContain("2021–2025");
    expect(state.section.items.join(" ")).toContain("2025-T3");
    expect(wrapper.get('[data-testid="market-details"]').text()).toContain("2021–2025");
    wrapper.unmount();
  });
  it("uses the municipality when IRIS data is insufficient and keeps other data when rent fails", async () => {
    mocks.city.mockResolvedValue(file("A", false));
    mocks.rent.mockRejectedValue(new Error("offline"));
    const wrapper = mount(NearbyRealEstateVerdict, { props: { origin: { lon: 1, lat: 48 } } });
    await flushPromises();
    const state = wrapper.emitted("export-state")!.at(-1)![0] as any;
    expect(state.market).toMatchObject({ status: "ready", rentStatus: "error", coverage: "city" });
    expect(state.section.items.join(" ")).toContain("5 000");
    wrapper.unmount();
  });
  it("presents an undivided municipality at city scale without comparing it to itself", async () => {
    mocks.iris.mockResolvedValue({ neighborhoods: [{ ...iris("A", 1), codeIris: "A0000" }] });
    mocks.city.mockResolvedValue({ ...file("A"), neighborhoods: [{ ...file("A").neighborhoods[0], codeIris: "A0000" }] });
    const wrapper = mount(NearbyRealEstateVerdict, { props: { origin: { lon: 1, lat: 48 } } });
    await flushPromises();
    const state = wrapper.emitted("export-state")!.at(-1)![0] as any;
    expect(state.market.coverage).toBe("undivided-city");
    expect(state.section.subtitle).toBe("City A");
    expect(state.section.items.join(" ")).not.toContain("Écart à la médiane de la ville");
    expect(wrapper.text()).not.toContain("City A · City A");
    wrapper.unmount();
  });
  it("reports source failure and ignores a late result for the previous address", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.city.mockImplementation((code: string) => code === "A" ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(file(code)));
    const wrapper = mount(NearbyRealEstateVerdict, { props: { origin: { lon: 1, lat: 48 } } });
    await flushPromises();
    await wrapper.setProps({ origin: { lon: 2, lat: 48 } });
    await flushPromises();
    resolveOld(file("A"));
    await flushPromises();
    expect(wrapper.text()).toContain("City B");
    expect(wrapper.text()).not.toContain("City A");
    mocks.city.mockRejectedValue(new Error("offline"));
    await wrapper.setProps({ origin: { lon: 1, lat: 48 } });
    await flushPromises();
    expect((wrapper.emitted("export-state")!.at(-1)![0] as any).market.status).toBe("error");
    wrapper.unmount();
  });
});
