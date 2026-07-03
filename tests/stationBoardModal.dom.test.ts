import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StationBoardModal from "../src/components/StationBoardModal.vue";
import type {
  LineSearchOption,
  StationSearchOption,
} from "../src/types/transit";

const {
  fetchDirectionGroupsForStation,
  fetchStationTransfers,
  fetchTransitFamilyOptions,
  searchLineStations,
  searchTransitLines,
} = vi.hoisted(() => ({
  fetchDirectionGroupsForStation: vi.fn(),
  fetchStationTransfers: vi.fn(),
  fetchTransitFamilyOptions: vi.fn(),
  searchLineStations: vi.fn(),
  searchTransitLines: vi.fn(),
}));

vi.mock("../src/services/idfm", () => ({
  fetchDirectionGroupsForStation,
  fetchStationTransfers,
  fetchTransitFamilyOptions,
  searchLineStations,
  searchTransitLines,
}));

const initialLine: LineSearchOption = {
  family: "RER",
  id: "line:IDFM:C01743",
  label: "B",
  navitiaId: "line:IDFM:C01743",
  ref: "line:IDFM:C01743",
  color: "#4b92db",
  textColor: "#ffffff",
};

const station: StationSearchOption = {
  id: "station:c",
  label: "Station C",
  city: "Paris",
  monitoringRef: "stop:c",
  scheduleStopAreaRef: "stop_area:c",
};

const dashboardOptions = [
  {
    id: "home",
    kind: "builtin",
    label: "Maison",
    preferences: {},
  },
  {
    id: "work",
    kind: "builtin",
    label: "Travail",
    preferences: {},
  },
] as never;

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  fetchDirectionGroupsForStation.mockResolvedValue([
    {
      id: "all",
      label: "Toutes directions",
      match: {},
    },
  ]);
  fetchStationTransfers.mockResolvedValue([]);
  fetchTransitFamilyOptions.mockResolvedValue([
    { id: "rer", label: "RER", family: "RER" },
  ]);
  searchLineStations.mockResolvedValue([station]);
  searchTransitLines.mockResolvedValue([initialLine]);
});

describe("StationBoardModal", () => {
  it("always uses the multi-step flow, even when dropdown mode is requested", async () => {
    mount(StationBoardModal, {
      props: {
        open: true,
        mode: "dropdown",
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(fetchTransitFamilyOptions).toHaveBeenCalled();
    expect(
      document.body.querySelector("[data-testid='station-board-selector']"),
    ).toBeNull();
    expect(
      document.body.querySelector(".station-board-modal--multistep"),
    ).toBeTruthy();
    expect(
      document.body.querySelector(".station-board-modal--dropdown"),
    ).toBeNull();
    expect(
      document.body.querySelector(".family-combobox__menu--inline"),
    ).toBeTruthy();
    expect(
      document.body.querySelector(".rich-combobox__menu--inline"),
    ).toBeNull();
    expect(document.body.textContent).toContain("Suivant");
  });

  it("starts directly on station selection with an initial line and emits the selected dashboard", async () => {
    const wrapper = mount(StationBoardModal, {
      props: {
        open: true,
        initialLine,
        initialFamily: "RER",
        showDashboardSelector: true,
        dashboardOptions,
        defaultDashboardId: "work",
      },
      attachTo: document.body,
    });
    await flushPromises();
    await flushPromises();

    expect(fetchTransitFamilyOptions).not.toHaveBeenCalled();
    expect(searchTransitLines).not.toHaveBeenCalled();
    expect(searchLineStations).toHaveBeenCalledWith(initialLine, "");
    expect(
      document.body.querySelector("[data-testid='station-board-selector']"),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("Ligne sélectionnée");
    expect(document.body.textContent).not.toContain("Sélectionner une ligne");

    const stationOption = document.body.querySelector(
      ".station-combobox__option",
    ) as HTMLButtonElement;
    stationOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushPromises();

    const addButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) =>
        button.closest(".modal-panel") &&
        button.textContent?.includes("Ajouter"),
    ) as HTMLButtonElement;
    addButton.click();
    await flushPromises();

    expect(wrapper.emitted("add")?.[0]?.[0]).toMatchObject({
      title: "Station C",
      line: {
        shortName: "B",
      },
    });
    expect(wrapper.emitted("add")?.[0]?.[1]).toBe("work");
  });

  it("can be used as a line-only selector without loading station choices", async () => {
    const wrapper = mount(StationBoardModal, {
      props: {
        open: true,
        lineOnly: true,
        initialFamily: "RER",
      },
      attachTo: document.body,
    });
    await flushPromises();
    await flushPromises();

    expect(document.body.textContent).toContain("Changer de ligne");
    expect(document.body.textContent).not.toContain("Station");
    expect(searchTransitLines).toHaveBeenCalledWith(
      { id: "rer", label: "RER", family: "RER" },
      "",
    );

    const lineOption = document.body.querySelector(
      ".rich-combobox__option",
    ) as HTMLButtonElement;
    lineOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushPromises();

    const changeButton = Array.from(
      document.body.querySelectorAll("button"),
    ).find(
      (button) =>
        button.closest(".modal-panel") &&
        button.textContent?.includes("Changer"),
    ) as HTMLButtonElement;
    changeButton.click();
    await flushPromises();

    expect(searchLineStations).not.toHaveBeenCalled();
    expect(wrapper.emitted("select-line")?.[0]).toEqual([initialLine, "RER"]);
  });
});
