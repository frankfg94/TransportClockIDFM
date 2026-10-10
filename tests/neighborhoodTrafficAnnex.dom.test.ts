import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import NeighborhoodTrafficAnnex from "../src/features/nearby-stations/NeighborhoodTrafficAnnex.vue";
afterEach(() => vi.unstubAllGlobals());
describe("traffic annex", () => {
  it("makes no automatic call and uses the shared traffic endpoint only after an explicit click", async () => {
    const fetcher = vi.fn(async url => {
      expect(String(url)).toContain("/api/traffic?");
      return Response.json({ generatedAt: "2026-10-10T09:00:00Z", configured: true, source: "mixed-cache", lines: [] });
    });
    vi.stubGlobal("fetch", fetcher);
    const wrapper = mount(NeighborhoodTrafficAnnex, { props: { lineRefs: ["IDFM:C01743"], originKey: "a" } });
    await flushPromises(); expect(fetcher).not.toHaveBeenCalled();
    await wrapper.get("button").trigger("click"); await flushPromises();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(wrapper.text()).toContain("Aucune perturbation");
    await wrapper.setProps({ originKey: "b" }); expect(wrapper.text()).not.toContain("Aucune perturbation");
    wrapper.unmount();
  });
  it("does not claim an absence of disruptions when the shared cache is incomplete", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ generatedAt: "2026-10-10T09:00:00Z", configured: true,
      source: "mixed-cache", cache: { state: "rate-limited" }, lines: [] })));
    const wrapper = mount(NeighborhoodTrafficAnnex, { props: { lineRefs: ["IDFM:C01743"], originKey: "a" } });
    await wrapper.get("button").trigger("click"); await flushPromises();
    expect(wrapper.text()).not.toContain("Aucune perturbation");
    expect(wrapper.text()).toContain("peuvent être anciennes");
    wrapper.unmount();
  });
});
