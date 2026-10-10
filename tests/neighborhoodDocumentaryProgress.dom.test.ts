import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNearbyNeighborhoodScore } from "../src/features/nearby-stations/useNearbyNeighborhoodScore";
afterEach(() => vi.unstubAllGlobals());
describe("independent documentary loading", () => {
  it("shows security/environment while walking is pending, and cancels a replaced address", async () => {
    const origin = ref({ lat: 48.8, lon: 2.3 });
    let aborted = 0;
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      const address = new URL(String(url), "http://local");
      expect(address.pathname).not.toContain("/idfm");
      if (address.searchParams.get("includeWalking") !== "0") return new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener("abort", () => { aborted++; reject(new DOMException("cancelled", "AbortError")); }, { once: true });
      });
      return Response.json({ schemaVersion: "1.3", generatedAt: "2026-10-01T09:00:00Z", sources: [], warnings: [],
        categories: ["security", "living-environment"].map(id => ({ id, status: "available", score: address.searchParams.get("lon") === "2.4" ? 9 : 7,
          positiveFacts: [], negativeFacts: [], neutralFacts: [], limitations: [] })) });
    }));
    let score!: ReturnType<typeof useNearbyNeighborhoodScore>;
    const wrapper = mount(defineComponent({ setup() {
      score = useNearbyNeighborhoodScore({ origin, stations: ref([]), network: ref(), documentaryFirst: true, journeySource: "gtfs", walkingPolicy: "ors-only",
        placesProvider: { searchNearby: async () => [], searchDestinations: async () => [] } });
      return () => null;
    } }));
    await vi.waitFor(() => expect(score.criteria.value.find(c => c.id === "security")?.status).toBe("ready"));
    expect(score.criteria.value.find(c => c.id === "living-environment")?.status).toBe("ready");
    expect(score.criteria.value.find(c => c.id === "daily-life")?.datasets.some(dataset => dataset.id === "neighborhood-verdict")).toBe(false);
    expect(score.criteria.value.find(c => c.id === "security")?.datasets.some(dataset => dataset.id === "neighborhood-verdict")).toBe(true);
    origin.value = { lat: 48.81, lon: 2.4 };
    await vi.waitFor(() => expect(aborted).toBeGreaterThan(0));
    await vi.waitFor(() => expect(score.criteria.value.find(c => c.id === "security")?.status).toBe("ready"));
    expect(score.backendVerdict.value?.categories.find(c => c.id === "security")?.score).toBe(9);
    wrapper.unmount();
  });
});
