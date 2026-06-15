import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLineFrequencyProfileCache,
  fetchLineFrequencyProfile,
} from "../src/services/idfm";

describe("line frequency profile", () => {
  beforeEach(() => {
    clearLineFrequencyProfileCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("calculates weekday medians lazily and caches them by line and station", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          stop_schedules: [
            {
              display_informations: {
                direction: "Terminus",
              },
              date_times: [
                { base_date_time: "20260615T070000" },
                {
                  date_time: "20260615T070300",
                  data_freshness: "realtime",
                },
                { base_date_time: "20260615T070600" },
                { base_date_time: "20260615T071200" },
                { base_date_time: "20260615T100000" },
                { base_date_time: "20260615T101200" },
                { base_date_time: "20260615T102400" },
                { base_date_time: "20260615T234000" },
                { base_date_time: "20260616T001000" },
              ],
            },
          ],
        }),
      ),
    );

    vi.stubGlobal("fetch", fetcher);

    const station = {
      id: "station:test",
      label: "Station test",
      monitoringRef: "stop:test",
      scheduleStopAreaRef: "stop_area:test",
    };
    const first = await fetchLineFrequencyProfile("line:test", station);
    const second = await fetchLineFrequencyProfile("line:test", station);

    expect(first).toEqual({
      lineId: "line:test",
      stationId: "station:test",
      serviceDate: "20260615",
      peakMinutes: 6,
      offPeakMinutes: 12,
      nightMinutes: 30,
    });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain(
      "/lines/line%3Atest/stop_areas/stop_area%3Atest/stop_schedules?",
    );
  });

  it("merges alternating Navitia schedules across platforms for the same direction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL) =>
        new Response(
          JSON.stringify({
            stop_schedules: [
              {
                stop_point: {
                  id: "stop_point:IDFM:486845",
                },
                display_informations: {
                  direction: "La Croix de Berny (Antony)",
                },
                date_times: [
                  { base_date_time: "20260615T173500" },
                  { base_date_time: "20260615T174700" },
                  { base_date_time: "20260615T175900" },
                ],
              },
              {
                stop_point: {
                  id: "stop_point:IDFM:486846",
                },
                display_informations: {
                  direction: "La Croix de Berny (Antony)",
                },
                date_times: [
                  { base_date_time: "20260615T174100" },
                  { base_date_time: "20260615T175300" },
                  { base_date_time: "20260615T180500" },
                ],
              },
            ],
          }),
        ),
      ),
    );

    const profile = await fetchLineFrequencyProfile("line:IDFM:C02528", {
      id: "stop_area:IDFM:69839",
      label: "La Croix de Berny",
      monitoringRef: "STIF:StopArea:SP:46007:",
      scheduleStopAreaRef: "stop_area:IDFM:69839",
    });

    expect(profile.peakMinutes).toBe(6);
  });

  it("falls back to a connected stop area served by the selected line", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (
        url.includes(
          "/lines/line%3Atest/stop_areas/stop_area%3AIDFM%3A100/stop_schedules?",
        )
      ) {
        return new Response(null, { status: 404 });
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A100/connections?")) {
        return new Response(
          JSON.stringify({
            connections: [],
            pagination: {
              items_on_page: 0,
              items_per_page: 80,
              start_page: 0,
              total_result: 0,
            },
          }),
        );
      }

      if (
        url.includes("/stop_areas/stop_area%3AIDFM%3A100/places_nearby?")
      ) {
        return new Response(
          JSON.stringify({
            places_nearby: [
              {
                distance: "40",
                stop_area: {
                  id: "stop_area:IDFM:101",
                  name: "Station test",
                },
              },
            ],
            pagination: {
              items_on_page: 1,
              items_per_page: 32,
              start_page: 0,
              total_result: 1,
            },
          }),
        );
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A101/lines?")) {
        return new Response(
          JSON.stringify({
            lines: [{ id: "line:test" }],
            pagination: {
              items_on_page: 1,
              items_per_page: 80,
              start_page: 0,
              total_result: 1,
            },
          }),
        );
      }

      if (
        url.includes(
          "/lines/line%3Atest/stop_areas/stop_area%3AIDFM%3A101/stop_schedules?",
        )
      ) {
        return new Response(
          JSON.stringify({
            stop_schedules: [
              {
                stop_point: {
                  id: "stop_point:related",
                },
                display_informations: {
                  direction: "Terminus",
                },
                date_times: [
                  { base_date_time: "20260615T070000" },
                  { base_date_time: "20260615T070800" },
                  { base_date_time: "20260615T071600" },
                ],
              },
            ],
          }),
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetcher);

    const profile = await fetchLineFrequencyProfile("line:test", {
      id: "station:connected",
      label: "Station test",
      monitoringRef: "stop:test",
      scheduleStopAreaRef: "stop_area:IDFM:100",
    });

    expect(profile.peakMinutes).toBe(8);
    expect(
      fetcher.mock.calls.some(([input]) =>
        String(input).includes(
          "/stop_areas/stop_area%3AIDFM%3A101/stop_schedules?",
        ),
      ),
    ).toBe(true);
  });

  it("does not merge consecutive nearby stops into a false one-minute frequency", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (
        url.includes(
          "/lines/line%3Atest/stop_areas/stop_area%3AIDFM%3A200/stop_schedules?",
        )
      ) {
        return new Response(null, { status: 404 });
      }

      if (url.includes("/stop_areas/stop_area%3AIDFM%3A200/connections?")) {
        return new Response(
          JSON.stringify({
            connections: [],
            pagination: {
              items_on_page: 0,
              items_per_page: 80,
              start_page: 0,
              total_result: 0,
            },
          }),
        );
      }

      if (
        url.includes("/stop_areas/stop_area%3AIDFM%3A200/places_nearby?")
      ) {
        return new Response(
          JSON.stringify({
            places_nearby: [
              {
                distance: "20",
                stop_area: {
                  id: "stop_area:IDFM:201",
                  name: "Station test",
                },
              },
              {
                distance: "40",
                stop_area: {
                  id: "stop_area:IDFM:202",
                  name: "Station test",
                },
              },
            ],
            pagination: {
              items_on_page: 2,
              items_per_page: 32,
              start_page: 0,
              total_result: 2,
            },
          }),
        );
      }

      if (
        url.includes("/stop_areas/stop_area%3AIDFM%3A201/lines?") ||
        url.includes("/stop_areas/stop_area%3AIDFM%3A202/lines?")
      ) {
        return new Response(
          JSON.stringify({
            lines: [{ id: "line:test" }],
            pagination: {
              items_on_page: 1,
              items_per_page: 80,
              start_page: 0,
              total_result: 1,
            },
          }),
        );
      }

      if (
        url.includes(
          "/lines/line%3Atest/stop_areas/stop_area%3AIDFM%3A201/stop_schedules?",
        )
      ) {
        return new Response(
          JSON.stringify({
            stop_schedules: [
              {
                display_informations: {
                  direction: "Terminus",
                },
                date_times: [
                  { base_date_time: "20260616T010000" },
                  { base_date_time: "20260616T013000" },
                  { base_date_time: "20260616T020000" },
                ],
              },
            ],
          }),
        );
      }

      if (
        url.includes(
          "/lines/line%3Atest/stop_areas/stop_area%3AIDFM%3A202/stop_schedules?",
        )
      ) {
        return new Response(
          JSON.stringify({
            stop_schedules: [
              {
                display_informations: {
                  direction: "Terminus",
                },
                date_times: [
                  { base_date_time: "20260616T010100" },
                  { base_date_time: "20260616T013100" },
                  { base_date_time: "20260616T020100" },
                ],
              },
            ],
          }),
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetcher);

    const profile = await fetchLineFrequencyProfile("line:test", {
      id: "station:connected",
      label: "Station test",
      monitoringRef: "stop:test",
      scheduleStopAreaRef: "stop_area:IDFM:200",
    });

    expect(profile.nightMinutes).toBe(30);
    expect(
      fetcher.mock.calls.some(([input]) =>
        String(input).includes(
          "/stop_areas/stop_area%3AIDFM%3A202/stop_schedules?",
        ),
      ),
    ).toBe(false);
  });
});
