import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import GtfsFrequencyCard from "../src/features/line-map/GtfsFrequencyCard.vue";
import GlobalMapPickerSideBar from "../src/features/line-map/GlobalMapPickerSideBar.vue";
import type {
  GlobalMapLine,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import type { FrequencySection, GtfsLineFrequencyResponse } from "../src/types/lineFrequency";
import type { GtfsLineTimetableResponse } from "../src/types/lineFrequencyTimetable";
import * as frequencyClient from "../src/services/lineFrequency";
import * as timetableClient from "../src/services/lineFrequencyTimetable";

const language = vi.hoisted(() => ({ value: "en" as "en" | "fr" }));
vi.mock("../src/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/i18n")>();
  return {
    ...actual,
    useI18n: () => ({
      t: (
        key: Parameters<typeof actual.translate>[1],
        params?: Parameters<typeof actual.translate>[2],
      ) => actual.translate(language.value, key, params),
      n: (value: number, options?: Intl.NumberFormatOptions) =>
        new Intl.NumberFormat(language.value, options).format(value),
      d: (value: Date, options?: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(language.value, options).format(value),
    }),
  };
});
vi.mock("../src/services/ridership", () => ({
  fetchAnnualRidershipLine: vi.fn(async () => undefined),
  fetchAnnualRidershipStation: vi.fn(async () => undefined),
}));

function profile(overrides: Partial<GtfsLineFrequencyResponse> = {}): GtfsLineFrequencyResponse {
  return {
    lineId: "line:IDFM:C01371",
    source: "gtfs",
    serviceDate: "20260831",
    status: "ready",
    sourceUpdatedAt: "2026-08-30T10:00:00Z",
    datasetVersion: "dataset-v1",
    coverage: { startDate: "20260801", endDate: "20260930" },
    topologyAvailable: true,
    branched: false,
    average: { peakMinutes: 6, offPeakMinutes: 9, nightMinutes: 18 },
    directions: [
      {
        id: "out",
        from: "West",
        to: "East",
        stationCount: 3,
        peakMinutes: 4,
        offPeakMinutes: 8,
        nightMinutes: 16,
      },
      {
        id: "back",
        from: "East",
        to: "West",
        stationCount: 3,
        peakMinutes: 8,
        offPeakMinutes: 10,
        nightMinutes: 20,
      },
    ],
    sections: [],
    stationCount: 3,
    sampledStationCount: 3,
    ...overrides,
  };
}
function timetable(): GtfsLineTimetableResponse {
  return {
    lineId: "line:IDFM:C01371",
    serviceDate: "20260831",
    source: "gtfs",
    status: "ready",
    datasetVersion: "dataset-v1",
    sourceUpdatedAt: "2026-08-30T10:00:00Z",
    coverage: { startDate: "20260801", endDate: "20260930" },
    stops: [
      { id: "west", name: "West" },
      { id: "east", name: "East" },
    ],
    trips: [
      {
        id: "out-1",
        serviceDate: "20260831",
        directionId: "0",
        headsign: "East",
        calls: [
          {
            stopId: "west",
            sequence: 1,
            arrival: 6 * 3600,
            departure: 6 * 3600,
            pickupType: 0,
            dropOffType: 0,
          },
          {
            stopId: "east",
            sequence: 2,
            arrival: 6 * 3600 + 600,
            departure: 6 * 3600 + 600,
            pickupType: 1,
            dropOffType: 0,
          },
        ],
      },
      {
        id: "out-2",
        serviceDate: "20260831",
        directionId: "0",
        headsign: "East",
        calls: [
          {
            stopId: "west",
            sequence: 1,
            arrival: 6 * 3600 + 600,
            departure: 6 * 3600 + 600,
            pickupType: 0,
            dropOffType: 0,
          },
          {
            stopId: "east",
            sequence: 2,
            arrival: 6 * 3600 + 1200,
            departure: 6 * 3600 + 1200,
            pickupType: 1,
            dropOffType: 0,
          },
        ],
      },
      {
        id: "out-3",
        serviceDate: "20260831",
        directionId: "0",
        headsign: "East",
        calls: [
          {
            stopId: "west",
            sequence: 1,
            arrival: 6 * 3600 + 1200,
            departure: 6 * 3600 + 1200,
            pickupType: 0,
            dropOffType: 0,
          },
          {
            stopId: "east",
            sequence: 2,
            arrival: 6 * 3600 + 1800,
            departure: 6 * 3600 + 1800,
            pickupType: 1,
            dropOffType: 0,
          },
        ],
      },
      {
        id: "back-1",
        serviceDate: "20260831",
        directionId: "1",
        headsign: "West",
        calls: [
          {
            stopId: "east",
            sequence: 1,
            arrival: 7 * 3600,
            departure: 7 * 3600,
            pickupType: 0,
            dropOffType: 0,
          },
          {
            stopId: "west",
            sequence: 2,
            arrival: 7 * 3600 + 600,
            departure: 7 * 3600 + 600,
            pickupType: 1,
            dropOffType: 0,
          },
        ],
      },
      {
        id: "back-2",
        serviceDate: "20260831",
        directionId: "1",
        headsign: "West",
        calls: [
          {
            stopId: "east",
            sequence: 1,
            arrival: 7 * 3600 + 600,
            departure: 7 * 3600 + 600,
            pickupType: 0,
            dropOffType: 0,
          },
          {
            stopId: "west",
            sequence: 2,
            arrival: 7 * 3600 + 1200,
            departure: 7 * 3600 + 1200,
            pickupType: 1,
            dropOffType: 0,
          },
        ],
      },
      {
        id: "back-3",
        serviceDate: "20260831",
        directionId: "1",
        headsign: "West",
        calls: [
          {
            stopId: "east",
            sequence: 1,
            arrival: 7 * 3600 + 1200,
            departure: 7 * 3600 + 1200,
            pickupType: 0,
            dropOffType: 0,
          },
          {
            stopId: "west",
            sequence: 2,
            arrival: 7 * 3600 + 1800,
            departure: 7 * 3600 + 1800,
            pickupType: 1,
            dropOffType: 0,
          },
        ],
      },
    ],
  };
}
function section(id: string, kind: FrequencySection["kind"]): FrequencySection {
  return {
    id,
    kind,
    from: { id: id + "a", name: id + " origin" },
    to: { id: id + "b", name: id + " terminus" },
    stationIds: [id + "a", id + "b"],
    average: { peakMinutes: 2, offPeakMinutes: 4, nightMinutes: 10 },
    directions: profile().directions,
  };
}
function line(id = "line:IDFM:C01371"): GlobalMapLine {
  return {
    id,
    index: 0,
    code: id,
    label: id,
    mode: "METRO",
    color: "#123456",
    textColor: "#ffffff",
    aliases: [],
    stationIds: [],
    geometryIds: [],
  };
}
function station(): GlobalMapStation {
  return {
    id: "station",
    index: 0,
    name: "Station",
    normalizedName: "station",
    aliases: [],
    lat: 48,
    lon: 2,
    rawRefs: [],
    lineIds: [],
    ownerChunkId: "test",
    isHub: false,
    sourceCrs: "EPSG:2154",
    sourceX: 0,
    sourceY: 0,
    worldX: 0,
    worldY: 0,
    coordinateSource: "netex",
    transformVersion: "lambert93-ntf-v1",
  };
}
const wrappers: Array<{ unmount(): void }> = [];
function card(value = profile(), preview = false) {
  const wrapper = mount(GtfsFrequencyCard, { props: { profile: value, preview } });
  wrappers.push(wrapper);
  return wrapper;
}
function sidebar(props: { line?: GlobalMapLine; previewLine?: GlobalMapLine } = {}) {
  const wrapper = mount(GlobalMapPickerSideBar, {
    props,
    global: {
      stubs: {
        LineIconBadge: true,
        CitiesLinePattern: true,
        UserFriendlyTraffic: true,
        StationTransferDetails: true,
        AnnualRidershipCard: true,
        AnnualRidershipStationCard: true,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  language.value = "en";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
  frequencyClient.clearGtfsLineFrequencyCache();
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GTFS frequency card", () => {
  it("renders one compact grid for a simple line, with direction ranges and expandable labelled details", async () => {
    const wrapper = card();
    expect(wrapper.findAll('[data-testid="frequency-grid"]')).toHaveLength(1);
    expect(wrapper.get('[data-period="peakMinutes"] strong').text()).toBe("4–8 min");
    expect(wrapper.find('[data-period="peakMinutes"] small').exists()).toBe(false);
    expect(wrapper.get('[data-period="nightMinutes"] strong').text()).toBe("16–20 min");
    expect(wrapper.findAll("[data-frequency-section]")).toHaveLength(0);
    const details = wrapper.get("details");
    expect(details.attributes("open")).toBeUndefined();
    await wrapper.get("summary").trigger("click");
    expect((details.element as HTMLDetailsElement).open).toBe(true);
    expect(details.text()).toContain("From West to East");
    expect(details.text()).toContain("From East to West");
  });

  it("replaces the station mean with the timetable link and orders central before endpoints", () => {
    const wrapper = card(
      profile({
        branched: true,
        average: { peakMinutes: 11.5 },
        sections: [
          section("branch", "branch"),
          section("trunk", "central"),
          section("shared", "shared"),
        ],
      }),
    );
    expect(wrapper.get('[data-testid="frequency-average"] strong').text()).toBe("12 min");
    expect(wrapper.text()).toContain("View timetable");
    expect(wrapper.find('[data-testid="gtfs-frequency-timetable"]').exists()).toBe(true);
    const sections = wrapper.findAll("[data-frequency-section]");
    expect(sections.map((item) => item.attributes("data-frequency-section"))).toEqual([
      "trunk",
      "branch",
      "shared",
    ]);
    expect(sections[0]!.text()).toContain("Central section");
    expect(sections[1]!.text()).toContain("From branch origin to branch terminus");
    expect(sections[0]!.get('[data-period="peakMinutes"] strong').text()).toBe("4–8 min");
    expect(sections[0]!.find('[data-period="peakMinutes"] small').exists()).toBe(false);
  });

  it("collapses direction ranges whose formatted bounds are equal", () => {
    const wrapper = card(
      profile({
        average: { peakMinutes: 5.025 },
        directions: [
          { id: "out", stationCount: 2, peakMinutes: 5.01 },
          { id: "back", stationCount: 2, peakMinutes: 5.04 },
        ],
      }),
    );
    expect(wrapper.get('[data-period="peakMinutes"] strong').text()).toBe("5 min");
    expect(wrapper.text()).not.toContain("5–5");
  });

  it("hides direction details when every rounded period is identical", () => {
    const wrapper = card(
      profile({
        average: { peakMinutes: 4.45, offPeakMinutes: 5.45, nightMinutes: 15 },
        directions: [
          {
            id: "out",
            stationCount: 2,
            peakMinutes: 4.4,
            offPeakMinutes: 5.4,
            nightMinutes: 14.9,
          },
          {
            id: "back",
            stationCount: 2,
            peakMinutes: 4.49,
            offPeakMinutes: 5.49,
            nightMinutes: 15.1,
          },
        ],
      }),
    );
    expect(wrapper.get('[data-period="peakMinutes"] strong').text()).toBe("4 min");
    expect(wrapper.get('[data-period="offPeakMinutes"] strong').text()).toBe("5 min");
    expect(wrapper.get('[data-period="nightMinutes"] strong').text()).toBe("15 min");
    expect(wrapper.find("details").exists()).toBe(false);
  });

  it("keeps direction details when one period is missing", () => {
    const wrapper = card(
      profile({
        average: { peakMinutes: 4, offPeakMinutes: 5, nightMinutes: 15 },
        directions: [
          { id: "out", stationCount: 2, peakMinutes: 4, offPeakMinutes: 5, nightMinutes: 15 },
          { id: "back", stationCount: 2, peakMinutes: 4, offPeakMinutes: 5 },
        ],
      }),
    );
    expect(wrapper.find("details").exists()).toBe(true);
  });

  it("shows branches without inventing a central section", () => {
    const wrapper = card(
      profile({
        branched: true,
        sections: [section("north", "branch"), section("south", "branch")],
      }),
    );
    expect(wrapper.text()).not.toContain("Central section");
    expect(wrapper.findAll("[data-frequency-section]")).toHaveLength(2);
    expect(wrapper.text()).toContain("From north origin to north terminus");
  });

  it("retains the average when topology is missing and explains the unavailable decomposition", () => {
    const wrapper = card(profile({ topologyAvailable: false, branched: true }));
    expect(wrapper.get('[data-testid="frequency-average"] strong').text()).toBe("6 min");
    expect(wrapper.text()).toContain(
      "Topology unavailable: average shown, section breakdown unavailable.",
    );
  });

  it("shows GTFS provenance metadata only after opening the source modal", async () => {
    const wrapper = card();
    expect(wrapper.text()).toContain("Source: GTFS");
    expect(wrapper.text()).not.toContain("Service: 08/31/2026");
    expect(wrapper.text()).not.toContain("Dataset updated: 08/30/2026");
    expect(wrapper.text()).not.toContain("Coverage: 08/01/2026–09/30/2026");
    await wrapper.get('[data-testid="gtfs-frequency-source"]').trigger("click");
    const details = document.body.querySelector('[data-testid="gtfs-frequency-source-details"]');
    expect(details).not.toBeNull();
    expect(details?.textContent).toContain("Service: 08/31/2026");
    expect(details?.textContent).toContain("Dataset updated: 08/30/2026");
    expect(details?.textContent).toContain("Coverage: 08/01/2026–09/30/2026");
  });

  it("opens the timetable modal and requests the displayed service date", async () => {
    const request = vi
      .spyOn(timetableClient, "fetchGtfsLineTimetable")
      .mockResolvedValue(timetable());
    const wrapper = card();

    await wrapper.get('[data-testid="gtfs-frequency-timetable"]').trigger("click");
    await flushPromises();

    expect(request).toHaveBeenCalledExactlyOnceWith("line:IDFM:C01371", {
      serviceDate: "20260831",
      signal: expect.any(AbortSignal),
    });
    const modal = document.body.querySelector('[data-testid="line-frequency-timetable"]');
    expect(modal).not.toBeNull();
    expect(document.body.querySelector(".line-frequency-timetable-modal")?.textContent).toContain(
      "Scheduled timetable",
    );
    expect(modal?.textContent).toContain("Towards East");
    expect(modal?.textContent).toContain("5:00–7:00");
    expect(modal?.textContent).toContain("10 min");
    expect(
      document.body.querySelector('[data-testid="line-frequency-timetable-table"]'),
    ).not.toBeNull();
    expect(
      document.body.querySelector('[data-testid="line-frequency-timetable-departures"]'),
    ).toBeNull();
  });

  it("uses the server-resolved topology ids for technical NeTEx sections", async () => {
    const resolvedStopsTimetable = timetable();
    resolvedStopsTimetable.stops = resolvedStopsTimetable.stops.map((stop, index) => ({
      ...stop,
      topologyId: `netex-${index === 0 ? "west" : "east"}`,
    }));
    const request = vi
      .spyOn(timetableClient, "fetchGtfsLineTimetable")
      .mockResolvedValue(resolvedStopsTimetable);
    const technicalSection: FrequencySection = {
      id: "section:technical",
      kind: "shared",
      from: { id: "netex-west", name: "West" },
      to: { id: "netex-east", name: "East" },
      stationIds: ["netex-west", "netex-east"],
      average: { peakMinutes: 5, offPeakMinutes: 8 },
      directions: profile().directions,
    };
    const wrapper = card(
      profile({
        sections: [technicalSection],
      }),
    );

    await wrapper.get('[data-testid="gtfs-frequency-timetable"]').trigger("click");
    await flushPromises();

    expect(request).toHaveBeenCalledOnce();
    expect(
      document.body.querySelector('[data-testid="line-frequency-timetable-table"]'),
    ).not.toBeNull();
    expect(document.body.textContent).not.toContain("No passage serves this segment");
  });

  it("explains when the requested timetable has no usable departures", async () => {
    vi.spyOn(timetableClient, "fetchGtfsLineTimetable").mockResolvedValue({
      ...timetable(),
      trips: [],
    });
    const wrapper = card();

    await wrapper.get('[data-testid="gtfs-frequency-timetable"]').trigger("click");
    await flushPromises();

    expect(
      document.body.querySelector('[data-testid="line-frequency-timetable-unavailable"]')
        ?.textContent,
    ).toContain("No scheduled departures are available for this date.");
    expect(
      document.body.querySelector('[data-testid="line-frequency-timetable-table"]'),
    ).toBeNull();
  });

  it("keeps the central segment explicit in the timetable selector and applies the line color", async () => {
    const central: FrequencySection = {
      id: "central",
      kind: "central",
      from: { id: "west", name: "West" },
      to: { id: "east", name: "East" },
      stationIds: ["west", "east"],
      average: { peakMinutes: 5, offPeakMinutes: 8 },
      directions: [
        { id: "central:forward", from: "West", to: "East", stationCount: 1, peakMinutes: 5 },
        { id: "central:reverse", from: "East", to: "West", stationCount: 1, peakMinutes: 5 },
      ],
    };
    const branch: FrequencySection = {
      ...central,
      id: "branch",
      kind: "branch",
      from: { id: "branch-west", name: "Branch West" },
      to: { id: "branch-east", name: "Branch East" },
    };
    vi.spyOn(timetableClient, "fetchGtfsLineTimetable").mockResolvedValue(timetable());
    const wrapper = mount(GtfsFrequencyCard, {
      props: {
        profile: profile({ sections: [branch, central] }),
        lineColor: "#5091cb",
        stationCoordinates: [
          { id: "west", name: "West", lat: 48.85, lon: 2.2 },
          { id: "east", name: "East", lat: 48.85, lon: 2.5 },
        ],
      },
    });
    wrappers.push(wrapper);

    await wrapper.get('[data-testid="gtfs-frequency-timetable"]').trigger("click");
    await flushPromises();

    const selector = document.body.querySelector(
      '[data-testid="line-frequency-timetable-segment"]',
    ) as HTMLElement | null;
    expect(selector).not.toBeNull();
    const trigger = selector?.querySelector('[role="combobox"]') as HTMLButtonElement | null;
    expect(trigger?.textContent).toContain("From West to East");
    expect(
      trigger?.querySelector(".line-frequency-timetable__segment-chip")?.textContent,
    ).toContain("Central section");
    trigger?.click();
    await nextTick();
    const options = [...selector!.querySelectorAll('[role="option"]')].map(
      (option) => option.textContent,
    );
    expect(options).toContain("Central sectionFrom West to EastWest → East");
    expect(
      document.body
        .querySelector('[data-testid="line-frequency-timetable"]')
        ?.getAttribute("style"),
    ).toContain("--line-frequency-color: #5091cb");
  });

  it("keeps the source button disabled without loaded card data", async () => {
    const wrapper = card(profile(), true);
    const source = wrapper.get('[data-testid="gtfs-frequency-source"]');
    expect(source.attributes("disabled")).toBeDefined();
    await source.trigger("click");
    expect(document.body.querySelector('[data-testid="gtfs-frequency-source-details"]')).toBeNull();
  });

  it("formats civil dates in French and falls back to the dataset version", async () => {
    language.value = "fr";
    const wrapper = card(profile({ sourceUpdatedAt: undefined }));
    expect(wrapper.text()).toContain("Source : GTFS");
    expect(wrapper.text()).not.toContain("Service : 31/08/2026");
    await wrapper.get('[data-testid="gtfs-frequency-source"]').trigger("click");
    const details = document.body.querySelector('[data-testid="gtfs-frequency-source-details"]');
    expect(details?.textContent).toContain("Service : 31/08/2026");
    expect(details?.textContent).toContain("Couverture : 01/08/2026–30/09/2026");
    expect(details?.textContent).toContain("Version des données : dataset-v1");
    expect(details?.textContent).not.toContain("date inconnue");
  });

  it.each([
    ["disabled", "GTFS timetables are disabled."],
    ["missing", "The GTFS dataset is unavailable."],
    ["out-of-coverage", "The service date is outside GTFS coverage."],
    ["line-missing", "This line is absent from the GTFS dataset."],
    ["insufficient", "Too few departures to calculate intervals for this day."],
  ] as const)("explains %s without displaying values as available", async (status, reason) => {
    const wrapper = card(profile({ status }));
    expect(wrapper.get("[data-frequency-status]").text()).toBe(reason);
    expect(wrapper.find('[data-testid="frequency-average"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Service: 08/31/2026");
    await wrapper.get('[data-testid="gtfs-frequency-source"]').trigger("click");
    expect(
      document.body.querySelector('[data-testid="gtfs-frequency-source-details"]')?.textContent,
    ).toContain("Service: 08/31/2026");
  });

  it("renders missing periods and French labels through the catalog", () => {
    language.value = "fr";
    const wrapper = card(profile({ average: { peakMinutes: 2.5 }, directions: [] }));
    expect(wrapper.text()).toContain("Source : GTFS");
    expect(wrapper.text()).toContain("3 min");
    expect(wrapper.get('[data-period="nightMinutes"] strong').text()).toBe("Non disponible");
    expect(wrapper.find("details").exists()).toBe(false);
  });

  it("hides pinned metrics and metadata during preview", () => {
    const wrapper = card(profile(), true);
    expect(wrapper.find('[data-testid="frequency-grid"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("20260831");
    expect(wrapper.text()).not.toContain("08/31/2026");
    expect(wrapper.text()).toContain("Frequency is not loaded in preview");
  });
});

describe("GTFS pinned sidebar requests", () => {
  it("never requests a preview, requests a pinned line without stations, and ignores station/preview changes", async () => {
    const request = vi
      .spyOn(frequencyClient, "fetchGtfsLineFrequency")
      .mockResolvedValue(profile());
    const wrapper = sidebar({ previewLine: line("preview") });
    await vi.advanceTimersByTimeAsync(100);
    expect(request).not.toHaveBeenCalled();
    await wrapper.setProps({ line: line() });
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledExactlyOnceWith("line:IDFM:C01371", {
      signal: expect.any(AbortSignal),
    });
    await wrapper.setProps({ previewLine: line("another-preview"), stations: [station()] });
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ previewLine: undefined });
    expect(wrapper.get('[data-testid="gtfs-frequency-card"]').text()).toContain("4–8 min");
  });

  it("aborts old requests and ignores their late success or failure, including after unpin", async () => {
    let resolveFirst!: (value: GtfsLineFrequencyResponse) => void;
    let rejectSecond!: (reason: Error) => void;
    const request = vi
      .spyOn(frequencyClient, "fetchGtfsLineFrequency")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectSecond = reject;
          }),
      )
      .mockResolvedValue(profile({ average: { peakMinutes: 17 }, directions: [] }));
    const wrapper = sidebar({ line: line("first") });
    await vi.advanceTimersByTimeAsync(100);
    const firstSignal = request.mock.calls[0]![1]!.signal!;
    await wrapper.setProps({ line: line("second") });
    expect(firstSignal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    await wrapper.setProps({ line: line("third") });
    await vi.advanceTimersByTimeAsync(100);
    resolveFirst(profile({ average: { peakMinutes: 99 }, directions: [] }));
    rejectSecond(new Error("late failure"));
    await flushPromises();
    expect(wrapper.get('[data-testid="gtfs-frequency-card"]').text()).toContain("17 min");
    expect(wrapper.text()).not.toContain("99 min");
    const lastSignal = request.mock.calls[2]![1]!.signal!;
    await wrapper.setProps({ line: undefined });
    expect(lastSignal.aborted).toBe(true);
    expect(wrapper.find('[data-testid="gtfs-frequency-card"]').exists()).toBe(false);
  });

  it("refreshes an open pinned line after Paris midnight", async () => {
    vi.setSystemTime(new Date("2026-08-31T21:59:50Z"));
    const request = vi
      .spyOn(frequencyClient, "fetchGtfsLineFrequency")
      .mockResolvedValue(profile());
    const wrapper = sidebar({ line: line() });
    await vi.advanceTimersByTimeAsync(100);
    request.mockResolvedValue(profile({ serviceDate: "20260901" }));
    await vi.advanceTimersByTimeAsync(30_100);
    expect(request).toHaveBeenCalledTimes(2);
    await wrapper.get('[data-testid="gtfs-frequency-source"]').trigger("click");
    expect(
      document.body.querySelector('[data-testid="gtfs-frequency-source-details"]')?.textContent,
    ).toContain("Service: 09/01/2026");
  });
});

describe("GTFS frequency client cache", () => {
  it.each([
    ["2026-08-24T10:00:00Z", "20260824"],
    ["2026-08-25T10:00:00Z", "20260825"],
    ["2026-08-26T10:00:00Z", "20260826"],
    ["2026-08-27T10:00:00Z", "20260827"],
    ["2026-08-28T21:59:59Z", "20260828"],
    ["2026-08-28T22:00:00Z", "20260831"],
    ["2026-08-29T21:59:59Z", "20260831"],
    ["2026-08-29T22:00:00Z", "20260831"],
    ["2026-08-30T22:00:00Z", "20260831"],
    ["2026-08-31T22:00:00Z", "20260901"],
    ["2026-03-28T23:00:00Z", "20260330"],
    ["2026-10-24T22:00:00Z", "20261026"],
  ])("selects the working service date in Paris at %s", (now, expected) => {
    expect(frequencyClient.getGtfsServiceDate(new Date(now))).toBe(expected);
  });

  it("uses the encoded line endpoint and caches the completed response", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => profile() }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await frequencyClient.fetchGtfsLineFrequency("line:IDFM:C01371", { signal: controller.signal });
    await frequencyClient.fetchGtfsLineFrequency("line:IDFM:C01371");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/lines/line%3AIDFM%3AC01371/frequency",
      expect.objectContaining({ signal: expect.any(AbortSignal), cache: "no-store" }),
    );
  });

  it("forwards cancellation while reading the frequency response body", async () => {
    let requestSignal: AbortSignal | undefined;
    let bodyStarted!: () => void;
    const started = new Promise<void>((resolve) => { bodyStarted = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return { ok: true, json: async () => {
        bodyStarted();
        return new Promise(() => {});
      } };
    }));
    const controller = new AbortController();
    const pending = frequencyClient.fetchGtfsLineFrequency("line:IDFM:C01371", { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await started;
    controller.abort();
    await rejected;
    expect(requestSignal?.aborted).toBe(true);
  });

  it("bounds the cache and expires results by TTL and Paris service date", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => profile({ serviceDate: frequencyClient.getGtfsServiceDate() }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 33; i++) await frequencyClient.fetchGtfsLineFrequency(String(i));
    await frequencyClient.fetchGtfsLineFrequency("0");
    expect(fetchMock).toHaveBeenCalledTimes(34);
    vi.setSystemTime(new Date("2026-08-31T12:06:00Z"));
    await frequencyClient.fetchGtfsLineFrequency("0");
    expect(fetchMock).toHaveBeenCalledTimes(35);
    vi.setSystemTime(new Date("2026-08-31T21:59:59Z"));
    await frequencyClient.fetchGtfsLineFrequency("0");
    vi.setSystemTime(new Date("2026-08-31T22:00:01Z"));
    const result = await frequencyClient.fetchGtfsLineFrequency("0");
    expect(result.serviceDate).toBe("20260901");
    expect(fetchMock).toHaveBeenCalledTimes(37);
  });

  it("accepts an upcoming working day while expiring the cache on the Paris request day", async () => {
    vi.setSystemTime(new Date("2026-08-29T21:59:59Z"));
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => profile() }));
    vi.stubGlobal("fetch", fetchMock);
    const saturday = await frequencyClient.fetchGtfsLineFrequency("line");
    expect(saturday.serviceDate).toBe("20260831");
    await frequencyClient.fetchGtfsLineFrequency("line");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-08-29T22:00:01Z"));
    await frequencyClient.fetchGtfsLineFrequency("line");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never caches failures, cancelled requests or outdated dates", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(frequencyClient.fetchGtfsLineFrequency("line")).rejects.toThrow("503");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => profile({ serviceDate: "20260830" }),
    });
    await expect(frequencyClient.fetchGtfsLineFrequency("line")).rejects.toThrow(
      "outdated service date",
    );
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      return { ok: true, json: async () => profile() };
    });
    await expect(
      frequencyClient.fetchGtfsLineFrequency("line", { signal: controller.signal }),
    ).rejects.toThrow();
    fetchMock.mockResolvedValue({ ok: true, json: async () => profile() });
    await frequencyClient.fetchGtfsLineFrequency("line");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
