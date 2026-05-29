import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import HealthPage from "../src/features/health/HealthPage.vue";
import type { HealthResponse } from "../src/features/health/types";

const healthResponse: HealthResponse = {
  generatedAt: "2026-05-25T08:00:00.000Z",
  checks: [
    {
      id: "netex",
      label: "Données NeTEx",
      category: "Données",
      required: true,
      status: "ok",
      latencyMs: 12,
      message: "3 lignes chargées",
      quota: { exposed: false },
    },
    {
      id: "r2",
      label: "Cloudflare R2",
      category: "Stockage",
      required: false,
      status: "not_configured",
      latencyMs: 2,
      message: "R2 non configuré",
      quota: { exposed: false },
    },
    {
      id: "prim",
      label: "PRIM live API",
      category: "Temps réel",
      required: true,
      status: "ok",
      latencyMs: 55,
      message: "Endpoint joignable",
      quota: { exposed: false },
    },
    {
      id: "navitia",
      label: "Navitia API",
      category: "Temps réel",
      required: true,
      status: "ok",
      latencyMs: 44,
      message: "Endpoint joignable",
      quota: { exposed: false },
    },
    {
      id: "prim-traffic",
      label: "PRIM info trafic",
      category: "Temps rÃ©el",
      required: true,
      status: "ok",
      latencyMs: 61,
      message: "Endpoint joignable",
      quota: { exposed: false },
    },
    {
      id: "map-tiles",
      label: "Carte vectorielle",
      category: "Carte",
      required: false,
      status: "ok",
      latencyMs: 25,
      message: "Fond de carte joignable",
      quota: { exposed: false },
    },
    {
      id: "open-meteo",
      label: "Open-Meteo météo",
      category: "Météo",
      required: false,
      status: "ok",
      latencyMs: 32,
      message: "Prévisions météo joignables",
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

    expect(wrapper.text()).toContain("Données NeTEx");
    expect(wrapper.text()).toContain("Cloudflare R2");
    expect(wrapper.text()).toContain("PRIM live API");
    expect(wrapper.text()).toContain("Navitia API");
    expect(wrapper.text()).toContain("PRIM info trafic");
    expect(wrapper.text()).toContain("Open-Meteo météo");
    expect(wrapper.text()).toContain("Carte vectorielle");
    expect(wrapper.text()).toContain("Quota");
    expect(wrapper.text()).toContain("Non exposé");
  });
});
