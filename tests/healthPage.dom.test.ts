import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import HealthPage from "../src/features/health/HealthPage.vue";
import type { HealthResponse } from "../src/features/health/types";

const healthResponse: HealthResponse = {
  generatedAt: "2026-05-25T08:00:00.000Z",
  checks: [
    {
      id: "netex",
      label: "NeTEx data",
      category: "Data",
      required: true,
      status: "ok",
      latencyMs: 12,
      message: "3 lines loaded",
      quota: { exposed: false },
    },
    {
      id: "r2",
      label: "Cloudflare R2",
      category: "Storage",
      required: false,
      status: "not_configured",
      latencyMs: 2,
      message: "R2 not configured",
      quota: { exposed: false },
    },
    {
      id: "prim",
      label: "PRIM live API",
      category: "Realtime",
      required: true,
      status: "ok",
      latencyMs: 55,
      message: "Endpoint reachable",
      quota: { exposed: false },
    },
    {
      id: "navitia",
      label: "Navitia API",
      category: "Realtime",
      required: true,
      status: "ok",
      latencyMs: 44,
      message: "Endpoint reachable",
      quota: { exposed: false },
    },
    {
      id: "prim-traffic",
      label: "PRIM traffic information",
      category: "Realtime",
      required: true,
      status: "ok",
      latencyMs: 61,
      message: "Endpoint reachable",
      quota: { exposed: false },
    },
    {
      id: "idfm-arrets-lignes",
      label: "IDFM Open Data arrets-lignes",
      category: "Data",
      required: false,
      status: "ok",
      latencyMs: 28,
      message: "Dataset reachable",
      quota: { exposed: false },
    },
    {
      id: "map-tiles",
      label: "Vector map",
      category: "Map",
      required: false,
      status: "ok",
      latencyMs: 25,
      message: "Map background reachable",
      quota: { exposed: false },
    },
    {
      id: "open-meteo",
      label: "Open-Meteo weather",
      category: "Weather",
      required: false,
      status: "ok",
      latencyMs: 32,
      message: "Weather forecast reachable",
      quota: { exposed: false },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HealthPage", () => {
  it("renders every major service and quota information", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => healthResponse,
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = mount(HealthPage);
    await flushPromises();

    expect(wrapper.text()).toContain("NeTEx data");
    expect(wrapper.text()).toContain("Cloudflare R2");
    expect(wrapper.text()).toContain("PRIM live API");
    expect(wrapper.text()).toContain("Navitia API");
    expect(wrapper.text()).toContain("PRIM traffic information");
    expect(wrapper.text()).toContain("IDFM Open Data arrets-lignes");
    expect(wrapper.text()).toContain("Open-Meteo weather");
    expect(wrapper.text()).toContain("Vector map");
    expect(wrapper.text()).toContain("Quota");
    expect(wrapper.text()).toContain("Non expose");
  });
});
