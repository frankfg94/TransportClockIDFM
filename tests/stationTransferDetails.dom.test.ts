import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StationTransferDetails from "../src/components/StationTransferDetails.vue";
import type { TransferLineOption } from "../src/types/transit";

const { loadTransferLineDirections } = vi.hoisted(() => ({
  loadTransferLineDirections: vi.fn(),
}));

vi.mock("../src/features/line-map/lineMapData", () => ({
  loadTransferLineDirections,
}));

const transfers: TransferLineOption[] = [
  { id: "bus:91", label: "91", family: "BUS" },
  { id: "metro:4", label: "4", family: "METRO" },
  { id: "rer:b", label: "B", family: "RER" },
];

beforeEach(() => {
  loadTransferLineDirections.mockReset();
  loadTransferLineDirections.mockResolvedValue({
    lineId: "bus:91",
    directions: ["Montparnasse", "Bastille"],
  });
});

describe("StationTransferDetails", () => {
  it("renders ordered categories and loads bus directions", async () => {
    const wrapper = mount(StationTransferDetails, {
      props: {
        stationLabel: "Châtelet",
        city: "Paris",
        transfers,
      },
      global: {
        stubs: {
          LineIconBadge: {
            props: ["line"],
            template: '<span class="line-stub">{{ line.label }}</span>',
          },
        },
      },
    });

    expect(
      wrapper
        .findAll("[data-transfer-group]")
        .map((group) => group.attributes("data-transfer-group")),
    ).toEqual(["METRO", "RER", "BUS"]);

    await wrapper
      .get('button[aria-label="Afficher les details de la ligne 91"]')
      .trigger("click");
    await flushPromises();

    expect(loadTransferLineDirections).toHaveBeenCalledWith("bus:91");
    expect(wrapper.text()).toContain("Montparnasse");
    expect(wrapper.text()).toContain("Bastille");
  });

  it("renders loading, error and empty states", async () => {
    const wrapper = mount(StationTransferDetails, {
      props: {
        stationLabel: "Station",
        loading: true,
      },
    });

    expect(wrapper.text()).toContain("Chargement des correspondances");

    await wrapper.setProps({ loading: false, error: true });
    expect(wrapper.text()).toContain("Correspondances indisponibles");

    await wrapper.setProps({ error: false });
    expect(wrapper.text()).toContain("Aucune autre ligne");
  });

  it("emits selected transfers on click and highlights the externally active transfer", async () => {
    const wrapper = mount(StationTransferDetails, {
      props: {
        stationLabel: "ChÃ¢telet",
        transfers,
        activeTransferId: "rer:b",
      },
      global: {
        stubs: {
          LineIconBadge: {
            props: ["line"],
            template: '<span class="line-stub">{{ line.label }}</span>',
          },
        },
      },
    });

    const items = wrapper.findAll(".station-transfer-details__item");
    expect(items[1].classes()).toContain(
      "station-transfer-details__item--active",
    );

    await items[0].trigger("click");

    expect(wrapper.emitted("selectTransfer")?.[0]?.[0]).toMatchObject({
      id: "metro:4",
    });
  });

  it("loads hover details without emitting a map selection", async () => {
    const wrapper = mount(StationTransferDetails, {
      props: {
        stationLabel: "ChÃ¢telet",
        transfers,
      },
      global: {
        stubs: {
          LineIconBadge: {
            props: ["line"],
            template: '<span class="line-stub">{{ line.label }}</span>',
          },
        },
      },
    });

    await wrapper
      .findAll(".station-transfer-details__item")
      .at(2)
      ?.trigger("mouseenter");
    await flushPromises();

    expect(loadTransferLineDirections).toHaveBeenCalledWith("bus:91");
    expect(wrapper.emitted("selectTransfer")).toBeUndefined();
  });
});
