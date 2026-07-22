import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrafficResponse } from "../src/features/traffic/types";

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

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("#imports");
});

describe("TrafficPage", () => {
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
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => ({
      ok: true,
      json: async () => trafficResponse,
    }));

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const wrapper = await mountTrafficPage();

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    expect(trafficFrame.attributes("stroke-dasharray")).toBe("102 100");

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

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
});

function installTrafficFetchMock(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => ({
    ok: true,
    json: async () => trafficResponse,
  }));

  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "fetch", {
    configurable: true,
    value: fetchMock,
  });

  return fetchMock;
}

async function mountTrafficPage(
  query: Record<string, string | undefined> = {},
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

  const { default: TrafficPage } =
    await import("../src/features/traffic/TrafficPage.vue");
  const wrapper = mount(TrafficPage);

  await flushPromises();

  return wrapper;
}
