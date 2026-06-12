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
      .get('button[aria-label="Afficher les détails de la ligne 91"]')
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
});
