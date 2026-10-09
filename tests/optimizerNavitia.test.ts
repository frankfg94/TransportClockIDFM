import { describe, expect, it, vi } from "vitest";
import { fetchNavitiaJourneys } from "../src/services/idfm";
import { applyNavitiaCourseTiming } from "../src/services/travelRoutes/travelTurboProvider";
import { turboTime } from "../src/features/nearby-stations/travelTurbo";

describe("optimizer live routing", () => {
  it("requests real-time journeys and preserves provider timing provenance", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      expect(url.searchParams.get("data_freshness")).toBe("realtime");
      expect(url.searchParams.get("disable_disruption")).toBe("false");
      return new Response(
        JSON.stringify({
          journeys: [
            {
              duration: 1200,
              sections: [
                {
                  type: "public_transport",
                  duration: 1200,
                  data_freshness: "realtime",
                  departure_date_time: "20261008T100300",
                  arrival_date_time: "20261008T102300",
                  base_departure_date_time: "20261008T100000",
                  base_arrival_date_time: "20261008T102000",
                  display_informations: { code: "B", commercial_mode: "RER" },
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    });
    const journeys = await fetchNavitiaJourneys(
      {
        origin: { lon: 2.3, lat: 48.8 },
        destination: { lon: 2.35, lat: 48.86 },
        dataFreshness: "realtime",
        includeDisruptions: true,
      },
      { fetcher },
    );
    expect(journeys[0]?.sections[0]).toMatchObject({
      timingSource: "realtime",
      departureDateTime: "20261008T100300",
      baseDepartureDateTime: "20261008T100000",
    });
  });
  it("does not label an unconfirmed departure as real-time just because live routing was requested", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            journeys: [
              {
                duration: 300,
                sections: [
                  {
                    type: "public_transport",
                    duration: 300,
                    departure_date_time: "20261008T100000",
                    arrival_date_time: "20261008T100500",
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const journeys = await fetchNavitiaJourneys(
      {
        origin: { lon: 2.3, lat: 48.8 },
        destination: { lon: 2.35, lat: 48.86 },
        dataFreshness: "realtime",
      },
      { fetcher },
    );
    expect(journeys[0]?.sections[0]?.timingSource).toBe("schedule");
  });
});

describe("dated Navitia prediction reuse", () => {
  const start = turboTime("20261008T100000")!;
  const course = {
    id: "trip",
    vehicleJourneyId: "vehicle_journey:trip",
    departure: start,
    arrival: start + 1200_000,
    baseDeparture: start,
    baseArrival: start + 1200_000,
    source: "schedule" as const,
  };
  const section = {
    durationSeconds: 1200,
    vehicleJourneyId: "vehicle_journey:trip",
    timingSource: "realtime" as const,
    timingObservedAt: new Date(start).toISOString(),
    baseDepartureDateTime: "20261008T100000",
    baseArrivalDateTime: "20261008T102000",
    departureDateTime: "20261008T100300",
    arrivalDateTime: "20261008T102300",
  };
  it("keeps a fresh live prediction for the same dated service", () => {
    expect(applyNavitiaCourseTiming(course, section, start)).toMatchObject({
      source: "realtime",
      departure: start + 180_000,
      arrival: start + 1380_000,
    });
  });
  it("rejects stale observations, other missions and different service days", () => {
    expect(
      applyNavitiaCourseTiming(
        course,
        { ...section, timingObservedAt: new Date(start - 121_000).toISOString() },
        start,
      ),
    ).toEqual(course);
    expect(
      applyNavitiaCourseTiming(
        course,
        { ...section, vehicleJourneyId: "vehicle_journey:other" },
        start,
      ),
    ).toEqual(course);
    expect(
      applyNavitiaCourseTiming(
        course,
        { ...section, baseDepartureDateTime: "20261009T100000" },
        start,
      ),
    ).toEqual(course);
  });
});
