import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { transitBoards } from "../src/config/transitBoards";
import type { TrafficResponse } from "../src/features/traffic/types";
import { createDefaultTransitPresetState, saveTransitPresetState, updateTransitPlacePreferences } from "../src/storage/transitPreferences";
import { rerABoard, rerABranchTopology, rerADisruption, rerALineRef } from "./fixtures/dashboardTrafficBranches";

const trafficResponse: TrafficResponse = {
  generatedAt: "2026-05-26T20:56:00.000Z",
  source: "prim-line-reports",
  configured: true,
  lines: [
    {
      lineRef: "line:IDFM:C01743",
      status: "planned",
      disruptions: [
        {
          id: "rer-b-work",
          title: "Travaux nocturnes",
          message: "Trafic interrompu en soirée entre deux gares.",
          kind: "works",
          applicationPeriods: [],
          impactedLineRefs: ["line:IDFM:C01743"],
          impactedStopNames: ["La Croix de Berny"],
        },
        {
          id: "rer-b-opaque-work",
          title:
            "La Croix de Berny/Robinson et Aéroport CDG/Mitry-Claye\nJusqu'à 02:00",
          message: "Motif : renouvellement des voies.",
          kind: "works",
          applicationPeriods: [],
          impactedLineRefs: ["line:IDFM:C01743"],
          impactedStopNames: [],
        },
        {
          id: "rer-b-upcoming-work",
          title: "Travaux planifies",
          message: "Service adapte en septembre.",
          kind: "works",
          applicationPeriods: [
            {
              begin: "20260901T044500",
              end: "20260902T043000",
            },
          ],
          impactedLineRefs: ["line:IDFM:C01743"],
          impactedStopNames: [],
        },
      ],
    },
    {
      lineRef: "line:IDFM:C02528",
      status: "planned",
      disruptions: [
        {
          id: "t10-future-work",
          title: "Travaux à venir",
          kind: "works",
          applicationPeriods: [
            {
              begin: "20260901T044500",
              end: "20260902T043000",
            },
          ],
          impactedLineRefs: ["line:IDFM:C02528"],
          impactedStopNames: [],
        },
      ],
    },
    {
      lineRef: "line:IDFM:C01074",
      status: "disrupted",
      disruptions: [
        {
          id: "bus-74-incident",
          title: "Incident bus",
          message: "Le trafic est perturbe sur la ligne 74.",
          kind: "incident",
          applicationPeriods: [],
          impactedLineRefs: ["line:IDFM:C01074"],
          impactedStopNames: ["La Fourche"],
        },
      ],
    },
  ],
};

beforeEach(() => {
  // These fixtures include future disruptions relative to generatedAt.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(trafficResponse.generatedAt));
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("#imports");
  vi.doUnmock("../src/services/idfm");
});

describe("TrafficPage", () => {
  it("keeps optimized traffic visible and explains the cooldown when all-lines mode is rate limited", async () => {
    const { recordNavitiaRateLimit } = await import("../src/services/navitiaRateLimit");
    const rateLimit = recordNavitiaRateLimit(new Response(null, {
      status: 429,
      headers: { "retry-after": "18000" },
    }));
    vi.doMock("../src/services/idfm", () => ({
      fetchTransitFamilyOptions: vi.fn(async () => { throw rateLimit; }),
      searchTransitLines: vi.fn(async () => []),
    }));
    installTrafficFetchMock();
    const wrapper = await mountTrafficPage();
    await wrapper.get(".traffic-scope-toggle").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toMatch(/Réessayez dans 4 h 59 min|Réessayez dans 5 h/u);
    expect(wrapper.get('[role="status"]').text()).toContain("Les lignes déjà affichées restent disponibles");
    expect(wrapper.get(".traffic-scope-toggle").attributes("disabled")).toBeDefined();
    expect(wrapper.findAll(".traffic-ratp-line")).toHaveLength(2);
    expect(wrapper.text()).not.toContain("navitia-journeys-429");
    wrapper.unmount();
  });

  it("renders only active non-bus dashboard lines and expands disruptions", async () => {
    window.localStorage.setItem(
      "transport-clock.preferences.v2",
      JSON.stringify({
        visibleBoardIds: [
          "t10-les-peintres",
          "rer-b-croix-de-berny",
          "bus-74-la-fourche",
        ],
        collapsedDirectionIds: [],
        customBoards: [
          {
            id: "bus-74-la-fourche",
            title: "La Fourche",
            city: "Paris",
            line: {
              ref: "line:IDFM:C01074",
              shortName: "74",
              longName: "Bus 74",
              mode: "bus",
              color: "#6b7280",
              textColor: "#ffffff",
            },
            monitoringPoints: [],
            directionGroups: [],
            maxDepartures: 8,
          },
        ],
      }),
    );
    const fetchMock = installTrafficFetchMock();

    const wrapper = await mountTrafficPage();

    expect(trafficFetchCount(fetchMock)).toBe(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("C01743");
    expect(String(fetchMock.mock.calls[0][0])).toContain("C02528");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("C01074");
    expect(wrapper.text()).toContain("Votre trafic");
    expect(wrapper.text()).toContain("Style RATP compact");
    expect(wrapper.text()).toContain("RER");
    expect(wrapper.text()).toContain("Tram");
    expect(wrapper.text()).not.toContain("Bus 74");
    expect(wrapper.findAll(".line-traffic-icon")).toHaveLength(
      wrapper.findAll(".traffic-ratp-line").length,
    );
    const trafficFrame = wrapper.get(".line-traffic-icon__frame rect");
    expect(trafficFrame.attributes("pathLength")).toBe("100");

    const ratpWorkspace = wrapper.get(".traffic-ratp-workspace");
    expect(ratpWorkspace.find(".traffic-ratp-groups").exists()).toBe(true);
    expect(ratpWorkspace.find(".traffic-ratp-detail-panel").exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain("Choisissez une ligne");
    const futureOnlyButton = wrapper
      .findAll(".traffic-ratp-line")
      .find((button) =>
        button.attributes("aria-label")?.includes("Travaux a venir"),
      );

    expect(futureOnlyButton).toBeTruthy();
    expect(futureOnlyButton!.classes()).toContain("traffic-ratp-line--normal");
    expect(futureOnlyButton!.classes()).not.toContain(
      "traffic-ratp-line--tone-orange",
    );
    expect(futureOnlyButton!.classes()).not.toContain(
      "traffic-ratp-line--tone-red",
    );

    await wrapper.get('[aria-label="Style info trafic"]').trigger("click");
    expect(wrapper.text()).toContain("Cartes detaillees");

    const rerButton = wrapper
      .findAll(".traffic-ratp-line")
      .find((button) => button.attributes("aria-label")?.includes("RER B"));

    expect(rerButton).toBeTruthy();
    expect(rerButton!.classes()).toContain("traffic-ratp-line--tone-red");
    expect(rerButton!.get(".line-traffic-icon__status").text()).toBe("x");
    await rerButton!.trigger("click");
    expect(rerButton!.attributes("aria-pressed")).toBe("true");
    expect(rerButton!.classes()).toContain("traffic-ratp-line--selected");
    expect(
      wrapper.findAll(".traffic-ratp-detail-panel .traffic-ratp-detail"),
    ).toHaveLength(1);
    expect(wrapper.find(".traffic-ratp-disruption-list").exists()).toBe(true);
    expect(
      wrapper.findAll(
        ".traffic-ratp-disruption-list .user-friendly-traffic",
      ).length,
    ).toBeGreaterThan(0);
    expect(wrapper.text()).not.toContain("Choisissez une ligne");
    expect(wrapper.text()).toContain("RER B");
    expect(wrapper.text()).toContain("En cours");
    expect(wrapper.text()).toContain("A venir");
    expect(wrapper.text()).toContain("Travaux nocturnes");
    expect(wrapper.text()).toContain("La Croix de Berny");
    expect(wrapper.text()).toContain("Travaux");
    expect(wrapper.text()).toContain("renouvellement des voies");
    expect(wrapper.text()).toContain("Jusqu'à 02:00");

    const upcomingTab = wrapper
      .findAll(".traffic-timing-tabs button")
      .find((button) => button.text().includes("A venir"));

    expect(upcomingTab).toBeTruthy();
    await upcomingTab!.trigger("click");
    expect(wrapper.text()).toContain("Travaux planifies");
    expect(wrapper.text()).toContain("1 sept. 2026");
    expect(wrapper.text()).not.toContain("20260901T044500");
  });

  it("opens and highlights a shared upcoming disruption from the URL", async () => {
    const fetchMock = installTrafficFetchMock();
    const wrapper = await mountTrafficPage({
      alertId: "rer-b-upcoming-work",
      lineRef: "line:IDFM:C01743",
      trafficTab: "upcoming",
    });

    expect(trafficFetchCount(fetchMock)).toBe(1);
    expect(wrapper.text()).toContain("RER B");
    expect(wrapper.text()).toContain("Travaux planifies");
    expect(
      wrapper.get('[data-traffic-alert-id="rer-b-upcoming-work"]').classes(),
    ).toContain("traffic-disruption--target");

    const activeTab = wrapper.get(".traffic-timing-tabs__button--active");
    expect(activeTab.text()).toContain("A venir");
  });

  it("opens a shared bus disruption without adding buses to normal traffic mode", async () => {
    const fetchMock = installTrafficFetchMock();
    const wrapper = await mountTrafficPage({
      alertId: "bus-74-incident",
      boardTitle: "La Fourche",
      lineColor: "#6b7280",
      lineMode: "bus",
      lineName: "Bus 74",
      lineRef: "line:IDFM:C01074",
      lineShortName: "74",
      lineTextColor: "#ffffff",
      trafficTab: "current",
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain("C01074");
    expect(wrapper.text()).toContain("BUS");
    expect(wrapper.text()).toContain("Bus 74");
    expect(wrapper.text()).toContain("Incident bus");
    expect(
      wrapper.get('[data-traffic-alert-id="bus-74-incident"]').classes(),
    ).toContain("traffic-disruption--target");
  });

  it.each(["ratp", "cards"] as const)("filters the selected line in the %s layout and updates the global setting", async (design) => {
    const boissy = rerABoard("boissy");
    const poissy = rerABoard("poissy");
    let state = createDefaultTransitPresetState(transitBoards);
    for (const [placeId, visibleBoardIds] of [["home", [boissy.id]], ["work", [poissy.id, boissy.id]]] as const) {
      const place = state.places.find(({ id }) => id === placeId)!;
      state = updateTransitPlacePreferences(state, placeId, {
        ...place.preferences,
        customBoards: [poissy, boissy],
        boardOrderIds: [poissy.id, boissy.id],
        visibleBoardIds: [...visibleBoardIds],
      });
    }
    saveTransitPresetState(state);

    const futurePoissy = rerADisruption(
      "future-poissy",
      "Le trafic est interrompu entre Maisons-Laffitte et Poissy.",
      {
        kind: "works",
        applicationPeriods: [{ begin: "20260901T044500", end: "20260902T043000" }],
      },
    );
    const fetchMock = installTrafficFetchMock({
      ...trafficResponse,
      lines: [{ lineRef: rerALineRef, status: "planned", disruptions: [futurePoissy] }],
    }, rerABranchTopology);
    const query = reactive({
      place: "home",
      lineRef: rerALineRef,
      alertId: futurePoissy.id,
      trafficTab: "upcoming",
    });
    const wrapper = await mountTrafficPage(query, design);
    const toggle = () => wrapper.get<HTMLInputElement>('input[role="switch"]');
    const alertSelector = '[data-traffic-alert-id="future-poissy"]';
    expect(toggle().element.checked).toBe(true);
    expect(wrapper.text()).toContain("Aucune alerte pour les branches de ce dashboard.");
    expect(wrapper.find(alertSelector).exists()).toBe(false);
    if (design === "cards") expect(wrapper.get(".traffic-summary strong").text()).toBe("0");

    await toggle().setValue(false);
    await flushPromises();
    expect(wrapper.get(alertSelector).classes()).toContain("traffic-disruption--target");
    expect(trafficFetchCount(fetchMock)).toBe(1);
    const { useState } = await import("#imports");
    expect(useState("transport-clock.app-settings", () => ({})).value).toMatchObject({
      trafficFilterByDashboardBranches: false,
    });
    if (design === "cards") expect(wrapper.get(".traffic-summary strong").text()).toBe("1");

    await toggle().setValue(true);
    expect(wrapper.find(alertSelector).exists()).toBe(false);
    query.place = "work";
    await flushPromises();
    expect(wrapper.get(alertSelector).classes()).toContain("traffic-disruption--target");
    expect(trafficFetchCount(fetchMock)).toBe(2);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/topology"))).toHaveLength(1);
    wrapper.unmount();
  });
});

function trafficFetchCount(fetchMock: ReturnType<typeof installTrafficFetchMock>): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/traffic")).length;
}

function installTrafficFetchMock(payload = trafficResponse, topology?: typeof rerABranchTopology) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes("/topology")
      ? { ok: Boolean(topology), status: topology ? 200 : 404, json: async () => topology }
      : { ok: true, status: 200, json: async () => payload },
  );

  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "fetch", {
    configurable: true,
    value: fetchMock,
  });

  return fetchMock;
}

async function mountTrafficPage(
  query: Record<string, string | undefined> = {},
  design?: "ratp" | "cards",
) {
  vi.doMock("#imports", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
      ...actual,
      useRoute: () => ({
        params: {},
        path: "/traffic",
        query,
      }),
    };
  });

  if (design) {
    const { useState } = await import("#imports");
    const { createDefaultAppSettings } = await import("../src/features/app-settings/appSettings");
    useState("transport-clock.app-settings", createDefaultAppSettings).value.trafficInfoDesign = design;
  }
  const { default: TrafficPage } =
    await import("../src/features/traffic/TrafficPage.vue");
  const wrapper = mount(TrafficPage);

  await flushPromises();

  return wrapper;
}
