import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import TrafficPage from "../src/features/traffic/TrafficPage.vue";
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
  ],
};

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
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

    const wrapper = mount(TrafficPage);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("C01743");
    expect(String(fetchMock.mock.calls[0][0])).toContain("C02528");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("C01074");
    expect(wrapper.text()).toContain("Votre traffic");
    expect(wrapper.text()).toContain("Style RATP compact");
    expect(wrapper.text()).toContain("RER");
    expect(wrapper.text()).toContain("Tram");
    expect(wrapper.text()).not.toContain("Bus 74");

    const futureOnlyButton = wrapper
      .findAll(".traffic-ratp-line")
      .find((button) =>
        button.attributes("aria-label")?.includes("Travaux à venir"),
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
    expect(wrapper.text()).toContain("Cartes détaillées");

    const rerButton = wrapper
      .findAll(".traffic-ratp-line")
      .find((button) => button.attributes("aria-label")?.includes("RER B"));

    expect(rerButton).toBeTruthy();
    expect(rerButton!.classes()).toContain("traffic-ratp-line--tone-red");
    expect(rerButton!.get(".traffic-ratp-line__status").text()).toBe("x");
    await rerButton!.trigger("click");
    expect(wrapper.text()).toContain("RER B");
    expect(wrapper.text()).toContain("En cours");
    expect(wrapper.text()).toContain("À venir");
    expect(wrapper.text()).toContain("Travaux nocturnes");
    expect(wrapper.text()).toContain("La Croix de Berny");

    const upcomingTab = wrapper
      .findAll(".traffic-timing-tabs button")
      .find((button) => button.text().includes("À venir"));

    expect(upcomingTab).toBeTruthy();
    await upcomingTab!.trigger("click");
    expect(wrapper.text()).toContain("Travaux planifies");
    expect(wrapper.text()).toContain("1 sept. 2026");
    expect(wrapper.text()).not.toContain("20260901T044500");
  });
});
