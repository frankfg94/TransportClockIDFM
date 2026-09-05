import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GlobalMapLine,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import type {
  AnnualRidershipLineResponse,
  AnnualRidershipStationResponse,
} from "../src/types/ridership";

beforeEach(() => {
  vi.doMock("../src/services/lineFrequency", () => ({
    getGtfsRequestDate: () => "20260831",
    fetchGtfsLineFrequency: vi.fn(async () => undefined),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  vi.doUnmock("../src/i18n");
  vi.doUnmock("../src/services/idfm");
  vi.doUnmock("../src/services/ridership");
  vi.doUnmock("../src/services/lineFrequency");
  vi.unstubAllGlobals();
});

describe("GlobalMapPickerSideBar annual ridership", () => {
  it("keeps station validations accessible when the selected line has no attributable total", async () => {
    const { default: AnnualRidershipCard } = await import(
      "../src/features/line-map/AnnualRidershipCard.vue"
    );
    const wrapper = mount(AnnualRidershipCard, {
      props: {
        line: {
          id: "line:IDFM:C01739",
          code: "C01739",
          label: "J",
          mode: "TRANSILIEN",
          generatedAt: "2026-01-01T00:00:00.000Z",
          requestedYear: 2024,
          sources: [{
            id: "idfm-rail-validations",
            label: "Validations annuelles du réseau ferré",
            publisher: "Île-de-France Mobilités",
            datasetUrl: "https://example.test/rail-validations",
            kind: "ridership",
            scope: "station",
            priority: 1,
          }],
          primary: { value: null, status: "unavailable", sourceIds: [], sourceRecordIds: [] },
          measures: [],
          stations: [{
            id: "station:FR::monomodalStopPlace:47875:FR1",
            name: "Argenteuil",
            lineIds: ["line:IDFM:C01739"],
            measures: [],
            primary: {
              value: 4_370_281,
              unit: "entries",
              metric: "annual_station_entries",
              year: 2024,
              status: "official",
              sourceIds: ["idfm-rail-validations"],
              sourceRecordIds: [],
              qualifier: { stationIdentity: "zdc:65063" },
            },
          }],
        },
      },
    });

    expect(wrapper.text()).toContain("Les validations d’entrée ne sont pas attribuables à une ligne.");
    await wrapper.get(".annual-ridership-card__toggle").trigger("click");
    expect(wrapper.text()).toMatch(/4\s370\s281/);
    wrapper.unmount();
  });

  it("shows a selected line station with its line comparison selected by default", async () => {
    const line = createLine("line:IDFM:C01743", "C01743", "B", "RER");
    const station = createStation();
    const response: AnnualRidershipLineResponse = {
      id: line.id,
      code: line.code,
      label: line.label,
      mode: line.mode,
      generatedAt: "2026-01-01T00:00:00.000Z",
      requestedYear: 2024,
      sources: [{
        id: "idfm-rail-validations",
        label: "Validations annuelles du réseau ferré",
        publisher: "Île-de-France Mobilités",
        datasetUrl: "https://example.test/rail-validations",
        kind: "ridership",
        scope: "station",
        priority: 1,
      }],
      primary: { value: null, status: "unavailable", sourceIds: [], sourceRecordIds: [] },
      measures: [],
      stations: [{
        id: station.id,
        name: station.name,
        lineIds: [line.id],
        measures: [],
        primary: {
          value: 900_000,
          unit: "entries",
          metric: "annual_station_entries",
          year: 2024,
          status: "official",
          sourceIds: ["idfm-rail-validations"],
          sourceRecordIds: [],
          qualifier: { stationIdentity: "zdc:71410" },
        },
        rankings: {
          network: { scope: "network", rank: 6, total: 535, year: 2024, metric: "annual_station_entries", unit: "entries" },
          line: { scope: "line", lineId: line.id, rank: 2, total: 47, year: 2024, metric: "annual_station_entries", unit: "entries" },
        },
      }],
    };

    vi.doMock("../src/services/ridership", () => ({
      fetchAnnualRidershipLine: vi.fn(async () => response),
      fetchAnnualRidershipStation: vi.fn(async () => {
        throw new Error("The ranked line document should be reused.");
      }),
    }));
    vi.doMock("../src/services/idfm", () => ({
      fetchLineFrequencyProfile: vi.fn(async () => ({})),
    }));
    vi.doMock("../src/i18n", () => ({
      useI18n: () => ({ t: (key: string) => key }),
    }));

    const { default: GlobalMapPickerSideBar } = await import(
      "../src/features/line-map/GlobalMapPickerSideBar.vue"
    );
    const wrapper = mount(GlobalMapPickerSideBar, {
      props: { line, station, stations: [station], paths: [] },
      global: {
        stubs: {
          StationTransferDetails: true,
          LineIconBadge: true,
          UserFriendlyTraffic: true,
        },
      },
    });

    await flushPromises();

    const comparison = wrapper.get('.annual-ridership-station-card select');
    expect((comparison.element as HTMLSelectElement).value).toBe("line");
    expect(wrapper.text()).toContain("2 / 47");
    wrapper.unmount();
  });

  it("requests only the pinned line when a preview line is visible", async () => {
    const fetchAnnualRidershipLine = vi.fn(async (lineId: string) => ({
      id: lineId,
      code: "C01371",
      label: "1",
      mode: "METRO" as const,
      generatedAt: "2026-01-01T00:00:00.000Z",
      requestedYear: 2024,
      sources: [],
      primary: {
        value: 12_345,
        unit: "journeys" as const,
        status: "official" as const,
        sourceIds: [],
        sourceRecordIds: [],
      },
      measures: [],
      stations: [],
    }));
    vi.doMock("../src/services/ridership", () => ({
      fetchAnnualRidershipLine,
      fetchAnnualRidershipStation: vi.fn(),
    }));
    vi.doMock("../src/services/idfm", () => ({
      fetchLineFrequencyProfile: vi.fn(async () => ({})),
    }));
    vi.doMock("../src/i18n", () => ({
      useI18n: () => ({
        t: (key: string) => key,
      }),
    }));

    const { default: GlobalMapPickerSideBar } = await import(
      "../src/features/line-map/GlobalMapPickerSideBar.vue"
    );
    const line = createLine("line:IDFM:C01371", "C01371", "1");
    const preview = createLine("line:IDFM:C01374", "C01374", "4");
    const wrapper = mount(GlobalMapPickerSideBar, {
      props: {
        line,
        previewLine: preview,
        stations: [createStation()],
        paths: [],
        previewPaths: [],
      },
      global: {
        stubs: {
          StationTransferDetails: true,
          LineIconBadge: true,
          UserFriendlyTraffic: true,
        },
      },
    });

    await flushPromises();
    expect(fetchAnnualRidershipLine).toHaveBeenCalledTimes(1);
    expect(fetchAnnualRidershipLine).toHaveBeenCalledWith("line:IDFM:C01371");
    wrapper.unmount();
  });

  it("keeps the current sidebar body during a sub-100ms preview transition", async () => {
    vi.useFakeTimers();
    vi.doMock("../src/services/ridership", () => ({
      fetchAnnualRidershipLine: vi.fn(async (lineId: string) => ({
        id: lineId,
        code: "RER B",
        label: "RER B",
        mode: "RER" as const,
        generatedAt: "2026-01-01T00:00:00.000Z",
        requestedYear: 2024,
        sources: [],
        primary: {
          value: null,
          status: "unavailable" as const,
          sourceIds: [],
          sourceRecordIds: [],
        },
        measures: [],
        stations: [],
      })),
      fetchAnnualRidershipStation: vi.fn(async () => ({
        id: "station:test",
        name: "Station test",
        lineIds: ["line:active"],
        measures: [],
        primary: {
          value: null,
          status: "unavailable" as const,
          sourceIds: [],
          sourceRecordIds: [],
        },
        sources: [],
        rankings: {},
      })),
    }));
    vi.doMock("../src/services/idfm", () => ({
      fetchLineFrequencyProfile: vi.fn(async () => undefined),
    }));
    vi.doMock("../src/i18n", () => ({
      useI18n: () => ({ t: (key: string) => key }),
    }));

    const { default: GlobalMapPickerSideBar } = await import(
      "../src/features/line-map/GlobalMapPickerSideBar.vue"
    );
    const line = createLine("line:active", "ACTIVE", "RER B", "RER");
    const firstPreview = createLine("line:194", "194", "194", "BUS");
    const secondPreview = createLine("line:388", "388", "388", "BUS");
    const station = createStation();
    const wrapper = mount(GlobalMapPickerSideBar, {
      props: {
        line,
        station,
        previewLine: firstPreview,
        stations: [station],
        paths: [],
        previewPaths: [],
      },
      global: {
        stubs: {
          AnnualRidershipCard: true,
          AnnualRidershipStationCard: true,
          CitiesLinePattern: true,
          StationTransferDetails: true,
          LineIconBadge: true,
          UserFriendlyTraffic: true,
        },
      },
    });

    expect(wrapper.find(".global-map-picker-sidebar__line-profile").exists()).toBe(true);
    expect(wrapper.text()).toContain("194");

    // Moving through the tooltip gap must not mount the station body or leave
    // the line body just for one frame.
    await wrapper.setProps({ previewLine: undefined, previewPaths: [] });
    await vi.advanceTimersByTimeAsync(99);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".global-map-picker-sidebar__line-profile").exists()).toBe(true);
    expect(wrapper.text()).toContain("194");

    await wrapper.setProps({ previewLine: secondPreview, previewPaths: [] });
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".global-map-picker-sidebar__line-profile").exists()).toBe(true);
    expect(wrapper.text()).toContain("388");

    await wrapper.setProps({ previewLine: undefined, previewPaths: [] });
    await vi.advanceTimersByTimeAsync(99);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".global-map-picker-sidebar__line-profile").exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".global-map-picker-sidebar__station-profile").exists()).toBe(true);

    wrapper.unmount();
  });

  it("renders the annual value and station details without network access", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.doMock("../src/i18n", () => ({
      useI18n: () => ({
        t: (key: string) => key,
      }),
    }));

    const { default: AnnualRidershipCard } = await import(
      "../src/features/line-map/AnnualRidershipCard.vue"
    );
    const line: AnnualRidershipLineResponse = {
      id: "line:IDFM:C01371",
      code: "C01371",
      label: "1",
      mode: "METRO",
      generatedAt: "2026-01-01T00:00:00.000Z",
      requestedYear: 2024,
      sources: [{
        id: "fixture",
        label: "Fixture officielle",
        publisher: "Fixture",
        datasetUrl: "https://example.test/ridership",
        kind: "ridership",
        scope: "mixed",
        priority: 1,
      }],
      primary: {
        value: 12_345,
        unit: "journeys",
        status: "official",
        year: 2024,
        method: "fixture",
        sourceIds: ["fixture"],
        sourceRecordIds: ["fixture:line"],
      },
      measures: [],
      stations: [{
        id: "station:test",
        name: "Station test",
        lineIds: ["line:IDFM:C01371"],
        measures: [],
        primary: {
          value: 123,
          unit: "entries",
          status: "derived",
          year: 2021,
          method: "fixture",
          sourceIds: ["fixture"],
          sourceRecordIds: ["fixture:station"],
        },
      }],
      ranking: {
        scope: "mode",
        rank: 2,
        total: 14,
        year: 2024,
        metric: "annual_line_ridership",
        unit: "journeys",
        mode: "METRO",
      },
    };

    const wrapper = mount(AnnualRidershipCard, {
      props: {
        line,
        ranking: {
          rank: 2,
          total: 14,
          topPercent: 15,
          percentile: 92.3,
          level: "very-high",
        },
      },
    });
    expect(wrapper.text()).toContain("12");
    expect(wrapper.text()).toContain("2 / 14");
    expect(wrapper.text()).not.toContain("Station test");
    await wrapper.get("button").trigger("click");
    expect(wrapper.text()).toContain("Station test");
    expect(wrapper.text()).toContain("globalMap.sidebar.annualRidershipDerived");
    expect(fetcher).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("renders a station ranking, moves the percentile meter and changes scope", async () => {
    vi.doMock("../src/i18n", () => ({
      useI18n: () => ({
        t: (key: string) => key,
      }),
    }));

    const { default: AnnualRidershipStationCard } = await import(
      "../src/features/line-map/AnnualRidershipStationCard.vue"
    );
    const station: AnnualRidershipStationResponse = {
      id: "station:test",
      name: "Station test",
      lineIds: ["line:IDFM:C01371"],
      measures: [],
      primary: {
        value: 8_765,
        unit: "entries",
        metric: "annual_station_entries",
        year: 2024,
        status: "official",
        sourceIds: ["idfm-rail-validations"],
        sourceRecordIds: [],
      },
      sources: [],
      rankings: {},
    };
    const wrapper = mount(AnnualRidershipStationCard, {
      props: {
        station,
        ranking: {
          rank: 2,
          total: 8,
          topPercent: 25,
          percentile: 85.7,
          level: "very-high",
        },
        scope: "network",
        scopeOptions: [
          { value: "network", label: "Réseau IDFM" },
          { value: "mode", label: "Même mode" },
        ],
      },
    });

    expect(wrapper.text()).toContain("8");
    expect(wrapper.text()).toContain("globalMap.sidebar.annualRidershipRailValidationTitle");
    expect(wrapper.text()).toContain("globalMap.sidebar.annualRidershipRailValidationHint");
    expect(wrapper.text()).toContain("2 / 8");
    expect(wrapper.get('[role="meter"]').attributes("aria-valuenow")).toBe("85.7");
    expect(wrapper.get(".annual-ridership-station-card__meter-fill").attributes("style")).toContain("width: 85.7%");
    await wrapper.get("select").setValue("mode");
    expect(wrapper.emitted("update:scope")?.[0]).toEqual(["mode"]);
    wrapper.unmount();
  });
});

function createLine(
  id: string,
  code: string,
  label: string,
  mode: GlobalMapLine["mode"] = "METRO",
): GlobalMapLine {
  return {
    id,
    index: 1,
    code,
    label,
    mode,
    color: "#ffbe00",
    textColor: "#000000",
    pictogram: null,
    aliases: [label],
    stationIds: ["station:test"],
    geometryIds: [],
  };
}

function createStation(): GlobalMapStation {
  return {
    id: "station:test",
    index: 1,
    name: "Station test",
    normalizedName: "station test",
    aliases: ["Station test"],
    rawRefs: ["stop_area:IDFM:100"],
    lineIds: ["line:IDFM:C01371"],
    ownerChunkId: "test",
    isHub: false,
    sourceCrs: "EPSG:2154",
    sourceX: 0,
    sourceY: 0,
    lon: 2.3,
    lat: 48.8,
    worldX: 0,
    worldY: 0,
    coordinateSource: "official-open-data",
    transformVersion: "lambert93-ntf-v1",
  };
}
