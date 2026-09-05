import { describe, expect, it } from "vitest";
import { ref } from "vue";
import type { GlobalMapMode } from "../src/features/transport-map/contracts/manifest";
import { useTransportMapFilters } from "../src/features/transport-map/state/useTransportMapFilters";

describe("global map mode filters", () => {
  it("keeps Bus out of the default all-modes scene", () => {
    const filters = useTransportMapFilters(ref<GlobalMapMode[]>(["BUS", "METRO", "RER"]));

    filters.setAll();

    expect(filters.selectedModes.value).toEqual(["METRO", "RER"]);
    expect(filters.visibleModeMask.value & 1).toBe(0);
  });

  it("allows Bus to be enabled independently", () => {
    const filters = useTransportMapFilters(ref<GlobalMapMode[]>(["BUS", "METRO"]));

    filters.setAll();
    filters.toggle("BUS");

    expect(filters.selectedModes.value).toEqual(["METRO", "BUS"]);
    expect(filters.visibleModeMask.value & 1).toBe(1);
  });

  it("keeps Bus and Noctilien out of the default all-modes layer", () => {
    const filters = useTransportMapFilters(ref<GlobalMapMode[]>(["BUS", "METRO", "NOCTILIEN"]));

    filters.setAll();
    expect(filters.selectedModes.value).toEqual(["METRO"]);

    filters.toggle("BUS");
    expect(filters.selectedModes.value).toEqual(["METRO", "BUS"]);
    filters.toggle("NOCTILIEN");
    expect(filters.selectedModes.value).toEqual(["METRO", "BUS", "NOCTILIEN"]);
  });

  it("keeps Noctilien and Bike opt-in when an explicit context includes Bus", () => {
    const filters = useTransportMapFilters(ref<GlobalMapMode[]>(["BUS", "METRO", "NOCTILIEN", "BIKE"]));

    filters.setAllIncludingBus();

    expect(filters.selectedModes.value).toEqual(["BUS", "METRO"]);
  });

  it("shows every available mode for the explicit all-visible preset", () => {
    const filters = useTransportMapFilters(
      ref<GlobalMapMode[]>(["BUS", "METRO", "NOCTILIEN", "BIKE"]),
    );

    filters.setAll();
    expect(filters.selectedModes.value).toEqual(["METRO"]);

    filters.setAllVisible();
    expect(filters.selectedModes.value).toEqual(["BUS", "METRO", "NOCTILIEN", "BIKE"]);
  });
});
