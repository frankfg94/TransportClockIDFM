import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NearbyHeavyAccessGuide from "../src/features/nearby-stations/NearbyHeavyAccessGuide.vue";
import type { NearbyHeavyTransportCandidate } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { NearbyStationScheduleItem } from "../src/features/nearby-stations/nearbyStationSchedules";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";

function line(id: string, code: string, label: string, mode: GlobalMapLine["mode"]): GlobalMapLine {
  return {
    id,
    index: id.length,
    code,
    label,
    mode,
    color: "#5146ff",
    textColor: "#fff",
    aliases: [],
    stationIds: [],
    geometryIds: [],
  };
}

function station(id: string, name: string, lineIds: string[]): GlobalMapStation {
  const lon = 2.3;
  const lat = 48.76;
  const world = lonLatToWorld({ lon, lat });
  return {
    id,
    index: id.length,
    name,
    normalizedName: name.toLowerCase(),
    aliases: [],
    rawRefs: [id],
    lineIds,
    ownerChunkId: "fixture",
    isHub: false,
    sourceCrs: "EPSG:2154",
    sourceX: 0,
    sourceY: 0,
    lon,
    lat,
    worldX: world.x,
    worldY: world.y,
    coordinateSource: "netex",
    transformVersion: "lambert93-ntf-v1",
  };
}

describe("NearbyHeavyAccessGuide", () => {
  it("shows the next feeder passage for a selected heavy station", () => {
    const target = line("line:rer:b", "C01743", "B", "RER");
    const feeder = line("line:tram:t10", "C01742", "T10", "TRAM");
    const bus412 = line("line:bus:412", "412", "412", "BUS");
    const targetStation = station("station:croix", "La Croix de Berny", [target.id]);
    const feederStation = station("station:peintres", "Les Peintres", [feeder.id]);
    const candidate: NearbyHeavyTransportCandidate = {
      id: targetStation.id,
      entry: {
        id: targetStation.id,
        station: { ...targetStation, memberStationIds: [targetStation.id] },
        memberStations: [targetStation],
        lines: [target],
        distanceMeters: 2_700,
        insideRadius: true,
      },
      station: targetStation,
      lines: [target],
      distanceMeters: 2_700,
      access: {
        kind: "connection",
        walkingSeconds: 500,
        totalSeconds: 1_200,
        feederLineId: feeder.id,
        feederLineCode: "T10",
        feederMode: "TRAM",
        feederRideSeconds: 500,
      },
      accessByLine: {
        [target.id]: {
          kind: "connection",
          walkingSeconds: 500,
          totalSeconds: 1_200,
          feederLineId: feeder.id,
          feederLineCode: "T10",
          feederMode: "TRAM",
          feederRideSeconds: 500,
        },
      },
      accessAlternatives: [
        {
          kind: "connection",
          walkingSeconds: 500,
          totalSeconds: 1_200,
          feederLineId: feeder.id,
          feederLineCode: "T10",
          feederMode: "TRAM",
          feederRideSeconds: 500,
        },
        {
          kind: "connection",
          walkingSeconds: 600,
          totalSeconds: 1_500,
          feederLineId: bus412.id,
          feederLineCode: "412",
          feederMode: "BUS",
          feederRideSeconds: 900,
        },
      ],
      accessAlternativesByLine: {
        [target.id]: [
          {
            kind: "connection",
            walkingSeconds: 500,
            totalSeconds: 1_200,
            feederLineId: feeder.id,
            feederLineCode: "T10",
            feederMode: "TRAM",
            feederRideSeconds: 500,
          },
          {
            kind: "connection",
            walkingSeconds: 600,
            totalSeconds: 1_500,
            feederLineId: bus412.id,
            feederLineCode: "412",
            feederMode: "BUS",
            feederRideSeconds: 900,
          },
        ],
      },
      correspondenceLines: [
        bus412,
        line("line:bus:30-05", "30-05", "30-05", "BUS"),
      ],
      projected: true,
    };
    const scheduleItem = {
      id: `${feederStation.id}:${feeder.id}`,
      stationId: feederStation.id,
      line: feeder,
      entry: {
        id: feederStation.id,
        station: { ...feederStation, memberStationIds: [feederStation.id] },
        memberStations: [feederStation],
        lines: [feeder],
        distanceMeters: 140,
        insideRadius: true,
      },
      mapStation: feederStation,
      distanceMeters: 140,
      state: "visible",
      result: {
        departures: [],
        directionGroups: [{
          id: "direction:croix",
          label: "La Croix de Berny",
          departures: [{
            id: "departure:t10",
            lineRef: feeder.id,
            monitoringRef: "monitoring:t10",
            stopName: "Les Peintres",
            destination: "La Croix de Berny",
            monitoringLabel: "Les Peintres",
            expectedDepartureTime: new Date(Date.now() + 300_000).toISOString(),
            vehicleAtStop: false,
          }],
          serviceEnded: false,
        }],
      },
    } as unknown as NearbyStationScheduleItem;

    const wrapper = mount(NearbyHeavyAccessGuide, {
      props: { candidate, items: [scheduleItem] },
      global: { stubs: { LineIconBadge: { template: "<span data-testid='line-badge' />" } } },
    });

    expect(wrapper.text()).toContain("Aller au RER B en prenant le T10 dans 5 min");
    expect(wrapper.text()).toContain("ou marcher pendant");
    expect(wrapper.text()).toContain("Prochain passage de la ligne locale");
    expect(wrapper.text()).toContain("Correspondances à la gare");
    expect(wrapper.findAll("[data-testid='line-badge']")).toHaveLength(4);
  });

  it("keeps a finished feeder route visible and marks it unavailable", () => {
    const target = line("line:rer:b:finished", "C01743", "B", "RER");
    const feeder = line("line:tram:t10:finished", "C02528", "T10", "TRAM");
    const targetStation = station("station:croix:finished", "La Croix de Berny", [target.id]);
    const feederStation = station("station:peintres:finished", "Les Peintres", [feeder.id]);
    const candidate: NearbyHeavyTransportCandidate = {
      id: targetStation.id,
      entry: {
        id: targetStation.id,
        station: { ...targetStation, memberStationIds: [targetStation.id] },
        memberStations: [targetStation],
        lines: [target],
        distanceMeters: 2_700,
        insideRadius: true,
      },
      station: targetStation,
      lines: [target],
      distanceMeters: 2_700,
      access: {
        kind: "connection",
        walkingSeconds: 500,
        totalSeconds: 1_200,
        feederLineId: feeder.id,
        feederLineCode: "T10",
        feederMode: "TRAM",
        feederRideSeconds: 500,
      },
      accessByLine: {},
      projected: true,
    };
    const scheduleItem = {
      id: `${feederStation.id}:${feeder.id}`,
      stationId: feederStation.id,
      line: feeder,
      entry: {
        id: feederStation.id,
        station: { ...feederStation, memberStationIds: [feederStation.id] },
        memberStations: [feederStation],
        lines: [feeder],
        distanceMeters: 140,
        insideRadius: true,
      },
      mapStation: feederStation,
      distanceMeters: 140,
      state: "visible",
      result: {
        departures: [],
        directionGroups: [{
          id: "direction:finished",
          label: "La Croix de Berny",
          departures: [],
          serviceEnded: true,
        }],
      },
    } as unknown as NearbyStationScheduleItem;

    const wrapper = mount(NearbyHeavyAccessGuide, {
      props: { candidate, items: [scheduleItem] },
      global: { stubs: { LineIconBadge: { template: "<span data-testid='line-badge' />" } } },
    });

    expect(wrapper.text()).toContain("Aller au RER B en prenant le T10 dans indisponible");
    expect(wrapper.text()).toContain("Service terminé · indisponible");
  });
});
