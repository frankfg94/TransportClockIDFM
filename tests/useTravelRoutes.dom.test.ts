import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { TravelRoutesProvider } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { PlacesProvider } from "../src/features/nearby-stations/nearbyPlaces";
import { useTravelRoutes } from "../src/features/nearby-stations/useTravelRoutes";

describe("useTravelRoutes", () => {
  it("asks Navitia for route alternatives, recommends the shortest and selects one", async () => {
    const findJourneys = vi.fn(async () => [
      { id: "slow", durationSeconds: 1_800, transferCount: 1, sections: [{ durationSeconds: 900, lineCode: "194", lineMode: "BUS" as const }] },
      { id: "fast", durationSeconds: 900, transferCount: 0, sections: [{ durationSeconds: 600, lineCode: "T10", lineMode: "TRAM" as const }] },
    ]);
    let travel!: ReturnType<typeof useTravelRoutes>;
    const Harness = defineComponent({
      setup() {
        travel = useTravelRoutes({
          origin: ref({ lon: 2.2978, lat: 48.8102, label: "9 rue Chateaubriand" }),
          findJourneys,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await travel.setDestination({ lon: 2.35, lat: 48.86, label: "Châtelet" });
    await flushPromises();

    expect(findJourneys).toHaveBeenCalledWith(expect.objectContaining({ count: 8, includeDisruptions: true, includeGeoJson: true }));
    expect(travel.routes.value.map((route) => route.id)).toEqual(["fast", "slow"]);
    expect(travel.selectedRouteId.value).toBe("fast");
    expect(travel.selectRoute("slow")?.transitSections[0]?.lineCode).toBe("194");
    expect(findJourneys).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("keeps duplicate Navitia journey ids selectable as distinct alternatives", async () => {
    const findJourneys = vi.fn(async () => [
      { id: "same-id", durationSeconds: 900, transferCount: 0, sections: [] },
      { id: "same-id", durationSeconds: 1_200, transferCount: 1, sections: [] },
    ]);
    let travel!: ReturnType<typeof useTravelRoutes>;
    const Harness = defineComponent({
      setup() {
        travel = useTravelRoutes({
          origin: ref({ lon: 2.2978, lat: 48.8102, label: "9 rue Chateaubriand" }),
          findJourneys,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await travel.setDestination({ lon: 2.35, lat: 48.86, label: "Châtelet" });
    await flushPromises();

    expect(travel.routes.value.map((route) => route.id)).toEqual(["same-id", "same-id:1"]);
    expect(travel.selectRoute("same-id:1")?.durationSeconds).toBe(1_200);
    wrapper.unmount();
  });

  it("requests a 03:00 departure and keeps walking plus Noctilien sections", async () => {
    const findJourneys = vi.fn(async () => [{
      id: "night-route",
      durationSeconds: 2_100,
      transferCount: 1,
      sections: [
        { type: "street_network", mode: "walking", durationSeconds: 240 },
        { type: "public_transport", mode: "bus", durationSeconds: 900, lineCode: "N14", lineMode: "NOCTILIEN" as const },
        { type: "transfer", mode: "walking", durationSeconds: 300 },
        { type: "public_transport", mode: "metro", durationSeconds: 660, lineCode: "4", lineMode: "METRO" as const },
      ],
    }]);
    let travel!: ReturnType<typeof useTravelRoutes>;
    const Harness = defineComponent({
      setup() {
        travel = useTravelRoutes({
          origin: ref({ lon: 2.2978, lat: 48.8102, label: "9 rue Chateaubriand" }),
          findJourneys,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await travel.setDepartureDateTime("2026-08-21T03:00");
    await travel.setDestination({ lon: 2.3469765, lat: 48.861745, label: "Châtelet - Les Halles" });
    await flushPromises();

    expect(findJourneys).toHaveBeenLastCalledWith(expect.objectContaining({
      datetime: "20260821T030000",
      count: 8,
      includeDisruptions: true,
      includeGeoJson: true,
    }));
    expect(travel.routes.value[0]?.sections).toHaveLength(4);
    expect(travel.routes.value[0]?.transitSections.map((section) => section.lineMode)).toEqual(["NOCTILIEN", "METRO"]);
    wrapper.unmount();
  });

  it("probes journeys with the same normalized provider and date policy", async () => {
    const findJourneys = vi.fn(async () => [{
      id: "probe",
      durationSeconds: 600,
      sections: [],
    }]);
    let travel!: ReturnType<typeof useTravelRoutes>;
    const Harness = defineComponent({
      setup() {
        travel = useTravelRoutes({
          origin: ref({ lon: 2.3, lat: 48.8 }),
          findJourneys,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await expect(travel.probeJourneys({
      origin: { lon: 2.3, lat: 48.8 },
      destination: { lon: 2.35, lat: 48.86 },
      datetime: "2026-08-21T03:00",
    })).resolves.toHaveLength(1);
    expect(findJourneys).toHaveBeenCalledWith(expect.objectContaining({
      datetime: "20260821T030000",
      count: 8,
      includeDisruptions: true,
      includeGeoJson: true,
    }));
    wrapper.unmount();
  });

  it("exposes the configured station/place destination search", async () => {
    const searchDestinationPoints = vi.fn(async () => [{
      id: "stop_area:474151",
      lon: 2.3469765,
      lat: 48.861745,
      label: "Châtelet - Les Halles (Paris)",
      type: "station" as const,
    }]);
    let travel!: ReturnType<typeof useTravelRoutes>;
    const Harness = defineComponent({
      setup() {
        travel = useTravelRoutes({
          origin: ref<undefined>(),
          searchStations: true,
          searchPlaces: true,
          searchDestinationPoints,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await expect(travel.searchDestinations("Châtelet les Halles")).resolves.toEqual([expect.objectContaining({
      label: "Châtelet - Les Halles (Paris)",
      type: "station",
    })]);
    expect(searchDestinationPoints).toHaveBeenCalledWith("Châtelet les Halles", undefined);
    wrapper.unmount();
  });

  it("uses the stable place and travel provider ports", async () => {
    const travelRoutesProvider: TravelRoutesProvider = {
      findJourneys: vi.fn(async () => [{
        id: "provider-route",
        durationSeconds: 720,
        transferCount: 0,
        sections: [{ durationSeconds: 600, lineCode: "4", lineMode: "METRO" as const }],
      }]),
    };
    const placesProvider: PlacesProvider = {
      searchDestinations: vi.fn(async () => [{
        id: "station:chatelet",
        lon: 2.3469765,
        lat: 48.861745,
        label: "Châtelet - Les Halles",
        type: "station" as const,
      }]),
      searchNearby: vi.fn(async () => []),
    };
    let travel!: ReturnType<typeof useTravelRoutes>;
    const Harness = defineComponent({
      setup() {
        travel = useTravelRoutes({
          origin: ref({ lon: 2.2978, lat: 48.8102, label: "9 rue Chateaubriand" }),
          travelRoutesProvider,
          placesProvider,
          searchStations: true,
          searchPlaces: true,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await expect(travel.searchDestinations("Châtelet les Halles")).resolves.toEqual([
      expect.objectContaining({ id: "station:chatelet" }),
    ]);
    await travel.setDestination({ lon: 2.3469765, lat: 48.861745, label: "Châtelet - Les Halles" });
    await flushPromises();

    expect(placesProvider.searchDestinations).toHaveBeenCalledWith(
      "Châtelet les Halles",
      { includeStations: true, includePlaces: true, count: 8 },
      undefined,
    );
    expect(travelRoutesProvider.findJourneys).toHaveBeenCalledWith(expect.objectContaining({
      count: 8,
      includeDisruptions: true,
    }));
    expect(travel.routes.value[0]?.id).toBe("provider-route");
    wrapper.unmount();
  });
});
