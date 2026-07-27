import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TransitBoard from "../src/components/TransitBoard.vue";
import type {
  LineSearchOption,
  StationSearchOption,
  TransitBoardConfig,
} from "../src/types/transit";

const {
  fetchDirectionGroupsForStation,
  fetchStationTransfers,
  searchLineStations,
} = vi.hoisted(() => ({
  fetchDirectionGroupsForStation: vi.fn(),
  fetchStationTransfers: vi.fn(),
  searchLineStations: vi.fn(),
}));

vi.mock("../src/services/idfm", () => ({
  fetchDirectionGroupsForStation,
  fetchStationTransfers,
  searchLineStations,
}));

const line: LineSearchOption = {
  family: "METRO",
  id: "line:IDFM:C01384",
  label: "14",
  navitiaId: "line:IDFM:C01384",
  ref: "line:IDFM:C01384",
  color: "#8a4bb5",
  textColor: "#ffffff",
};

const currentStation: StationSearchOption = {
  id: "stop_area:current",
  label: "Station actuelle",
  city: "Paris",
  monitoringRef: "STIF:StopArea:SP:current:",
  scheduleStopAreaRef: "stop_area:current",
};

const nextStation: StationSearchOption = {
  id: "stop_area:next",
  label: "Nouvelle station",
  city: "Paris",
  monitoringRef: "STIF:StopArea:SP:next:",
  scheduleStopAreaRef: "stop_area:next",
};

const latestStation: StationSearchOption = {
  id: "stop_area:latest",
  label: "Station la plus récente",
  city: "Paris",
  monitoringRef: "STIF:StopArea:SP:latest:",
  scheduleStopAreaRef: "stop_area:latest",
};

beforeEach(() => {
  document.body.innerHTML = "";
  fetchDirectionGroupsForStation.mockReset();
  fetchStationTransfers.mockReset();
  searchLineStations.mockReset();
  fetchStationTransfers.mockResolvedValue([]);
  searchLineStations.mockResolvedValue([nextStation, latestStation]);

  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("TransitBoard station change", () => {
  it("does not leave the change button loading forever when direction lookup hangs", async () => {
    vi.useFakeTimers();
    fetchDirectionGroupsForStation.mockImplementation(
      () => new Promise(() => undefined),
    );

    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [],
        directionGroups: [],
        loading: false,
      },
      attachTo: document.body,
    });

    await openStationEditor(wrapper);
    await openStationOptions();
    await selectStation(nextStation.label);

    const changeButton = findModalButton("Changer");
    expect(changeButton.disabled).toBe(false);
    changeButton.click();
    await flushPromises();

    expect(findModalButton("Changement").disabled).toBe(true);

    vi.advanceTimersByTime(15_000);
    await flushPromises();

    expect(findModalButton("Changer").disabled).toBe(false);
    expect(document.body.textContent).toContain("Impossible de changer de station");

    wrapper.unmount();
  });

  it("ignores an older change request after selecting another station", async () => {
    let resolveFirstRequest!: (value: unknown[]) => void;
    fetchDirectionGroupsForStation.mockImplementation(
      (_line: LineSearchOption, station: StationSearchOption) =>
        station.id === nextStation.id
          ? new Promise((resolve) => {
              resolveFirstRequest = resolve;
            })
          : Promise.resolve([]),
    );

    const wrapper = mount(TransitBoard, {
      props: {
        board: createBoard(),
        collapsedDirectionIds: [],
        departures: [],
        directionGroups: [],
        loading: false,
      },
      attachTo: document.body,
    });

    await openStationEditor(wrapper);
    await openStationOptions();
    await selectStation(nextStation.label);
    findModalButton("Changer").click();
    await flushPromises();

    const stationInput = document.body.querySelector(
      ".station-combobox__input",
    ) as HTMLInputElement;
    stationInput.value = latestStation.label;
    stationInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    await selectStation(latestStation.label);

    const retryButton = findModalButton("Changer");
    expect(retryButton.disabled).toBe(false);
    retryButton.click();
    await flushPromises();

    expect(wrapper.emitted("change-station")?.[0]?.[0]).toMatchObject({
      title: latestStation.label,
    });

    resolveFirstRequest([]);
    await flushPromises();
    expect(wrapper.emitted("change-station")).toHaveLength(1);

    wrapper.unmount();
  });
});

async function openStationEditor(wrapper: VueWrapper): Promise<void> {
  await wrapper.get(".board-actions__trigger").trigger("click");
  const action = Array.from(document.body.querySelectorAll(".context-menu button")).find(
    (button) => button.textContent?.includes("Changer de station"),
  );

  if (!(action instanceof HTMLButtonElement)) {
    throw new Error("Could not find the station change action");
  }

  action.click();
  await flushPromises();
  await flushPromises();
}

async function openStationOptions(): Promise<void> {
  const stationButton = document.body.querySelector(
    ".station-combobox__button",
  ) as HTMLButtonElement;
  stationButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  await flushPromises();
}

async function selectStation(label: string): Promise<void> {
  const stationOption = Array.from(
    document.body.querySelectorAll(".station-combobox__option"),
  ).find((option) => option.textContent?.includes(label));

  if (!(stationOption instanceof HTMLButtonElement)) {
    throw new Error(`Could not find station option ${label}`);
  }

  stationOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await flushPromises();
}

function findModalButton(label: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (candidate) =>
      candidate.closest(".modal-panel") && candidate.textContent?.includes(label),
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Could not find modal button containing ${label}`);
  }

  return button;
}

function createBoard(): TransitBoardConfig {
  return {
    id: "metro-14-current",
    title: currentStation.label,
    city: currentStation.city ?? "",
    line: {
      ref: line.ref,
      shortName: line.label,
      longName: "METRO 14",
      mode: "metro",
      color: line.color ?? "#8a4bb5",
      textColor: line.textColor ?? "#ffffff",
    },
    monitoringPoints: [
      { ref: currentStation.monitoringRef ?? "stop:current", label: "Tous quais" },
    ],
    directionGroups: [],
    schedule: {
      lineRef: line.navitiaId ?? line.id,
      stopAreaRef: currentStation.scheduleStopAreaRef ?? currentStation.id,
    },
    maxDepartures: 8,
  };
}
