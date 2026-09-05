import { describe, expect, it } from "vitest";
import {
  createTravelRouteAlarmTarget,
  toTravelAlarmIsoDateTime,
} from "../src/features/nearby-stations/nearbyTravelAlarm";
import type { TravelRoute } from "../src/features/nearby-stations/useTravelRoutes";

const route: TravelRoute = {
  id: "route:6413-t2",
  durationSeconds: 2_700,
  departureDateTime: "20260821T232900",
  arrivalDateTime: "20260822T001400",
  transferCount: 1,
  sections: [{
    type: "boarding",
    mode: "boarding",
    durationSeconds: 0,
  }, {
    type: "walking",
    mode: "walking",
    durationSeconds: 540,
  }, {
    type: "public_transport",
    mode: "bus",
    durationSeconds: 900,
    departureDateTime: "20260821T233400",
    lineId: "line:bus:6413",
    lineCode: "6413",
    lineMode: "BUS",
  }],
  transitSections: [{
    type: "public_transport",
    mode: "bus",
    durationSeconds: 900,
    departureDateTime: "20260821T233400",
    lineId: "line:bus:6413",
    lineCode: "6413",
    lineMode: "BUS",
    lineColor: "#00843d",
    direction: "Gare Centrale",
  }],
};

describe("nearby travel alarms", () => {
  it("normalizes Navitia timestamps as local ISO timestamps", () => {
    expect(toTravelAlarmIsoDateTime("20260821T232900")).toBe("2026-08-21T23:29:00");
    expect(toTravelAlarmIsoDateTime("2026-08-21T23:29:00")).toBe("2026-08-21T23:29:00");
    expect(toTravelAlarmIsoDateTime("not-a-date")).toBeUndefined();
  });

  it("creates a stable shared alarm target at the first transport departure", () => {
    const target = createTravelRouteAlarmTarget(route, {
      origin: "Origine",
      destination: "Destination",
      departure: "Départ du trajet",
      fallback: "Trajet",
      transportTypeLabel: "Noctilien",
      safetyMinutes: 2,
    });

    expect(target).toMatchObject({
      board: {
        id: "travel-route-board:route:6413-t2",
        title: "Origine",
        line: {
          shortName: "6413",
          ref: "line:bus:6413",
          mode: "bus",
        },
      },
      departure: {
        id: "travel-route-departure:route:6413-t2",
        destination: "Destination",
        monitoringLabel: "Départ du trajet",
        expectedDepartureTime: "2026-08-21T23:34:00",
        aimedDepartureTime: "2026-08-21T23:34:00",
      },
      context: {
        initialMinutesBefore: 11,
        walkingMinutes: 9,
        safetyMinutes: 2,
        transportTypeLabel: "Noctilien",
      },
    });
    expect(target?.directionGroup.departures[0]).toBe(target?.departure);
  });
});
